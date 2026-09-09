import crypto from 'crypto';
import { query } from '../db/index.js';
import { pruneUserAuditLogs } from '../db/audit.js';
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

const SANITIZED_KEYS = ['password', 'secret', 'secret_key', 'access_key', 'token', 'cvv', 'card_number', 'key', 'payload', 'encrypted_config'];

/**
 * Sanitize metadata objects to guarantee no credentials or secrets are ever recorded in audit logs.
 */
export function sanitizeAuditMetadata(data) {
  if (!data || typeof data !== 'object') return {};

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase();
    if (SANITIZED_KEYS.some((bad) => lowerKey.includes(bad))) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeAuditMetadata(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Record a security audit log event in the database and prune old logs beyond 100.
 */
export async function logAuditEvent({
  userId = null,
  action,
  status = 'SUCCESS',
  ipAddress = '127.0.0.1',
  userAgent = '',
  metadata = {},
  token = null,
}) {
  if (!userId || !action) return;

  try {
    const id = crypto.randomUUID();
    const cleanMeta = sanitizeAuditMetadata(metadata);
    const now = new Date().toISOString();
    const safeIp = (ipAddress || '127.0.0.1').toString().substring(0, 45);
    const safeUserAgent = (userAgent || '').toString().substring(0, 255);

    let supabaseLogged = false;
    const supabase = getSupabaseAuditClient(token);
    if (supabase) {
      try {
        const { error } = await supabase.from('audit_logs').insert([
          {
            id,
            user_id: userId,
            action,
            status,
            ip_address: safeIp,
            user_agent: safeUserAgent,
            metadata: cleanMeta,
            created_at: now,
          },
        ]);
        if (!error) {
          supabaseLogged = true;
        }
      } catch (sbErr) {
        console.warn('Supabase audit log write notice:', sbErr.message);
      }
    }

    try {
      await query(
        `INSERT INTO audit_logs (id, user_id, action, status, ip_address, user_agent, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [id, userId, action, status, safeIp, safeUserAgent, JSON.stringify(cleanMeta), now]
      );
    } catch (pgErr) {
      if (!supabaseLogged) {
        console.error('Postgres audit log insert failed:', pgErr.message);
      }
    }

    // Automatically prune old logs beyond the 100 limit asynchronously
    pruneUserAuditLogs(userId, 100, token).catch(() => {});
  } catch (err) {
    console.error('Audit logging failed:', err.message);
  }
}
