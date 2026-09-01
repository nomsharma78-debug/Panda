import { query } from '../db/index.js';
import { generateSecureId } from '../crypto/encryption.js';
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
 * Record a security audit log event in the database.
 */
export async function logAuditEvent({
  userId = null,
  action,
  status = 'SUCCESS',
  ipAddress = '127.0.0.1',
  userAgent = '',
  metadata = {},
}) {
  try {
    const id = generateSecureId();
    const cleanMeta = sanitizeAuditMetadata(metadata);
    const now = new Date().toISOString();

    const supabase = getSupabaseAuditClient();
    if (supabase && userId) {
      try {
        await supabase.from('audit_logs').insert([
          {
            id,
            user_id: userId,
            action,
            status,
            ip_address: ipAddress,
            user_agent: (userAgent || '').substring(0, 255),
            metadata: cleanMeta,
            created_at: now,
          },
        ]);
        return;
      } catch (sbErr) {
        console.warn('Supabase audit log write notice:', sbErr.message);
      }
    }

    if (userId) {
      await query(
        `INSERT INTO audit_logs (id, user_id, action, status, ip_address, user_agent, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, userId, action, status, ipAddress, (userAgent || '').substring(0, 255), JSON.stringify(cleanMeta), now]
      );
    }
  } catch (err) {
    console.error('Audit logging failed:', err.message);
  }
}
