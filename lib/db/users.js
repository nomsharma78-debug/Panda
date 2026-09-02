import { queryAuth, queryVault } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import { hashPassword } from '../crypto/argon2.js';
import {
  isSupabaseConfigured,
  getSupabaseAdminClient,
  getSupabaseServerClient,
  getSupabaseServerVaultClient,
} from '../auth/supabase.js';

function getSupabaseUserClient() {
  return getSupabaseAdminClient() || getSupabaseServerClient();
}

function getSupabaseVaultUserClient() {
  return getSupabaseAdminClient() || getSupabaseServerVaultClient();
}

/**
 * Synchronize a Supabase Auth user with Panda's PostgreSQL users tables.
 * Ensures Panda's public.users.id, email, full name, and password hash are strictly linked.
 */
export async function syncSupabaseUser({ id, email, name = null, password = null, passwordHash = null }) {
  if (!id || !email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name ? name.trim() : null;
  const now = new Date().toISOString();

  let finalPasswordHash = passwordHash || null;
  if (!finalPasswordHash && password) {
    try {
      finalPasswordHash = await hashPassword(password);
    } catch {}
  }

  // 1. Supabase REST Upsert
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseUserClient();
    if (supabase) {
      try {
        const payload = {
          id,
          email: normalizedEmail,
          name: trimmedName,
          updated_at: now,
        };
        if (finalPasswordHash) {
          payload.password_hash = finalPasswordHash;
        }

        await supabase.from('users').upsert(payload, { onConflict: 'id' });
      } catch (err) {
        console.warn('Supabase DB1 users sync note:', err.message);
      }
    }

    const supabaseVault = getSupabaseVaultUserClient();
    if (supabaseVault) {
      try {
        await supabaseVault.from('users').upsert(
          {
            id,
            email: normalizedEmail,
            name: trimmedName,
            updated_at: now,
          },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.warn('Supabase DB2 users sync note:', err.message);
      }
    }
  }

  // 2. Direct PostgreSQL Sync
  try {
    if (finalPasswordHash) {
      await queryAuth(
        `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = COALESCE(EXCLUDED.name, users.name),
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
           updated_at = EXCLUDED.updated_at`,
        [id, normalizedEmail, trimmedName, finalPasswordHash, now, now]
      );
    } else {
      await queryAuth(
        `INSERT INTO users (id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = COALESCE(EXCLUDED.name, users.name),
           updated_at = EXCLUDED.updated_at`,
        [id, normalizedEmail, trimmedName, now, now]
      );
    }
  } catch {}

  try {
    await queryVault(
      `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         name = COALESCE(EXCLUDED.name, users.name),
         updated_at = EXCLUDED.updated_at`,
      [id, normalizedEmail, trimmedName, now, now]
    );
  } catch {}

  return {
    id,
    email: normalizedEmail,
    name: trimmedName,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Create a new user in both databases with optional full name
 */
export async function createUser(email, passwordHash = null, customId = null, name = null) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name ? name.trim() : null;
  const now = new Date().toISOString();

  // Check if user already exists by email
  const existing = await findUserByEmail(normalizedEmail);
  const id = customId || existing?.id || generateSecureId();

  // 1. Supabase REST Upsert
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseUserClient();
    if (supabase) {
      try {
        await supabase.from('users').upsert(
          {
            id,
            email: normalizedEmail,
            name: trimmedName,
            password_hash: passwordHash,
            updated_at: now,
          },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.warn('Supabase DB1 createUser note:', err.message);
      }
    }

    const supabaseVault = getSupabaseVaultUserClient();
    if (supabaseVault) {
      try {
        await supabaseVault.from('users').upsert(
          {
            id,
            email: normalizedEmail,
            name: trimmedName,
            updated_at: now,
          },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.warn('Supabase DB2 createUser note:', err.message);
      }
    }
  }

  // 2. PostgreSQL / Local DB Sync
  try {
    await queryAuth(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
         updated_at = EXCLUDED.updated_at`,
      [id, normalizedEmail, trimmedName, passwordHash, now, now]
    );
  } catch (err) {
    await queryAuth(
      `UPDATE users SET name = COALESCE($1, name), password_hash = COALESCE($2, password_hash), updated_at = $3 WHERE email = $4`,
      [trimmedName, passwordHash, now, normalizedEmail]
    ).catch(() => {});
  }

  try {
    await queryVault(
      `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         updated_at = EXCLUDED.updated_at`,
      [id, normalizedEmail, trimmedName, now, now]
    );
  } catch (err) {
    await queryVault(
      `UPDATE users SET name = COALESCE($1, name), updated_at = $2 WHERE email = $3`,
      [trimmedName, now, normalizedEmail]
    ).catch(() => {});
  }

  return {
    id,
    email: normalizedEmail,
    name: trimmedName || existing?.name || null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
}

/**
 * Find a user by email from the Auth DB / Supabase table
 */
export async function findUserByEmail(email) {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  // 1. If Supabase is configured, check Supabase
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseUserClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, password_hash, created_at, updated_at')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      } catch {}
    }
  }

  // 2. Direct PostgreSQL Auth DB query
  try {
    const { rows } = await queryAuth(
      `SELECT id, email, name, password_hash, created_at, updated_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    if (rows && rows.length > 0) return rows[0];
  } catch {}

  try {
    const { rows } = await queryVault(
      `SELECT id, email, name, password_hash, created_at, updated_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    if (rows && rows.length > 0) return rows[0];
  } catch {}

  return null;
}

/**
 * Find user by ID (never returns password_hash)
 */
export async function findUserById(id) {
  if (!id) return null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseUserClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, inactivity_timeout_minutes, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) return data;
      } catch {}
    }
  }

  try {
    const { rows } = await queryVault(
      `SELECT id, email, name, inactivity_timeout_minutes, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (rows && rows.length > 0) return rows[0];
  } catch {}

  try {
    const { rows: authRows } = await queryAuth(
      `SELECT id, email, name, inactivity_timeout_minutes, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (authRows && authRows.length > 0) return authRows[0];
  } catch {}

  return null;
}

/**
 * Update user full name
 */
export async function updateUserName(id, name) {
  if (!id) return false;
  const now = new Date().toISOString();
  const trimmedName = name ? name.trim() : null;

  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseUserClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth.from('users').update({ name: trimmedName, updated_at: now }).eq('id', id);
      } catch {}
    }
    const supabaseVault = getSupabaseVaultUserClient();
    if (supabaseVault) {
      try {
        await supabaseVault.from('users').update({ name: trimmedName, updated_at: now }).eq('id', id);
      } catch {}
    }
  }

  try {
    await queryAuth(`UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`, [trimmedName, now, id]);
  } catch {}

  try {
    await queryVault(`UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`, [trimmedName, now, id]);
  } catch {}

  return true;
}

/**
 * Update user inactivity timeout preference across all devices
 */
export async function updateUserInactivityTimeout(id, minutes) {
  if (!id) return false;
  const mins = Math.max(1, parseInt(minutes, 10) || 15);
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseUserClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth.from('users').update({ inactivity_timeout_minutes: mins, updated_at: now }).eq('id', id);
      } catch {}
    }
    const supabaseVault = getSupabaseVaultUserClient();
    if (supabaseVault) {
      try {
        await supabaseVault.from('users').update({ inactivity_timeout_minutes: mins, updated_at: now }).eq('id', id);
      } catch {}
    }
  }

  try {
    await queryAuth(`UPDATE users SET inactivity_timeout_minutes = $1, updated_at = $2 WHERE id = $3`, [mins, now, id]);
  } catch {}

  try {
    await queryVault(`UPDATE users SET inactivity_timeout_minutes = $1, updated_at = $2 WHERE id = $3`, [mins, now, id]);
  } catch {}

  return true;
}

/**
 * Update user password hash in the Auth DB
 */
export async function updateUserPassword(id, newPasswordHash) {
  if (!id || !newPasswordHash) return false;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseUserClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth.from('users').update({ password_hash: newPasswordHash, updated_at: now }).eq('id', id);
      } catch {}
    }
  }

  const result = await queryAuth(
    `UPDATE users
     SET password_hash = $1, updated_at = $2
     WHERE id = $3`,
    [newPasswordHash, now, id]
  );

  return result.rowCount > 0;
}
