import { query } from './index.js';
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
  isSupabaseConfigured,
  getSupabaseVaultAdminClient,
  isVaultSupabaseConfigured,
} from '../auth/supabase.js';

function getSupabaseAuditClient(token = null) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseAdminClient() || getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient() || (token ? getSupabaseServerClient(token) : null);
  }
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  return null;
}

/**
 * List recent audit log entries for a user.
 */
export async function listUserAuditLogs(userId, limit = 50, token = null) {
  if (!userId) return [];

  const supabase = getSupabaseAuditClient(token);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, action, status, ip_address, user_agent, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data.map((row) => ({
          ...row,
          metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
        }));
      }
    } catch (sbErr) {
      console.warn('Supabase audit log read notice:', sbErr.message);
    }
  }

  try {
    const { rows } = await query(
      `SELECT id, user_id, action, status, ip_address, user_agent, metadata, created_at
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map((row) => ({
        ...row,
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
      }));
    }
  } catch {}

  return [];
}

