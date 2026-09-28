import { NextResponse } from 'next/server';
import { queryAuth, queryVault } from '@/lib/db';
import { isSupabaseConfigured, getSupabaseAdminClient } from '@/lib/auth/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = {
    authDb: false,
    vaultDb: false,
    supabase: false,
  };

  // 1. Read-only ping to PostgreSQL Database 1 (Auth DB)
  try {
    const resAuth = await queryAuth('SELECT 1 as ping');
    checks.authDb = resAuth?.rows?.[0]?.ping === 1 || resAuth?.rows?.[0]?.ping === '1';
  } catch (err) {
    checks.authDbError = err.message;
  }

  // 2. Read-only ping to PostgreSQL Database 2 (Vault DB)
  try {
    const resVault = await queryVault('SELECT 1 as ping');
    checks.vaultDb = resVault?.rows?.[0]?.ping === 1 || resVault?.rows?.[0]?.ping === '1';
  } catch (err) {
    checks.vaultDbError = err.message;
  }

  // 3. Read-only ping to Supabase PostgREST (keeps Supabase free tier active)
  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        const { data, error } = await supabase.from('users').select('id').limit(1);
        checks.supabase = !error;
      }
    }
  } catch (err) {
    checks.supabaseError = err.message;
  }

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
