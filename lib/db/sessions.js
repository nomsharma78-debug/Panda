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
        } catch { }
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
    } catch { }
  }

  return {
    sessionId,
    rawToken,
    expiresAt,
  };
}

/**
 * Touch an existing session's activity timestamp and client metadata.
 * @param {string} sessionId
 * @param {{ userAgent?: string, ipAddress?: string }} metadata
 */
export async function touchDeviceSession(sessionId, userAgent = '', ipAddress = '') {
  if (!sessionId) return true;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    if (supabase) {
      try {
        const updateData = { last_active_at: now };
        if (userAgent) updateData.user_agent = userAgent;
        if (ipAddress) updateData.ip_address = ipAddress;
        await supabase.from('sessions').update(updateData).eq('id', sessionId);
      } catch { }
    }
  }

  try {
    if (userAgent && ipAddress) {
      await queryAuth(
        `UPDATE sessions SET last_active_at = $1, user_agent = $2, ip_address = $3 WHERE id = $4`,
        [now, userAgent, ipAddress, sessionId]
      );
    } else {
      await queryAuth(`UPDATE sessions SET last_active_at = $1 WHERE id = $2`, [now, sessionId]);
    }
  } catch { }

  return true;
}

export const recordDeviceSession = touchDeviceSession;

/**
 * Validate a raw session token and return the associated user from the Auth Database.
 * @param {string} rawToken - Session token from HTTP-only cookie.
 * @returns {Promise<{ user: object, session: object } | null>}
 */
export async function validateSessionToken(rawToken, metadata = {}) {
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

          // Update last_active_at and user_agent/ip in background
          const updateFields = { last_active_at: now };
          if (metadata.userAgent && (!session.user_agent || metadata.userAgent !== session.user_agent)) {
            updateFields.user_agent = metadata.userAgent;
          }
          if (metadata.ipAddress && (!session.ip_address || metadata.ipAddress !== session.ip_address)) {
            updateFields.ip_address = metadata.ipAddress;
          }

          supabase
            .from('sessions')
            .update(updateFields)
            .eq('id', session.id)
            .then(() => { })
            .catch(() => { });

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
              userAgent: updateFields.user_agent || session.user_agent || '',
              ipAddress: updateFields.ip_address || session.ip_address || '',
              lastActiveAt: now,
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
      } catch { }
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

      // Update last active and user_agent
      if (metadata.userAgent || metadata.ipAddress) {
        queryAuth(
          `UPDATE sessions SET last_active_at = $1, user_agent = COALESCE($2, user_agent), ip_address = COALESCE($3, ip_address) WHERE id = $4`,
          [now, metadata.userAgent || null, metadata.ipAddress || null, session.id]
        ).catch(() => { });
      } else {
        queryAuth(`UPDATE sessions SET last_active_at = $1 WHERE id = $2`, [now, session.id]).catch(() => { });
      }

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
          userAgent: metadata.userAgent || session.user_agent || '',
          ipAddress: metadata.ipAddress || session.ip_address || '',
          lastActiveAt: now,
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
  } catch { }

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
      } catch { }
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  } catch { }
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
      } catch { }
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
  } catch { }

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
      } catch { }
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  } catch { }
}

export const revokeSessionByToken = invalidateSession;
export const revokeAllUserSessions = invalidateAllUserSessions;

/**
 * List active sessions for a user
 */
export async function listUserSessions(userId) {
  if (!userId) return [];
  const now = new Date().toISOString();

  let rawSessions = [];

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

        if (!error && data) {
          rawSessions = data;
        }
      } catch { }
    }
  }

  if (rawSessions.length === 0) {
    try {
      const { rows } = await queryAuth(
        `SELECT id, user_id, user_agent, ip_address, last_active_at, expires_at, created_at
         FROM sessions
         WHERE user_id = $1 AND expires_at > $2
         ORDER BY created_at DESC`,
        [userId, now]
      );
      rawSessions = rows || [];
    } catch {
      rawSessions = [];
    }
  }

  return rawSessions.map((s) => ({
    id: s.id,
    userId: s.user_id || s.userId,
    user_id: s.user_id || s.userId,
    userAgent: s.user_agent || s.userAgent || '',
    user_agent: s.user_agent || s.userAgent || '',
    ipAddress: s.ip_address || s.ipAddress || '',
    ip_address: s.ip_address || s.ipAddress || '',
    lastActiveAt: s.last_active_at || s.lastActiveAt || s.created_at,
    last_active_at: s.last_active_at || s.lastActiveAt || s.created_at,
    expiresAt: s.expires_at || s.expiresAt,
    expires_at: s.expires_at || s.expiresAt,
    createdAt: s.created_at || s.createdAt,
    created_at: s.created_at || s.createdAt,
  }));
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
      } catch { }
    }
  }

  try {
    await queryAuth(`DELETE FROM sessions WHERE expires_at < $1`, [now]);
  } catch { }
}
