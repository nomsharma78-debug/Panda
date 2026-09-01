import { queryAuth } from './index.js';
import { generateSecureId, sha256 } from '../crypto/encryption.js';
import { isSupabaseConfigured, getSupabaseServerClient } from '../auth/supabase.js';
import { findUserById } from './users.js';

const SESSION_DURATION_DAYS = 14;

/**
 * Create a new session in the Auth Database for an authenticated user.
 * @param {string} userId - User ID.
 * @returns {Promise<{ sessionId: string, rawToken: string, expiresAt: Date }>}
 */
export async function createSession(userId) {
  const sessionId = generateSecureId();
  const rawToken = generateSecureId(32);
  const tokenHash = sha256(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  const expiresAtIso = expiresAt.toISOString();
  const now = new Date().toISOString();

  // 1. Supabase REST Session Insert
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
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
      } catch (sbErr) {
        console.warn('Supabase session write notice:', sbErr.message);
      }
    }
  }

  // 2. PostgreSQL / Local DB
  try {
    await queryAuth(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, tokenHash, expiresAtIso, now]
    );
  } catch {}

  return {
    sessionId,
    rawToken,
    expiresAt,
  };
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
    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        const { data: session, error } = await supabase
          .from('sessions')
          .select('id, user_id, expires_at, created_at')
          .eq('token_hash', tokenHash)
          .maybeSingle();

        if (!error && session) {
          if (new Date(session.expires_at) < new Date(now)) {
            await supabase.from('sessions').delete().eq('id', session.id);
            return null;
          }

          const user = await findUserById(session.user_id);
          if (user) {
            return {
              session: {
                id: session.id,
                userId: session.user_id,
                expiresAt: session.expires_at,
                createdAt: session.created_at,
              },
              user: {
                id: user.id,
                email: user.email,
                name: user.name || null,
                createdAt: user.created_at,
              },
            };
          }
        }
      } catch {}
    }
  }

  // 2. PostgreSQL / Local DB Validation
  try {
    const { rows } = await queryAuth(
      `SELECT id, user_id, expires_at, created_at
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

      const user = await findUserById(session.user_id);
      if (user) {
        return {
          session: {
            id: session.id,
            userId: session.user_id,
            expiresAt: session.expires_at,
            createdAt: session.created_at,
          },
          user: {
            id: user.id,
            email: user.email,
            name: user.name || null,
            createdAt: user.created_at,
          },
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Revoke a single session (e.g. during logout)
 */
export async function revokeSessionByToken(rawToken) {
  if (!rawToken) return;
  const tokenHash = sha256(rawToken);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
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
 * Revoke all active sessions for a user (e.g. logout all devices)
 */
export async function revokeAllUserSessions(userId) {
  if (!userId) return;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
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

/**
 * List active sessions for a user
 */
export async function listUserSessions(userId) {
  if (!userId) return [];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, user_id, created_at, expires_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((r) => ({
            id: r.id,
            userId: r.user_id,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
          }));
        }
      } catch {}
    }
  }

  const { rows } = await queryAuth(
    `SELECT id, user_id, created_at, expires_at
     FROM sessions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}
