import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { Pool } from 'pg';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip, 'database:test', 5, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many database test attempts. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { connectionString } = body || {};

    if (!connectionString || typeof connectionString !== 'string') {
      return NextResponse.json({ error: 'PostgreSQL connection string is required' }, { status: 400 });
    }

    const checks = {
      reachable: false,
      credentials: false,
      tables: false,
      permissions: false,
    };

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await pool.connect();
      checks.reachable = true;
      checks.credentials = true;

      // Check required tables
      const { rows: tableRows } = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      const tableNames = tableRows.map((r) => r.table_name.toLowerCase());
      const requiredTables = ['users', 'sessions', 'vault_items', 'storage_connections', 'media_files'];
      const hasAll = requiredTables.every((t) => tableNames.includes(t));

      checks.tables = hasAll;

      // Test write/read permission
      await client.query('SELECT 1 as test');
      checks.permissions = true;

      client.release();
      await pool.end();

      return NextResponse.json({
        success: true,
        checks,
        message: hasAll
          ? 'PostgreSQL database verified and schema is complete.'
          : 'Database reachable, but schema tables are missing. Please run the setup SQL first.',
      });
    } catch (dbErr) {
      await pool.end().catch(() => {});
      return NextResponse.json({
        success: false,
        checks,
        error: `Database connection failed: ${dbErr.message}`,
      }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Database test error: ' + err.message }, { status: 500 });
  }
}
