import { queryVault } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  getSupabaseServerVaultClient,
  getSupabaseAdminClient,
  getSupabaseVaultAdminClient,
  isVaultSupabaseConfigured,
  isSupabaseConfigured,
} from '../auth/supabase.js';

function getVaultClient(token = null) {
  if (process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseVaultAdminClient() || getSupabaseAdminClient();
  }
  return getSupabaseServerVaultClient(token) || getSupabaseVaultAdminClient() || getSupabaseAdminClient();
}

/**
 * Create a new encrypted vault item in Database 2 (Panda Vault Database)
 */
export async function createVaultItem(userId, { type, encryptedPayload }, userToken = null) {
  if (!userId || !type || !encryptedPayload) {
    throw new Error('User ID, type, and encrypted payload are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();

  // 1. Ensure user reference exists in Vault DB (to satisfy foreign key if present)
  try {
    const supabase = getVaultClient(userToken);
    if (supabase) {
      await supabase.from('users').upsert(
        { id: userId, email: `${userId}@vault.user`, updated_at: now },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
  } catch {}

  try {
    await queryVault(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@vault.user`, now, now]
    );
  } catch {}

  let lastErr = null;

  // 2. Try Supabase REST Client
  if (isVaultSupabaseConfigured() || isSupabaseConfigured()) {
    try {
      const supabase = getVaultClient(userToken);
      if (supabase) {
        const { data, error } = await supabase
          .from('vault_items')
          .insert([
            {
              id,
              user_id: userId,
              type,
              encrypted_payload: encryptedPayload,
              created_at: now,
              updated_at: now,
            },
          ])
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        if (error) {
          lastErr = error.message;
          console.error('[Vault DB] Supabase vault_items insert error:', error.message);
        }
      }
    } catch (sbErr) {
      lastErr = sbErr.message;
      console.error('[Vault DB] Supabase write notice:', sbErr.message);
    }
  }

  // 3. Direct SQL query fallback
  try {
    const result = await queryVault(
      `INSERT INTO vault_items (id, user_id, type, encrypted_payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, type, encryptedPayload, now, now]
    );

    if (result.rows && result.rows.length > 0) {
      return result.rows[0];
    }
  } catch (sqlErr) {
    console.error('[Vault DB] SQL insert error:', sqlErr.message);
    lastErr = sqlErr.message;
  }

  if (lastErr) {
    throw new Error(`Database save failed: ${lastErr}`);
  }

  return {
    id,
    user_id: userId,
    type,
    encrypted_payload: encryptedPayload,
    created_at: now,
    updated_at: now,
  };
}

/**
 * List all vault items for a user, optionally filtered by type
 */
export async function listVaultItems(userId, type = null, userToken = null) {
  if (!userId) return [];

  // 1. Try Supabase REST Client
  if (isVaultSupabaseConfigured() || isSupabaseConfigured()) {
    try {
      const supabase = getVaultClient(userToken);
      if (supabase) {
        let q = supabase
          .from('vault_items')
          .select('id, user_id, type, encrypted_payload, created_at, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (type && type !== 'all') {
          q = q.eq('type', type);
        }

        const { data, error } = await q;
        if (!error && data) {
          return data;
        }
      }
    } catch {}
  }

  // 2. Direct SQL query fallback
  try {
    let sql = `SELECT id, user_id, type, encrypted_payload, created_at, updated_at
               FROM vault_items
               WHERE user_id = $1`;
    const params = [userId];

    if (type && type !== 'all') {
      sql += ` AND type = $2`;
      params.push(type);
    }

    sql += ` ORDER BY updated_at DESC`;

    const { rows } = await queryVault(sql, params);
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Get a single vault item by ID
 */
export async function getVaultItemById(id, userId, userToken = null) {
  if (!id) return null;

  if (isVaultSupabaseConfigured() || isSupabaseConfigured()) {
    try {
      const supabase = getVaultClient(userToken);
      if (supabase) {
        const { data, error } = await supabase
          .from('vault_items')
          .select('id, user_id, type, encrypted_payload, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      }
    } catch {}
  }

  try {
    const { rows } = await queryVault(
      `SELECT id, user_id, type, encrypted_payload, created_at, updated_at
       FROM vault_items
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Update an existing vault item
 */
export async function updateVaultItem(id, userId, { type, encryptedPayload }, userToken = null) {
  if (!id) return false;
  const now = new Date().toISOString();

  if (isVaultSupabaseConfigured() || isSupabaseConfigured()) {
    try {
      const supabase = getVaultClient(userToken);
      if (supabase) {
        const updateData = { updated_at: now };
        if (type) updateData.type = type;
        if (encryptedPayload) updateData.encrypted_payload = encryptedPayload;

        const { data, error } = await supabase
          .from('vault_items')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) {
          return data;
        }
      }
    } catch {}
  }

  const updates = [];
  const params = [];
  let paramIdx = 1;

  if (type) {
    updates.push(`type = $${paramIdx++}`);
    params.push(type);
  }
  if (encryptedPayload) {
    updates.push(`encrypted_payload = $${paramIdx++}`);
    params.push(encryptedPayload);
  }
  updates.push(`updated_at = $${paramIdx++}`);
  params.push(now);

  params.push(id);

  try {
    const result = await queryVault(
      `UPDATE vault_items
       SET ${updates.join(', ')}
       WHERE id = $${paramIdx++}
       RETURNING *`,
      params
    );

    return result.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Delete a vault item
 */
export async function deleteVaultItem(id, userId, userToken = null) {
  if (!id) return false;

  let deleted = false;

  if (isVaultSupabaseConfigured() || isSupabaseConfigured()) {
    try {
      const supabase = getVaultClient(userToken);
      if (supabase) {
        const { data, error } = await supabase
          .from('vault_items')
          .delete()
          .eq('id', id)
          .select();

        if (!error && data && data.length > 0) {
          deleted = true;
        }
      }
    } catch (sbErr) {
      console.warn('[Vault DB] Supabase delete error:', sbErr.message);
    }
  }

  try {
    const result = await queryVault(
      `DELETE FROM vault_items WHERE id = $1`,
      [id]
    );

    if (result && result.rowCount > 0) {
      deleted = true;
    }
  } catch (sqlErr) {
    console.warn('[Vault DB] SQL delete error:', sqlErr.message);
  }

  return deleted;
}

/**
 * Get count of vault items by type for dashboard statistics
 */
export async function getVaultStats(userId, userToken = null) {
  const stats = { login: 0, card: 0, note: 0, identity: 0, total: 0 };
  if (!userId) return stats;

  try {
    const items = await listVaultItems(userId, null, userToken);
    if (items && Array.isArray(items)) {
      stats.total = items.length;
      items.forEach((item) => {
        const t = (item.type || '').toLowerCase();
        if (stats[t] !== undefined) {
          stats[t]++;
        }
      });
    }
  } catch (err) {
    console.error('[Vault DB] getVaultStats error:', err);
  }

  return stats;
}
