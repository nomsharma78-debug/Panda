import { query } from './index.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseServerVaultClient,
  isSupabaseConfigured,
  getSupabaseServerClient,
} from '../auth/supabase.js';

function getSupabaseAuditClient() {
  if (isVaultSupabaseConfigured()) {
    return getSupabaseServerVaultClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseServerClient();
  }
  return null;
}

/**
 * List recent audit log entries for a user.
 */
export async function listUserAuditLogs(userId, limit = 50) {
  if (!userId) return [];

  const supabase = getSupabaseAuditClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, status, ip_address, user_agent, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map((row) => ({
          ...row,
          metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
        }));
      }
    } catch {}
  }

  const { rows } = await query(
    `SELECT id, action, status, ip_address, user_agent, metadata, created_at
     FROM audit_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
  }));
}
