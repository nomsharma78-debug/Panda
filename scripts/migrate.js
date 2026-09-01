/**
 * =========================================================================
 * PANDA DIGITAL VAULT — DUAL DATABASE MIGRATION ENGINE
 * =========================================================================
 * Executes canonical SQL migrations against the target PostgreSQL databases:
 * 1. Vault Database (VAULT_DATABASE_URL or DATABASE_URL)
 * 2. Auth Database (AUTH_DATABASE_URL or DATABASE_URL)
 *
 * Usage:
 *   node scripts/migrate.js up       # Apply all pending migrations to Vault and Auth DBs
 *   node scripts/migrate.js status   # Show migration status
 *   node scripts/migrate.js vault    # Migrate Vault Database only
 *   node scripts/migrate.js auth     # Migrate Auth Database only
 * =========================================================================
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from .env.local or .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const MIGRATIONS_DIR = path.join(projectRoot, 'migrations');

async function migrateDatabase(dbName, connectionString, migrationFiles) {
  if (!connectionString) {
    console.log(`\n[Panda Migration Engine: ${dbName}]`);
    console.log(`ℹ️  No connection string found for ${dbName}.`);
    console.log(`   (Set ${dbName === 'Vault Database' ? 'VAULT_DATABASE_URL' : 'AUTH_DATABASE_URL'} in .env.local)\n`);
    return;
  }

  console.log(`\n[Panda Migration Engine: Connecting to ${dbName}...]`);

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || connectionString.includes('supabase.co')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await client.connect();
    console.log(`✓ Connected to ${dbName} successfully.`);

    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch applied migrations
    const { rows: appliedRows } = await client.query(`
      SELECT version FROM schema_migrations ORDER BY version ASC;
    `);
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // 3. Apply pending migrations
    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (appliedVersions.has(file.version)) {
        console.log(`  • [${file.version}] ${file.filename} (already applied)`);
        continue;
      }

      console.log(`  ⚡ Executing [${file.version}] ${file.filename}...`);
      const sql = fs.readFileSync(file.fullPath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, filename, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [file.version, file.filename]
        );
        await client.query('COMMIT');
        console.log(`  ✓ Applied [${file.version}] ${file.filename}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed applying ${file.filename}:`, err.message);
        throw err;
      }
    }

    console.log(`\n🎉 ${dbName} Migration Complete! (${appliedCount} migrations applied)`);
  } catch (err) {
    console.error(`❌ Migration error on ${dbName}:`, err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const target = process.argv[2] || 'up';

  const allFiles = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => ({
          filename: f,
          version: f.match(/^(\d+)/)?.[1] || f,
          fullPath: path.join(MIGRATIONS_DIR, f),
        }))
    : [];

  const vaultFiles = allFiles.filter((f) => f.filename.includes('vault') || f.filename.includes('initial') || f.filename === '002_vault_schema.sql');
  const authFiles = allFiles.filter((f) => f.filename.includes('auth') || f.filename.includes('initial') || f.filename === '001_auth_schema.sql');

  const vaultConn = process.env.VAULT_DATABASE_URL || process.env.DATABASE_URL;
  const authConn = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

  if (!vaultConn && !authConn) {
    console.log('\n=================================================================');
    console.log('  PANDA DUAL-DATABASE MIGRATION ENGINE');
    console.log('=================================================================');
    console.log('ℹ️  No remote database connection strings configured.');
    console.log('   Panda Local SQLite / In-Memory Engine is ready for development.\n');

    const { query } = await import('../lib/db/index.js');
    for (const m of allFiles) {
      const sql = fs.readFileSync(m.fullPath, 'utf8');
      await query(sql);
      console.log(`✓ Local Engine Verified: ${m.filename}`);
    }
    return;
  }

  if (target === 'vault' || target === 'up') {
    await migrateDatabase('Vault Database', vaultConn, vaultFiles.length > 0 ? vaultFiles : allFiles);
  }

  if (target === 'auth' || target === 'up') {
    if (process.env.AUTH_DATABASE_URL && process.env.AUTH_DATABASE_URL !== vaultConn) {
      await migrateDatabase('Auth Database', authConn, authFiles.length > 0 ? authFiles : allFiles);
    }
  }
}

main().catch(console.error);
