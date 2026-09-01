import { queryVault } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import { getSupabaseServerVaultClient, isVaultSupabaseConfigured } from '../auth/supabase.js';

/**
 * Create a new encrypted vault item in Database 2 (Panda Vault Database)
 */
export async function createVaultItem(userId, { type, encryptedPayload }) {
  if (!userId || !type || !encryptedPayload) {
    throw new Error('User ID, type, and encrypted payload are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();

  // 1. Try Supabase REST Client if Database 2 Supabase URL & Anon Key are configured
  if (isVaultSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerVaultClient();
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
      }
    } catch {}
  }

  // 2. Direct SQL query fallback
  await queryVault(
    `INSERT INTO vault_items (id, user_id, type, encrypted_payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, type, encryptedPayload, now, now]
  );

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
export async function listVaultItems(userId, type = null) {
  if (!userId) return [];

  // 1. Try Supabase REST Client if Database 2 Supabase URL & Anon Key are configured
  if (isVaultSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerVaultClient();
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
  return rows;
}

/**
 * Get a single vault item with strict ownership verification
 */
export async function getVaultItemById(id, userId) {
  if (!id || !userId) return null;

  if (isVaultSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerVaultClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('vault_items')
          .select('id, user_id, type, encrypted_payload, created_at, updated_at')
          .eq('id', id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      }
    } catch {}
  }

  const { rows } = await queryVault(
    `SELECT id, user_id, type, encrypted_payload, created_at, updated_at
     FROM vault_items
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId]
  );

  return rows[0] || null;
}

/**
 * Update an existing vault item with strict ownership verification
 */
export async function updateVaultItem(id, userId, { type, encryptedPayload }) {
  if (!id || !userId) return null;

  const now = new Date().toISOString();

  if (isVaultSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerVaultClient();
      if (supabase) {
        const updates = { updated_at: now };
        if (type) updates.type = type;
        if (encryptedPayload) updates.encrypted_payload = encryptedPayload;

        const { data, error } = await supabase
          .from('vault_items')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      }
    } catch {}
  }

  let sql = `UPDATE vault_items SET updated_at = $1`;
  const params = [now, id, userId];
  let pIdx = 4;

  if (type) {
    sql += `, type = $${pIdx}`;
    params.splice(pIdx - 1, 0, type);
    pIdx++;
  }

  if (encryptedPayload) {
    sql += `, encrypted_payload = $${pIdx}`;
    params.splice(pIdx - 1, 0, encryptedPayload);
    pIdx++;
  }

  sql += ` WHERE id = $2 AND user_id = $3`;

  const result = await queryVault(sql, params);
  if (result.rowCount === 0) return null;

  return getVaultItemById(id, userId);
}

/**
 * Delete a vault item with strict ownership verification
 */
export async function deleteVaultItem(id, userId) {
  if (!id || !userId) return false;

  if (isVaultSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerVaultClient();
      if (supabase) {
        const { error } = await supabase
          .from('vault_items')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (!error) return true;
      }
    } catch {}
  }

  const result = await queryVault(
    `DELETE FROM vault_items WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result.rowCount > 0;
}

/**
 * Count vault items by category for dashboard
 */
export async function getVaultStats(userId) {
  if (!userId) return { total: 0, login: 0, card: 0, note: 0, identity: 0 };

  const { rows } = await queryVault(
    `SELECT type, count(*) as count
     FROM vault_items
     WHERE user_id = $1
     GROUP BY type`,
    [userId]
  );

  const stats = { total: 0, login: 0, card: 0, note: 0, identity: 0 };
  rows.forEach((row) => {
    const t = row.type;
    const c = parseInt(row.count, 10) || 0;
    if (stats[t] !== undefined) stats[t] = c;
    stats.total += c;
  });

  return stats;
}
