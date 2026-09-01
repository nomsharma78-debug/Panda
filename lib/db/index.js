import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let vaultPgPool = null;
let authPgPool = null;
let sqliteDb = null;
let activeEngine = null; // 'postgres' | 'sqlite'

/**
 * Initialize PostgreSQL connection pool for the Vault Database
 * (Credentials, Storage Metadata, Media Metadata, Audit Logs)
 */
async function getVaultPostgresPool() {
  if (vaultPgPool) return vaultPgPool;
  const connString = process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connString) return null;

  try {
    const { Pool } = await import('pg');
    const isCloudPg = !connString.includes('localhost') && !connString.includes('127.0.0.1');
    const pool = new Pool({
      connectionString: connString,
      ssl: isCloudPg ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    client.release();
    vaultPgPool = pool;
    activeEngine = 'postgres';
    console.log('[Panda DB] Connected to Vault Database successfully.');
    return vaultPgPool;
  } catch (err) {
    console.warn('[Panda DB] Vault PostgreSQL connection notice:', err.message);
    vaultPgPool = null;
    return null;
  }
}

/**
 * Initialize PostgreSQL connection pool for the Auth Database
 * (Users, Sessions, Identity verification)
 */
async function getAuthPostgresPool() {
  if (authPgPool) return authPgPool;
  const connString = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;
  if (!connString) return null;

  try {
    const { Pool } = await import('pg');
    const isCloudPg = !connString.includes('localhost') && !connString.includes('127.0.0.1');
    const pool = new Pool({
      connectionString: connString,
      ssl: isCloudPg ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    client.release();
    authPgPool = pool;
    console.log('[Panda DB] Connected to Auth Database successfully.');
    return authPgPool;
  } catch (err) {
    console.warn('[Panda DB] Auth PostgreSQL connection notice:', err.message);
    authPgPool = null;
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
          (r) => (record.id && r.id === record.id) || (record.email && r.email === record.email)
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

    // SELECT ... FROM <table> [alias] [LEFT JOIN ...] [WHERE ...] [ORDER BY ...] [LIMIT ...]
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z0-9_]+)?(?:\s+LEFT\s+JOIN\s+[^]+?)?(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+|\$\d+))?$/is);
    if (selectMatch) {
      const selectFields = selectMatch[1].trim();
      const table = selectMatch[2].toLowerCase();
      const whereClause = selectMatch[3];
      const orderBy = selectMatch[4];
      const limitToken = selectMatch[5];

      let records = this.data[table] ? [...this.data[table]] : [];

      if (whereClause) {
        records = records.filter((row) => this.evalWhere(row, whereClause, params));
      }

      if (orderBy) {
        const [orderCol, dir] = orderBy.trim().split(/\s+/);
        const col = orderCol.toLowerCase().replace(/^.*\./, '');
        const isDesc = dir && dir.toUpperCase() === 'DESC';
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

    // UPDATE <table> SET ... WHERE ...
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
    if (updateMatch) {
      const table = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const setPairs = setClause.split(',').map((s) => s.trim());

      let updatedCount = 0;
      (this.data[table] || []).forEach((row) => {
        if (this.evalWhere(row, whereClause, params)) {
          setPairs.forEach((pair) => {
            const [c, pHolder] = pair.split('=').map((s) => s.trim());
            const col = c.toLowerCase();
            const pMatch = pHolder.match(/\$(\d+)/);
            if (pMatch) {
              const pIndex = parseInt(pMatch[1], 10) - 1;
              row[col] = params[pIndex];
            } else if (pHolder.toUpperCase() === 'CURRENT_TIMESTAMP') {
              row[col] = new Date().toISOString();
            }
          });
          updatedCount++;
        }
      });

      if (updatedCount > 0) this.save();
      return { rows: [], rowCount: updatedCount };
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
      if (op === '<') return Number(rowVal) < Number(targetVal);
      if (op === '>') return Number(rowVal) > Number(targetVal);
      if (op === '<=') return Number(rowVal) <= Number(targetVal);
      if (op === '>=') return Number(rowVal) >= Number(targetVal);

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
    isPostgres: Boolean(vaultPgPool || authPgPool || process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL),
    isLocal: !process.env.VAULT_DATABASE_URL && !process.env.AUTH_DATABASE_URL && !process.env.DATABASE_URL,
    hasAuthDb: Boolean(process.env.AUTH_DATABASE_URL),
    hasVaultDb: Boolean(process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL),
  };
}
