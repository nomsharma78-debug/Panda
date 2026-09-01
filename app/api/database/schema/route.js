import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'vault';
    const asJson = searchParams.get('json') === 'true';

    const vaultPath = path.join(process.cwd(), 'migrations', '002_vault_schema.sql');
    const authPath = path.join(process.cwd(), 'migrations', '001_auth_schema.sql');
    const initialPath = path.join(process.cwd(), 'migrations', '001_initial_schema.sql');

    const vaultSql = fs.existsSync(vaultPath)
      ? fs.readFileSync(vaultPath, 'utf8')
      : fs.readFileSync(initialPath, 'utf8');

    const authSql = fs.existsSync(authPath)
      ? fs.readFileSync(authPath, 'utf8')
      : fs.readFileSync(initialPath, 'utf8');

    if (asJson) {
      return NextResponse.json({
        vaultSql,
        authSql,
        unifiedSql: fs.existsSync(initialPath) ? fs.readFileSync(initialPath, 'utf8') : vaultSql,
      });
    }

    let selectedSql = vaultSql;
    let filename = 'panda-vault-schema.sql';

    if (type === 'auth') {
      selectedSql = authSql;
      filename = 'panda-auth-schema.sql';
    } else if (type === 'unified') {
      selectedSql = fs.existsSync(initialPath) ? fs.readFileSync(initialPath, 'utf8') : vaultSql;
      filename = 'panda-unified-schema.sql';
    }

    return new Response(selectedSql, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read schema SQL: ' + err.message }, { status: 500 });
  }
}
