import { queryAuth, queryVault } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isSupabaseConfigured,
  getSupabaseServerClient,
  getSupabaseServerVaultClient,
} from '../auth/supabase.js';

/**
 * Synchronize a Supabase Auth user with Panda's PostgreSQL users tables.
 * Ensures Panda's users.id and user's full name are strictly linked to Supabase Auth User ID (UUID).
 */
export async function syncSupabaseUser({ id, email, name = null }) {
  if (!id || !email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name ? name.trim() : null;
  const now = new Date().toISOString();

  // 1. Supabase REST Upsert to DB1 (Auth Project users table)
  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseServerClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth
          .from('users')
          .upsert(
            {
              id,
              email: normalizedEmail,
              name: trimmedName,
              updated_at: now,
            },
            { onConflict: 'id' }
          );
      } catch (err) {
        console.warn('Supabase DB1 users sync note:', err.message);
      }
    }

    // Supabase REST Upsert to DB2 (Vault Project users table)
    const supabaseVault = getSupabaseServerVaultClient();
    if (supabaseVault) {
      try {
        await supabaseVault
          .from('users')
          .upsert(
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

  // 2. PostgreSQL / Local DB Sync
  try {
    await queryVault(
      `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name), updated_at = EXCLUDED.updated_at`,
      [id, normalizedEmail, trimmedName, now, now]
    );
  } catch {}

  try {
    await queryAuth(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name), updated_at = EXCLUDED.updated_at`,
      [id, normalizedEmail, trimmedName, null, now, now]
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
    const supabaseAuth = getSupabaseServerClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth.from('users').upsert(
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

    const supabaseVault = getSupabaseServerVaultClient();
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
       ON CONFLICT (email) DO UPDATE SET
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
       ON CONFLICT (email) DO UPDATE SET
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

  // 1. If Supabase is configured, Supabase is the single source of truth
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
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
        if (!error && data === null) {
          return null;
        }
      } catch {}
    }
  }

  // 2. If PostgreSQL Auth DB is explicitly configured via connection string
  if (process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL) {
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
    return null;
  }

  // 3. Fallback for offline local dev mode only (when Supabase is NOT configured)
  if (!isSupabaseConfigured()) {
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
  }

  return null;
}

/**
 * Find user by ID (never returns password_hash)
 */
export async function findUserById(id) {
  if (!id) return null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) return data;
      } catch {}
    }
  }

  try {
    const { rows } = await queryVault(
      `SELECT id, email, name, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (rows && rows.length > 0) return rows[0];
  } catch {}

  const { rows: authRows } = await queryAuth(
    `SELECT id, email, name, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return authRows[0] || null;
}

/**
 * Update user full name
 */
export async function updateUserName(id, name) {
  if (!id) return false;
  const now = new Date().toISOString();
  const trimmedName = name ? name.trim() : null;

  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseServerClient();
    if (supabaseAuth) {
      try {
        await supabaseAuth.from('users').update({ name: trimmedName, updated_at: now }).eq('id', id);
      } catch {}
    }
    const supabaseVault = getSupabaseServerVaultClient();
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
 * Update user password hash in the Auth DB
 */
export async function updateUserPassword(id, newPasswordHash) {
  if (!id || !newPasswordHash) return false;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabaseAuth = getSupabaseServerClient();
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
