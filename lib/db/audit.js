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

export const MAX_AUDIT_LOGS_PER_USER = 100;

/**
 * Prune audit logs for a user, retaining only the latest `maxLogs` (default 100) records.
 * Deletes any older entries.
 */
export async function pruneUserAuditLogs(userId, maxLogs = MAX_AUDIT_LOGS_PER_USER, token = null) {
  if (!userId) return;

  const limit = Math.max(1, parseInt(maxLogs, 10) || MAX_AUDIT_LOGS_PER_USER);

  // 1. Supabase Audit Prune
  const supabase = getSupabaseAuditClient(token);
  if (supabase) {
    try {
      // Query items starting from offset `limit`
      const { data: excessLogs, error } = await supabase
        .from('audit_logs')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(limit, limit + 250);

      if (!error && excessLogs && excessLogs.length > 0) {
        const idsToDelete = excessLogs.map((item) => item.id);
        await supabase
          .from('audit_logs')
          .delete()
          .in('id', idsToDelete);
      }
    } catch (sbErr) {
      console.warn('Supabase audit log prune notice:', sbErr.message);
    }
  }

  // 2. PostgreSQL / Local DB Prune
  try {
    const { rows } = await query(
      `SELECT id FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    if (rows && rows.length > limit) {
      const idsToDelete = rows.slice(limit).map((r) => r.id);
      for (const id of idsToDelete) {
        await query(`DELETE FROM audit_logs WHERE id = $1`, [id]);
      }
    }
  } catch (pgErr) {
    console.warn('Postgres audit log prune notice:', pgErr.message);
  }
}

/**
 * List recent audit log entries for a user (capped at 100 max).
 */
export async function listUserAuditLogs(userId, limit = MAX_AUDIT_LOGS_PER_USER, token = null) {
  if (!userId) return [];

  const safeLimit = Math.min(MAX_AUDIT_LOGS_PER_USER, Math.max(1, parseInt(limit, 10) || MAX_AUDIT_LOGS_PER_USER));

  const supabase = getSupabaseAuditClient(token);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, action, status, ip_address, user_agent, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(safeLimit);

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
      [userId, safeLimit]
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

