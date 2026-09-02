import { queryAuth } from './index.js';
import { generateSecureId, sha256 } from '../crypto/encryption.js';
import { isSupabaseConfigured, getSupabaseServerClient, getSupabaseAdminClient } from '../auth/supabase.js';
import { findUserById } from './users.js';
import { parseUserAgent } from '../utils/device.js';

const SESSION_DURATION_DAYS = 14;

function getClient() {
  return getSupabaseAdminClient() || getSupabaseServerClient();
}

/**
 * Create a new session in the Auth Database for an authenticated user.
 * @param {string} userId - User ID.
 * @param {{ userAgent?: string, ipAddress?: string }} metadata - Client device & IP metadata.
 * @returns {Promise<{ sessionId: string, rawToken: string, expiresAt: Date }>}
 */
export async function createSession(userId, metadata = {}) {
  const sessionId = generateSecureId();
  const rawToken = generateSecureId(32);
  const tokenHash = sha256(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  const expiresAtIso = expiresAt.toISOString();
  const now = new Date().toISOString();

  const userAgent = metadata.userAgent || '';
  const ipAddress = metadata.ipAddress || '';

  // 1. Supabase REST Session Insert
  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        await supabase.from('sessions').insert([
          {
            id: sessionId,
            user_id: userId,
            token_hash: tokenHash,
            user_agent: userAgent,
            ip_address: ipAddress,
            last_active_at: now,
            expires_at: expiresAtIso,
            created_at: now,
          },
        ]);
      } catch (sbErr) {
        // Fallback without extra columns if not migrated
        try {
          await supabase.from('sessions').insert([
            {
              id: sessionId,
              user_id: userId,
              token_hash: tokenHash,
              expires_at: expiresAtIso,
              created_at: now,
            },
          ]);
        } catch {}
      }
    }
  }

  // 2. PostgreSQL / Local DB
  try {
    await queryAuth(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, last_active_at, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, userId, tokenHash, userAgent, ipAddress, now, expiresAtIso, now]
    );
  } catch {
    try {
      await queryAuth(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, userId, tokenHash, expiresAtIso, now]
      );
    } catch {}
  }

  return {
    sessionId,
    rawToken,
    expiresAt,
  };
}

/**
 * Record or create a device session for a user (called on login/register/sync)
 * @param {string} userId
 * @param {{ userAgent?: string, ipAddress?: string }} metadata
 */
export async function recordDeviceSession(userId, { userAgent = '', ipAddress = '' } = {}) {
  if (!userId) return null;

  const now = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  const expiresAtIso = expiresAt.toISOString();

  // Deterministic token hash for this specific device / user combination
  const deviceIdentifier = `${userId}::${(userAgent || 'default-agent').trim()}`;
  const tokenHash = sha256(deviceIdentifier);

  // 1. Supabase REST Upsert
  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('token_hash', tokenHash)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('sessions')
            .update({
              last_active_at: now,
              expires_at: expiresAtIso,
              ip_address: ipAddress || undefined,
              user_agent: userAgent || undefined,
            })
            .eq('id', existing.id);
          return existing.id;
        } else {
          const newId = generateSecureId();
          await supabase.from('sessions').insert([
            {
              id: newId,
              user_id: userId,
              token_hash: tokenHash,
              user_agent: userAgent,
              ip_address: ipAddress,
              last_active_at: now,
              expires_at: expiresAtIso,
              created_at: now,
            },
          ]);
          return newId;
        }
      } catch (err) {
        try {
          const newId = generateSecureId();
          await supabase.from('sessions').insert([
            {
              id: newId,
              user_id: userId,
              token_hash: tokenHash,
              expires_at: expiresAtIso,
              created_at: now,
            },
          ]);
          return newId;
        } catch {}
      }
    }
  }

  // 2. Direct PostgreSQL / Local DB Upsert
  try {
    const { rows } = await queryAuth(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, last_active_at, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (token_hash) DO UPDATE SET
         last_active_at = EXCLUDED.last_active_at,
         expires_at = EXCLUDED.expires_at,
         ip_address = COALESCE(NULLIF(EXCLUDED.ip_address, ''), sessions.ip_address),
         user_agent = COALESCE(NULLIF(EXCLUDED.user_agent, ''), sessions.user_agent)
       RETURNING id`,
      [generateSecureId(), userId, tokenHash, userAgent, ipAddress, now, expiresAtIso, now]
    );
    if (rows && rows.length > 0) return rows[0].id;
  } catch (err) {
    try {
      const { rows } = await queryAuth(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at
         RETURNING id`,
        [generateSecureId(), userId, tokenHash, expiresAtIso, now]
      );
      if (rows && rows.length > 0) return rows[0].id;
    } catch {}
  }

  return null;
}

/**
 * Touch an existing session without re-creating it.
 * If the session was revoked / deleted from the DB, returns FALSE.
 * @param {string} userId 
 * @param {string} userAgent 
 * @param {string} ipAddress 
 * @returns {Promise<boolean>} True if session exists and is active, False if revoked.
 */
export async function touchDeviceSession(userId, userAgent = '', ipAddress = '') {
  if (!userId) return false;

  const now = new Date().toISOString();
  const trimmedUa = (userAgent || '').trim();
  const incomingParsed = parseUserAgent(trimmedUa);
  const deviceIdentifier = `${userId}::${trimmedUa || 'default-agent'}`;
  const tokenHash = sha256(deviceIdentifier);

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const { data: userSessions, error } = await supabase
          .from('sessions')
          .select('id, user_agent, token_hash')
          .eq('user_id', userId)
          .gt('expires_at', now);

        if (error) {
          return true; // DB read fallback
        }

        // If no sessions exist yet in the database, initialize this device session
        if (!userSessions || userSessions.length === 0) {
          await recordDeviceSession(userId, { userAgent: trimmedUa, ipAddress });
          return true;
        }

        // Match by token_hash, exact user_agent, or normalized deviceName
        const match = userSessions.find((s) => {
          if (s.token_hash === tokenHash) return true;
          if (s.user_agent && trimmedUa && s.user_agent.trim() === trimmedUa) return true;
          if (s.user_agent && trimmedUa) {
            const parsed = parseUserAgent(s.user_agent);
            if (parsed.deviceName === incomingParsed.deviceName) return true;
          }
          return false;
        });

        if (!match) {
          // Other active sessions exist, but this specific device was revoked!
          return false;
        }

        await supabase
          .from('sessions')
          .update({
            last_active_at: now,
            ip_address: ipAddress || undefined,
          })
          .eq('id', match.id);

        return true;
      } catch {
        return true;
      }
    }
  }

  try {
    const { rows } = await queryAuth(
      `SELECT id, user_agent, token_hash
       FROM sessions
       WHERE user_id = $1 AND expires_at > $2`,
      [userId, now]
    );

    if (!rows || rows.length === 0) {
      await recordDeviceSession(userId, { userAgent: trimmedUa, ipAddress });
      return true;
    }

    const match = rows.find((s) => {
      if (s.token_hash === tokenHash) return true;
      if (s.user_agent && trimmedUa && s.user_agent.trim() === trimmedUa) return true;
      if (s.user_agent && trimmedUa) {
        const parsed = parseUserAgent(s.user_agent);
        if (parsed.deviceName === incomingParsed.deviceName) return true;
      }
      return false;
    });

    if (!match) return false;

    await queryAuth(
      `UPDATE sessions
       SET last_active_at = $1, ip_address = COALESCE(NULLIF($2, ''), ip_address)
       WHERE id = $3`,
      [now, ipAddress, match.id]
    );

    return true;
  } catch {
    return true;
  }
}

/**
 * Validate a raw session token and return the associated user from the Auth Database.
 * @param {string} rawToken - Session token from HTTP-only cookie.
 * @returns {Promise<{ user: object, session: object } | null>}
 */
export async function validateSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = sha256(rawToken);
  const now = new Date().toISOString();

  // 1. Supabase REST Session Validation
  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const { data: session, error } = await supabase
          .from('sessions')
          .select('id, user_id, user_agent, ip_address, last_active_at, expires_at, created_at')
          .eq('token_hash', tokenHash)
          .maybeSingle();

        if (!error && session) {
          if (new Date(session.expires_at) < new Date(now)) {
            await supabase.from('sessions').delete().eq('id', session.id);
            return null;
          }

          // Update last_active_at in background
          supabase
            .from('sessions')
            .update({ last_active_at: now })
            .eq('id', session.id)
            .then(() => {})
            .catch(() => {});

          let user = await findUserById(session.user_id);
          if (!user) {
            user = {
              id: session.user_id,
              email: `${session.user_id}@vault.user`,
              name: null,
              createdAt: session.created_at,
            };
          }

          return {
            session: {
              id: session.id,
              userId: session.user_id,
              userAgent: session.user_agent || '',
              ipAddress: session.ip_address || '',
              lastActiveAt: session.last_active_at || session.created_at,
              expiresAt: session.expires_at,
              createdAt: session.created_at,
            },
            user: {
              id: user.id,
              email: user.email,
              name: user.name || null,
              createdAt: user.created_at || session.created_at,
            },
          };
        }
      } catch {}
    }
  }

  // 2. PostgreSQL / Local DB Validation
  try {
    const { rows } = await queryAuth(
      `SELECT id, user_id, user_agent, ip_address, last_active_at, expires_at, created_at
       FROM sessions
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (rows && rows.length > 0) {
      const session = rows[0];

      // Check expiration
      if (new Date(session.expires_at) < new Date(now)) {
        await queryAuth(`DELETE FROM sessions WHERE id = $1`, [session.id]);
        return null;
      }

      // Update last active
      queryAuth(`UPDATE sessions SET last_active_at = $1 WHERE id = $2`, [now, session.id]).catch(() => {});

      let user = await findUserById(session.user_id);
      if (!user) {
        user = {
          id: session.user_id,
          email: `${session.user_id}@vault.user`,
          name: null,
          createdAt: session.created_at,
        };
      }

      return {
        session: {
          id: session.id,
          userId: session.user_id,
          userAgent: session.user_agent || '',
          ipAddress: session.ip_address || '',
          lastActiveAt: session.last_active_at || session.created_at,
          expiresAt: session.expires_at,
          createdAt: session.created_at,
        },
        user: {
          id: user.id,
          email: user.email,
          name: user.name || null,
          createdAt: user.created_at || session.created_at,
        },
      };
    }
  } catch {}

  return null;
}

/**
 * Invalidate a session by token hash
 */
export async function invalidateSession(rawToken) {
  if (!rawToken) return;
  const tokenHash = sha256(rawToken);

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        await supabase.from('sessions').delete().eq('token_hash', tokenHash);
      } catch {}
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  } catch {}
}

/**
 * Revoke a single session by its unique ID
 */
export async function revokeSessionById(sessionId, userId) {
  if (!sessionId || !userId) return false;

  let deleted = false;

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .delete()
          .eq('id', sessionId)
          .eq('user_id', userId)
          .select();

        if (!error && data && data.length > 0) {
          deleted = true;
        }
      } catch {}
    }
  }

  try {
    const result = await queryAuth(
      `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (result && result.rowCount > 0) {
      deleted = true;
    }
  } catch {}

  return deleted;
}

/**
 * Invalidate all sessions for a given user
 */
export async function invalidateAllUserSessions(userId) {
  if (!userId) return;

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        await supabase.from('sessions').delete().eq('user_id', userId);
      } catch {}
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  } catch {}
}

export const revokeSessionByToken = invalidateSession;
export const revokeAllUserSessions = invalidateAllUserSessions;

/**
 * List active sessions for a user
 */
export async function listUserSessions(userId) {
  if (!userId) return [];
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, user_id, user_agent, ip_address, last_active_at, expires_at, created_at')
          .eq('user_id', userId)
          .gt('expires_at', now)
          .order('created_at', { ascending: false });

        if (!error && data) return data;
      } catch {}
    }
  }

  try {
    const { rows } = await queryAuth(
      `SELECT id, user_id, user_agent, ip_address, last_active_at, expires_at, created_at
       FROM sessions
       WHERE user_id = $1 AND expires_at > $2
       ORDER BY created_at DESC`,
      [userId, now]
    );
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Clean up expired sessions across database
 */
export async function cleanupExpiredSessions() {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        await supabase.from('sessions').delete().lt('expires_at', now);
      } catch {}
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE expires_at < $1`, [now]);
  } catch {}
}
