import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseVaultAdminClient,
  isSupabaseConfigured,
  getSupabaseAdminClient,
} from '../auth/supabase.js';

function getSupabaseStorageClient() {
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient();
  }
  return null;
}

/**
 * Create a new storage connection for a user.
 */
export async function createStorageConnection(userId, { provider, name, bucket = 'default', region = null, endpoint = null, encryptedConfig, isDefault = false }) {
  if (!userId || !provider || !name || !encryptedConfig) {
    throw new Error('User ID, provider, name, and encrypted config are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();

  // Ensure user reference exists in database (to satisfy foreign key if present)
  try {
    const supabase = getSupabaseStorageClient();
    if (supabase) {
      await supabase.from('users').upsert(
        { id: userId, email: `${userId}@vault.user`, updated_at: now },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
  } catch {}

  try {
    await query(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@vault.user`, now, now]
    );
  } catch {}

  // 1. Try Supabase Admin Client
  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      if (isDefault) {
        await supabase
          .from('storage_connections')
          .update({ is_default: false })
          .eq('user_id', userId);
      }

      const { error: insConnErr } = await supabase.from('storage_connections').insert([
        {
          id,
          user_id: userId,
          provider: provider.toLowerCase(),
          name: name.trim(),
          encrypted_config: encryptedConfig,
          is_default: isDefault,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (insConnErr) throw new Error(insConnErr.message);

      const usageId = generateSecureId();
      const { error: insUsageErr } = await supabase.from('storage_usage').insert([
        {
          id: usageId,
          user_id: userId,
          storage_connection_id: id,
          used_bytes: 0,
          available_bytes: 0,
          total_bytes: 0,
          last_checked_at: now,
        },
      ]);

      if (insUsageErr) throw new Error(insUsageErr.message);

      return {
        id,
        user_id: userId,
        provider: provider.toLowerCase(),
        name: name.trim(),
        is_default: isDefault,
        created_at: now,
        updated_at: now,
      };
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase storage connection write notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  // 2. PostgreSQL / Direct Pool fallback
  if (isDefault) {
    await query(
      `UPDATE storage_connections SET is_default = false WHERE user_id = $1`,
      [userId]
    );
  }

  await query(
    `INSERT INTO storage_connections (id, user_id, provider, name, encrypted_config, is_default, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, provider.toLowerCase(), name.trim(), encryptedConfig, isDefault, now, now]
  );

  // Initialize storage usage record
  const usageId = generateSecureId();
  await query(
    `INSERT INTO storage_usage (id, user_id, storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at)
     VALUES ($1, $2, $3, 0, 0, 0, $4)`,
    [usageId, userId, id, now]
  );

  return {
    id,
    user_id: userId,
    provider: provider.toLowerCase(),
    name: name.trim(),
    is_default: isDefault,
    created_at: now,
    updated_at: now,
  };
}

const PROVIDER_DEFAULT_QUOTAS = {
  b2: 10 * 1024 * 1024 * 1024,      // 10 GB Free Tier
  r2: 10 * 1024 * 1024 * 1024,      // 10 GB Free Tier
  s3: 5 * 1024 * 1024 * 1024,       // 5 GB Free Tier
  minio: 100 * 1024 * 1024 * 1024,  // 100 GB Local Tier
  wasabi: 1024 * 1024 * 1024 * 1024 // 1 TB Tier
};

/**
 * List all storage connections for a user along with their usage stats.
 * NEVER returns `encrypted_config` to the frontend!
 */
export async function listUserStorageConnections(userId) {
  if (!userId) return [];

  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      const { data: conns, error } = await supabase
        .from('storage_connections')
        .select('id, user_id, provider, name, is_default, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      if (conns && conns.length > 0) {
        let usageMap = {};
        try {
          const { data: usageRows } = await supabase
            .from('storage_usage')
            .select('storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at')
            .eq('user_id', userId);
          if (usageRows) {
            usageRows.forEach((u) => {
              usageMap[u.storage_connection_id] = u;
            });
          }
        } catch {}

        let fileCounts = {};
        try {
          const { data: mediaRows } = await supabase
            .from('media_files')
            .select('storage_connection_id, file_size')
            .eq('user_id', userId);
          if (mediaRows) {
            mediaRows.forEach((m) => {
              const connId = m.storage_connection_id;
              if (!fileCounts[connId]) {
                fileCounts[connId] = { count: 0, size: 0 };
              }
              fileCounts[connId].count += 1;
              fileCounts[connId].size += Number(m.file_size) || 0;
            });
          }
        } catch {}

        return conns.map((c) => {
          const usage = usageMap[c.id];
          const media = fileCounts[c.id] || { count: 0, size: 0 };
          const usedBytes = Math.max(Number(usage?.used_bytes) || 0, media.size);
          const defaultTotal = PROVIDER_DEFAULT_QUOTAS[c.provider.toLowerCase()] || 10 * 1024 * 1024 * 1024;
          const totalBytes = Number(usage?.total_bytes) || defaultTotal;
          const availableBytes = Math.max(0, totalBytes - usedBytes);

          return {
            id: c.id,
            user_id: c.user_id,
            provider: c.provider,
            name: c.name,
            is_default: c.is_default,
            created_at: c.created_at,
            updated_at: c.updated_at,
            file_count: media.count,
            used_bytes: usedBytes,
            available_bytes: availableBytes,
            total_bytes: totalBytes,
            last_checked_at: usage?.last_checked_at || c.created_at,
          };
        });
      }
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase listUserStorageConnections notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  try {
    const { rows } = await query(
      `SELECT sc.id, sc.user_id, sc.provider, sc.name, sc.is_default, sc.created_at, sc.updated_at,
              su.used_bytes, su.available_bytes, su.total_bytes, su.last_checked_at,
              COUNT(mf.id) AS file_count,
              COALESCE(SUM(mf.file_size), 0) AS media_size
       FROM storage_connections sc
       LEFT JOIN storage_usage su ON sc.id = su.storage_connection_id AND sc.user_id = su.user_id
       LEFT JOIN media_files mf ON sc.id = mf.storage_connection_id AND sc.user_id = mf.user_id
       WHERE sc.user_id = $1
       GROUP BY sc.id, sc.user_id, sc.provider, sc.name, sc.is_default, sc.created_at, sc.updated_at,
                su.used_bytes, su.available_bytes, su.total_bytes, su.last_checked_at
       ORDER BY sc.created_at ASC`,
      [userId]
    );

    return (rows || []).map((row) => {
      const safe = { ...row };
      delete safe.encrypted_config;
      const mediaSize = Number(safe.media_size) || 0;
      const usedBytes = Math.max(Number(safe.used_bytes) || 0, mediaSize);
      const defaultTotal = PROVIDER_DEFAULT_QUOTAS[safe.provider.toLowerCase()] || 10 * 1024 * 1024 * 1024;
      const totalBytes = Number(safe.total_bytes) || defaultTotal;
      return {
        ...safe,
        used_bytes: usedBytes,
        total_bytes: totalBytes,
        available_bytes: Math.max(0, totalBytes - usedBytes),
        file_count: Number(safe.file_count) || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get single storage connection with internal config (used SERVER-SIDE ONLY for cloud operations).
 */
export async function getStorageConnectionInternal(id, userId) {
  if (!id || !userId) return null;

  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('storage_connections')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (data) return data;
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase getStorageConnectionInternal notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  try {
    const { rows } = await query(
      `SELECT sc.id, sc.user_id, sc.provider, sc.name, sc.encrypted_config, sc.is_default, sc.created_at, sc.updated_at,
              su.used_bytes, su.available_bytes, su.total_bytes
       FROM storage_connections sc
       LEFT JOIN storage_usage su ON sc.id = su.storage_connection_id
       WHERE sc.id = $1 AND sc.user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    return (rows && rows[0]) || null;
  } catch {
    return null;
  }
}

/**
 * Get safe storage connection representation (for API responses).
 */
export async function getSafeStorageConnection(id, userId) {
  if (!id || !userId) return null;

  const item = await getStorageConnectionInternal(id, userId);
  if (!item) return null;

  const safe = { ...item };
  delete safe.encrypted_config;
  return safe;
}

/**
 * Update storage usage metrics.
 */
export async function updateStorageUsage(userId, storageConnectionId, { usedBytes, availableBytes, totalBytes }) {
  if (!userId || !storageConnectionId) return;
  const now = new Date().toISOString();

  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('storage_usage')
        .upsert(
          {
            user_id: userId,
            storage_connection_id: storageConnectionId,
            used_bytes: usedBytes,
            available_bytes: availableBytes,
            total_bytes: totalBytes,
            last_checked_at: now,
          },
          { onConflict: 'storage_connection_id' }
        );
      if (!error) return;
      throw new Error(error.message);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase updateStorageUsage notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  // Check if usage row exists
  const { rows } = await query(
    `SELECT id FROM storage_usage WHERE user_id = $1 AND storage_connection_id = $2 LIMIT 1`,
    [userId, storageConnectionId]
  );

  if (rows && rows.length > 0) {
    await query(
      `UPDATE storage_usage
       SET used_bytes = $1, available_bytes = $2, total_bytes = $3, last_checked_at = $4
       WHERE user_id = $5 AND storage_connection_id = $6`,
      [usedBytes, availableBytes, totalBytes, now, userId, storageConnectionId]
    );
  } else {
    const usageId = generateSecureId();
    await query(
      `INSERT INTO storage_usage (id, user_id, storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [usageId, userId, storageConnectionId, usedBytes, availableBytes, totalBytes, now]
    );
  }
}

/**
 * Delete a storage connection with strict ownership verification.
 */
export async function deleteStorageConnection(id, userId) {
  if (!id || !userId) return false;

  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      await supabase.from('storage_usage').delete().eq('storage_connection_id', id).eq('user_id', userId);
      const { error } = await supabase.from('storage_connections').delete().eq('id', id).eq('user_id', userId);
      if (!error) return true;
      throw new Error(error.message);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase deleteStorageConnection notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  await query(
    `DELETE FROM storage_usage WHERE storage_connection_id = $1 AND user_id = $2`,
    [id, userId]
  );

  const result = await query(
    `DELETE FROM storage_connections WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result && result.rowCount > 0;
}

/**
 * Get combined aggregate storage metrics for a user across all connected providers.
 */
export async function getCombinedStorageMetrics(userId) {
  if (!userId) return { totalBytes: 0, usedBytes: 0, availableBytes: 0, providerCount: 0 };

  const conns = await listUserStorageConnections(userId);

  let totalUsed = 0;
  let totalCap = 0;
  let totalAvail = 0;
  let hasDefinitiveQuota = false;

  conns.forEach((row) => {
    const used = Number(row.used_bytes) || 0;
    const total = Number(row.total_bytes) || 0;
    const avail = Number(row.available_bytes) || 0;

    totalUsed += used;
    if (total > 0) {
      totalCap += total;
      totalAvail += avail;
      hasDefinitiveQuota = true;
    }
  });

  return {
    totalBytes: hasDefinitiveQuota ? totalCap : null,
    usedBytes: totalUsed,
    availableBytes: hasDefinitiveQuota ? totalAvail : null,
    hasFixedQuota: hasDefinitiveQuota,
    providerCount: conns.length,
  };
}
