import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let sqliteDb = null;
let activeEngine = null; // 'postgres' | 'sqlite'
let lastVaultError = null;
let lastAuthError = null;

function getVaultConnectionString() {
  return (
    process.env.VAULT_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.AUTH_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    ''
  ).trim();
}

function getAuthConnectionString() {
  return (
    process.env.AUTH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.VAULT_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    ''
  ).trim();
}

/**
 * Initialize PostgreSQL connection pool for the Vault Database
 * (Credentials, Storage Metadata, Media Metadata, Audit Logs)
 */
async function getVaultPostgresPool() {
  if (globalThis.__pandaVaultPgPool) return globalThis.__pandaVaultPgPool;
  const connString = getVaultConnectionString();
  if (!connString) return null;

  try {
    const { Pool } = await import('pg');
    const isCloudPg = !connString.includes('localhost') && !connString.includes('127.0.0.1');
    const pool = new Pool({
      connectionString: connString,
      ssl: isCloudPg ? { rejectUnauthorized: false } : false,
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
    });

    pool.on('error', (err) => {
      console.warn('[Panda DB] Vault pool background error:', err.message);
    });

    globalThis.__pandaVaultPgPool = pool;
    activeEngine = 'postgres';
    return pool;
  } catch (err) {
    lastVaultError = err.message;
    console.error('[Panda DB] Vault PostgreSQL initialization error:', err.message);
    return null;
  }
}

/**
 * Initialize PostgreSQL connection pool for the Auth Database
 * (Users, Sessions, Identity verification)
 */
async function getAuthPostgresPool() {
  if (globalThis.__pandaAuthPgPool) return globalThis.__pandaAuthPgPool;
  const connString = getAuthConnectionString();
  if (!connString) return null;

  try {
    const { Pool } = await import('pg');
    const isCloudPg = !connString.includes('localhost') && !connString.includes('127.0.0.1');
    const pool = new Pool({
      connectionString: connString,
      ssl: isCloudPg ? { rejectUnauthorized: false } : false,
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
    });

    pool.on('error', (err) => {
      console.warn('[Panda DB] Auth pool background error:', err.message);
    });

    globalThis.__pandaAuthPgPool = pool;
    return pool;
  } catch (err) {
    lastAuthError = err.message;
    console.error('[Panda DB] Auth PostgreSQL initialization error:', err.message);
    return null;
  }
}

/**
 * In-memory / File-backed SQLite Engine fallback for local development & security tests
 */
class LocalEngine {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      schema_migrations: [],
      users: [],
      sessions: [],
      vault_items: [],
      storage_connections: [],
      storage_usage: [],
      media_files: [],
      audit_logs: [],
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Panda DB] Could not load local db file, initializing empty state.');
    }
  }

  save() {
    // Purely in-memory: do not write stale files to disk
  }

  // Robust SQL emulator for standard parameterized CRUD queries
  async query(sqlText, params = []) {
    const sql = sqlText.trim();
    const upper = sql.toUpperCase();

    // DDL statements (CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE EXTENSION) - no-op for local engine
    if (
      upper.startsWith('CREATE TABLE') ||
      upper.startsWith('CREATE INDEX') ||
      upper.startsWith('ALTER TABLE') ||
      upper.startsWith('CREATE EXTENSION')
    ) {
      return { rows: [], rowCount: 0 };
    }

    // INSERT INTO <table> (...) VALUES (...)
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1].toLowerCase();
      const columns = insertMatch[2].split(',').map((c) => c.trim().toLowerCase());
      if (!this.data[table]) this.data[table] = [];

      const record = {};
      columns.forEach((col, idx) => {
        const pIndex = idx;
        if (pIndex < params.length) {
          record[col] = params[pIndex];
        } else {
          record[col] = null;
        }
      });

      if (!record.id) {
        record.id = crypto.randomUUID();
      }
      if (!record.created_at) {
        record.created_at = new Date().toISOString();
      }
      if (record.updated_at === undefined && columns.includes('updated_at')) {
        record.updated_at = new Date().toISOString();
      }

      // Check ON CONFLICT
      if (sql.toUpperCase().includes('ON CONFLICT')) {
        const existingIdx = this.data[table].findIndex(
          (r) =>
            (record.id && r.id === record.id) ||
            (record.email && r.email === record.email) ||
            (table === 'user_storage' && record.user_id && r.user_id === record.user_id) ||
            (table === 'storage_usage' && record.storage_connection_id && r.storage_connection_id === record.storage_connection_id)
        );
        if (existingIdx >= 0) {
          this.data[table][existingIdx] = { ...this.data[table][existingIdx], ...record };
          this.save();
          return { rows: [this.data[table][existingIdx]], rowCount: 1 };
        }
      }

      this.data[table].push(record);
      this.save();
      return { rows: [record], rowCount: 1 };
    }

    // SELECT ... FROM <table> [alias] [LEFT JOIN ...] [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT ...]
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z0-9_]+)?(?:\s+LEFT\s+JOIN\s+[^]+?)?(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+|\$\d+))?$/is);
    if (selectMatch) {
      const selectFields = selectMatch[1].trim();
      const table = selectMatch[2].toLowerCase();
      const whereClause = selectMatch[3];
      const groupBy = selectMatch[4];
      const orderBy = selectMatch[5];
      const limitToken = selectMatch[6];

      let records = this.data[table] ? [...this.data[table]] : [];

      if (whereClause) {
        records = records.filter((row) => this.evalWhere(row, whereClause, params));
      }

      if (groupBy) {
        const groupCol = groupBy.trim().split(',')[0].trim().toLowerCase().replace(/^.*\./, '');
        const groups = {};
        for (const r of records) {
          const key = r[groupCol] !== undefined ? String(r[groupCol]) : 'other';
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        }

        const groupedRows = Object.entries(groups).map(([k, groupRecords]) => {
          const rowObj = { [groupCol]: k, count: groupRecords.length };
          const sumSize = groupRecords.reduce((acc, cur) => acc + (Number(cur.file_size) || 0), 0);
          rowObj.size = sumSize;
          rowObj.total_bytes = sumSize;
          return rowObj;
        });

        return { rows: groupedRows, rowCount: groupedRows.length };
      }

      if (orderBy) {
        const firstOrder = orderBy.trim().split(',')[0].trim();
        const [orderCol, dir] = firstOrder.split(/\s+/);
        const col = orderCol.toLowerCase().replace(/^.*\./, '');
        const isDesc = Boolean(dir && dir.toUpperCase().startsWith('DESC'));
        records.sort((a, b) => {
          if (a[col] < b[col]) return isDesc ? 1 : -1;
          if (a[col] > b[col]) return isDesc ? -1 : 1;
          return 0;
        });
      }

      if (limitToken) {
        let lim = parseInt(limitToken, 10);
        if (limitToken.startsWith('$')) {
          const pIndex = parseInt(limitToken.slice(1), 10) - 1;
          lim = parseInt(params[pIndex], 10);
        }
        if (!isNaN(lim) && lim > 0) {
          records = records.slice(0, lim);
        }
      }

      if (selectFields.toUpperCase() === 'COUNT(*)' || selectFields.toUpperCase().includes('COUNT(')) {
        return { rows: [{ count: records.length }], rowCount: 1 };
      }

      if (selectFields === '*' || selectFields === '') {
        return { rows: records, rowCount: records.length };
      }

      const requestedCols = selectFields.split(',').map((c) => c.trim().toLowerCase().replace(/^.*\./, ''));
      const projected = records.map((r) => {
        const item = {};
        requestedCols.forEach((col) => {
          if (col in r) item[col] = r[col];
        });
        return item;
      });

      return { rows: projected, rowCount: projected.length };
    }

    // UPDATE <table> SET ... WHERE ... [RETURNING ...]
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+RETURNING\s+(.+))?$/is);
    if (updateMatch) {
      const table = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const returningClause = updateMatch[4];

      if (!this.data[table]) this.data[table] = [];

      const setAssignments = setClause.split(',').map((s) => s.trim());
      const computedUpdates = {};

      setAssignments.forEach((assignment) => {
        const eqIdx = assignment.indexOf('=');
        if (eqIdx < 0) return;
        const rawCol = assignment.slice(0, eqIdx).trim();
        const rawExpr = assignment.slice(eqIdx + 1).trim();
        const col = rawCol.toLowerCase().replace(/^.*\./, '');
        const expr = rawExpr;

        if (expr.match(/GREATEST\s*\(\s*0\s*,\s*(\w+)\s*-\s*(\$\d+|\d+)\s*\)/i)) {
          const m = expr.match(/GREATEST\s*\(\s*0\s*,\s*(\w+)\s*-\s*(\$\d+|\d+)\s*\)/i);
          const targetCol = m[1].toLowerCase().replace(/^.*\./, '');
          const subVal = m[2].startsWith('$') ? params[parseInt(m[2].slice(1), 10) - 1] : Number(m[2]);
          computedUpdates[col] = (row) => Math.max(0, (Number(row[targetCol]) || 0) - Number(subVal));
        } else if (expr.match(/(\w+)\s*\+\s*(\$\d+|\d+)/i)) {
          const m = expr.match(/(\w+)\s*\+\s*(\$\d+|\d+)/i);
          const targetCol = m[1].toLowerCase().replace(/^.*\./, '');
          const addVal = m[2].startsWith('$') ? params[parseInt(m[2].slice(1), 10) - 1] : Number(m[2]);
          computedUpdates[col] = (row) => (Number(row[targetCol]) || 0) + Number(addVal);
        } else if (expr.startsWith('$')) {
          const pIndex = parseInt(expr.slice(1), 10) - 1;
          computedUpdates[col] = () => params[pIndex];
        } else if (expr.startsWith("'") && expr.endsWith("'")) {
          computedUpdates[col] = () => expr.slice(1, -1);
        } else if (expr.toUpperCase() === 'NULL') {
          computedUpdates[col] = () => null;
        } else {
          computedUpdates[col] = () => expr;
        }
      });

      const updatedRows = [];
      this.data[table] = this.data[table].map((row) => {
        if (this.evalWhere(row, whereClause, params)) {
          const newValues = {};
          for (const key of Object.keys(computedUpdates)) {
            newValues[key] = computedUpdates[key](row);
          }
          const updatedRow = { ...row, ...newValues, updated_at: new Date().toISOString() };
          updatedRows.push(updatedRow);
          return updatedRow;
        }
        return row;
      });

      if (updatedRows.length > 0) this.save();

      if (returningClause) {
        if (returningClause.trim() === '*') {
          return { rows: updatedRows, rowCount: updatedRows.length };
        }
        const retCols = returningClause.split(',').map((c) => c.trim().toLowerCase().replace(/^.*\./, ''));
        const projected = updatedRows.map((r) => {
          const item = {};
          retCols.forEach((col) => {
            if (col in r) item[col] = r[col];
          });
          return item;
        });
        return { rows: projected, rowCount: projected.length };
      }

      return { rows: updatedRows, rowCount: updatedRows.length };
    }

    // DELETE FROM <table> WHERE ...
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/is);
    if (deleteMatch) {
      const table = deleteMatch[1].toLowerCase();
      const whereClause = deleteMatch[2];
      const initialCount = (this.data[table] || []).length;

      if (!whereClause) {
        this.data[table] = [];
      } else {
        this.data[table] = (this.data[table] || []).filter((row) => !this.evalWhere(row, whereClause, params));
      }

      const deletedCount = initialCount - this.data[table].length;
      if (deletedCount > 0) this.save();
      return { rows: [], rowCount: deletedCount };
    }

    return { rows: [], rowCount: 0 };
  }

  evalWhere(row, whereClause, params) {
    if (!whereClause) return true;
    const parts = whereClause.split(/\s+AND\s+/i);

    return parts.every((part) => {
      // Compound expression e.g. (used_bytes + reserved_bytes + $1) <= storage_limit_bytes
      const compoundMatch = part.match(/\(([^)]+)\)\s*(<=|<|>=|>|=)\s*([a-zA-Z0-9_.]+)/i);
      if (compoundMatch) {
        let leftExpr = compoundMatch[1];
        const op = compoundMatch[2];
        const rightCol = compoundMatch[3].toLowerCase().replace(/^.*\./, '');
        const rightVal = Number(row[rightCol]) || 0;

        leftExpr = leftExpr.replace(/\$(\d+)/g, (_, idx) => Number(params[parseInt(idx, 10) - 1]) || 0);
        leftExpr = leftExpr.replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
          const c = match.toLowerCase();
          return c in row ? Number(row[c]) || 0 : match;
        });

        try {
          const leftVal = Function(`'use strict'; return (${leftExpr})`)();
          if (op === '<=') return leftVal <= rightVal;
          if (op === '<') return leftVal < rightVal;
          if (op === '>=') return leftVal >= rightVal;
          if (op === '>') return leftVal > rightVal;
          if (op === '=') return leftVal === rightVal;
        } catch {}
      }

      const isNullMatch = part.match(/([a-zA-Z0-9_.]+)\s+IS\s+NULL/i);
      if (isNullMatch) {
        const col = isNullMatch[1].toLowerCase().replace(/^.*\./, '');
        return row[col] === null || row[col] === undefined;
      }
      const isNotNullMatch = part.match(/([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL/i);
      if (isNotNullMatch) {
        const col = isNotNullMatch[1].toLowerCase().replace(/^.*\./, '');
        return row[col] !== null && row[col] !== undefined;
      }

      const eqMatch = part.match(/([a-zA-Z0-9_.]+)\s*(=|!=|<>|LIKE|ILIKE|<|>|<=|>=)\s*(\$\d+|'[^']*'|\d+|NULL)/i);
      if (!eqMatch) return true;

      const rawCol = eqMatch[1].toLowerCase();
      const col = rawCol.replace(/^.*\./, '');
      const op = eqMatch[2].toUpperCase();
      const valToken = eqMatch[3].trim();

      let targetVal = null;
      if (valToken.startsWith('$')) {
        const pIndex = parseInt(valToken.slice(1), 10) - 1;
        targetVal = params[pIndex];
      } else if (valToken.startsWith("'") && valToken.endsWith("'")) {
        targetVal = valToken.slice(1, -1);
      } else if (valToken.toUpperCase() === 'NULL') {
        targetVal = null;
      } else {
        targetVal = valToken;
      }

      const rowVal = row[col];

      if (op === '=') {
        if (targetVal === null) return rowVal === null || rowVal === undefined;
        return String(rowVal) === String(targetVal);
      }
      if (op === '!=' || op === '<>') {
        return String(rowVal) !== String(targetVal);
      }
      if (op === 'LIKE' || op === 'ILIKE') {
        const cleanPattern = String(targetVal).replace(/%/g, '.*');
        const regex = new RegExp(`^${cleanPattern}$`, op === 'ILIKE' ? 'i' : '');
        return regex.test(String(rowVal || ''));
      }
      if (op === '<') {
        if (!isNaN(Number(rowVal)) && !isNaN(Number(targetVal))) return Number(rowVal) < Number(targetVal);
        return String(rowVal) < String(targetVal);
      }
      if (op === '>') {
        if (!isNaN(Number(rowVal)) && !isNaN(Number(targetVal))) return Number(rowVal) > Number(targetVal);
        return String(rowVal) > String(targetVal);
      }
      if (op === '<=') {
        if (!isNaN(Number(rowVal)) && !isNaN(Number(targetVal))) return Number(rowVal) <= Number(targetVal);
        return String(rowVal) <= String(targetVal);
      }
      if (op === '>=') {
        if (!isNaN(Number(rowVal)) && !isNaN(Number(targetVal))) return Number(rowVal) >= Number(targetVal);
        return String(rowVal) >= String(targetVal);
      }

      return true;
    });
  }
}

function getLocalEngine() {
  if (!sqliteDb) {
    const dbPath = path.join(process.cwd(), 'data', 'panda-local-db.json');
    sqliteDb = new LocalEngine(dbPath);
    activeEngine = 'sqlite';
  }
  return sqliteDb;
}

/**
 * Universal Parameterized Query Function for Database 2 (Vault Database)
 * Handles: vault_items, storage_connections, storage_usage, media_files, audit_logs, users
 */
export async function queryVault(sql, params = []) {
  try {
    const pool = await getVaultPostgresPool();
    if (pool) {
      const result = await pool.query(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    }

    const localEngine = getLocalEngine();
    return await localEngine.query(sql, params);
  } catch (err) {
    console.error('[Panda Vault DB Query Error]:', err.message);
    throw err;
  }
}

/**
 * Universal Parameterized Query Function for Database 1 (Auth Database)
 * Handles: users (with password_hash), sessions
 */
export async function queryAuth(sql, params = []) {
  try {
    const pool = await getAuthPostgresPool();
    if (pool) {
      const result = await pool.query(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    }

    const localEngine = getLocalEngine();
    return await localEngine.query(sql, params);
  } catch (err) {
    console.error('[Panda Auth DB Query Error]:', err.message);
    throw err;
  }
}

/**
 * Default Query Function (Routes to Vault Database)
 */
export async function query(sql, params = []) {
  return queryVault(sql, params);
}

/**
 * Return current active database engine info
 */
export function getDbInfo() {
  return {
    engine: activeEngine || (process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL ? 'postgres' : 'sqlite/local'),
    isPostgres: Boolean(globalThis.__pandaVaultPgPool || globalThis.__pandaAuthPgPool || process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL),
    isLocal: !process.env.VAULT_DATABASE_URL && !process.env.AUTH_DATABASE_URL && !process.env.DATABASE_URL,
    hasAuthDb: Boolean(process.env.AUTH_DATABASE_URL),
    hasVaultDb: Boolean(process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL),
  };
}
