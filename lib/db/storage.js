import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseVaultAdminClient,
  isSupabaseConfigured,
  getSupabaseAdminClient,
  getSupabaseServerVaultClient,
  getSupabaseServerClient,
} from '../auth/supabase.js';

function getSupabaseStorageClient(token = null) {
  if (process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseVaultAdminClient() || getSupabaseAdminClient();
  }
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient();
  }
  if (token) {
    return getSupabaseServerVaultClient(token) || getSupabaseServerClient(token);
  }
  return null;
}

/**
 * Create a new storage connection for a user.
 */
export async function createStorageConnection(userId, { token = null, provider, name, bucket = 'default', region = null, endpoint = null, encryptedConfig, isDefault = false }) {
  if (!userId || !provider || !name || !encryptedConfig) {
    throw new Error('User ID, provider, name, and encrypted config are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();

  // Ensure user reference exists in database (to satisfy foreign key if present)
  try {
    const supabase = getSupabaseStorageClient(token);
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

  // 1. Try Supabase Client (authenticated with token)
  const supabase = getSupabaseStorageClient(token);
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
export async function listUserStorageConnections(userId, token = null) {
  if (!userId) return [];

  const supabase = getSupabaseStorageClient(token);
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
    const { rows: conns } = await query(
      `SELECT sc.id, sc.user_id, sc.provider, sc.name, sc.is_default, sc.created_at, sc.updated_at
       FROM storage_connections sc
       WHERE sc.user_id = $1
       ORDER BY sc.created_at ASC`,
      [userId]
    );

    if (!conns || conns.length === 0) return [];

    let usageMap = {};
    try {
      const { rows: usageRows } = await query(
        `SELECT storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at
         FROM storage_usage
         WHERE user_id = $1`,
        [userId]
      );
      if (usageRows) {
        usageRows.forEach((u) => {
          usageMap[u.storage_connection_id] = u;
        });
      }
    } catch {}

    let fileCounts = {};
    try {
      const { rows: mediaRows } = await query(
        `SELECT storage_connection_id, file_size
         FROM media_files
         WHERE user_id = $1`,
        [userId]
      );
      if (mediaRows) {
        mediaRows.forEach((m) => {
          const connId = m.storage_connection_id;
          if (connId) {
            if (!fileCounts[connId]) fileCounts[connId] = { count: 0, size: 0 };
            fileCounts[connId].count += 1;
            fileCounts[connId].size += Number(m.file_size) || 0;
          }
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
  } catch (err) {
    console.error('listUserStorageConnections error:', err);
    return [];
  }
}

/**
 * Get single storage connection with internal config (used SERVER-SIDE ONLY for cloud operations).
 */
export async function getStorageConnectionInternal(id, userId, token = null) {
  if (!id || !userId) return null;

  const supabase = getSupabaseStorageClient(token);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('storage_connections')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .limit(1);

      if (!error && data && data.length > 0) return data[0];
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
export async function getCombinedStorageMetrics(userId, token = null) {
  if (!userId) return { totalBytes: 0, usedBytes: 0, availableBytes: 0, providerCount: 0 };

  const conns = await listUserStorageConnections(userId, token);
  if (!conns || conns.length === 0) {
    return {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
      hasFixedQuota: false,
      providerCount: 0,
    };
  }

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

/**
 * Default user storage quota: 10 GB (10 * 1024 * 1024 * 1024 bytes)
 */
export const DEFAULT_USER_STORAGE_LIMIT_BYTES =
  parseInt(process.env.USER_STORAGE_LIMIT_GB || '10', 10) * 1024 * 1024 * 1024;

/**
 * Retrieve authoritative user storage record (creates initial 10GB record if missing).
 * @param {string} userId
 * @returns {Promise<{ usedBytes: number, reservedBytes: number, limitBytes: number, remainingBytes: number, percentage: number, usedGB: number, limitGB: number, remainingGB: number, lastRecalculatedAt: string | null }>}
 */
export async function getUserStorageMetrics(userId) {
  if (!userId) {
    return {
      usedBytes: 0,
      reservedBytes: 0,
      limitBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES,
      remainingBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES,
      percentage: 0,
      usedGB: 0,
      limitGB: 10,
      remainingGB: 10,
      lastRecalculatedAt: null,
    };
  }

  const { rows } = await query(
    `SELECT id, user_id, used_bytes, reserved_bytes, storage_limit_bytes, updated_at, last_recalculated_at
     FROM user_storage
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  let record = rows && rows[0];
  if (!record) {
    const id = generateSecureId();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO user_storage (id, user_id, used_bytes, reserved_bytes, storage_limit_bytes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO NOTHING`,
      [id, userId, 0, 0, DEFAULT_USER_STORAGE_LIMIT_BYTES, now, now]
    );

    const { rows: refetched } = await query(
      `SELECT id, user_id, used_bytes, reserved_bytes, storage_limit_bytes, updated_at, last_recalculated_at
       FROM user_storage
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    record = (refetched && refetched[0]) || {
      used_bytes: 0,
      reserved_bytes: 0,
      storage_limit_bytes: DEFAULT_USER_STORAGE_LIMIT_BYTES,
      last_recalculated_at: null,
    };
  }

  const usedBytes = Number(record.used_bytes) || 0;
  const reservedBytes = Number(record.reserved_bytes) || 0;
  const limitBytes = Number(record.storage_limit_bytes) || DEFAULT_USER_STORAGE_LIMIT_BYTES;
  const remainingBytes = Math.max(0, limitBytes - usedBytes - reservedBytes);
  const percentage = limitBytes > 0 ? Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2))) : 100;

  const GB = 1024 * 1024 * 1024;
  return {
    usedBytes,
    reservedBytes,
    limitBytes,
    remainingBytes,
    percentage,
    usedGB: Number((usedBytes / GB).toFixed(2)),
    limitGB: Number((limitBytes / GB).toFixed(2)),
    remainingGB: Number((remainingBytes / GB).toFixed(2)),
    lastRecalculatedAt: record.last_recalculated_at || null,
    updatedAt: record.updated_at || null,
  };
}

/**
 * Atomically reserve storage bytes before cloud upload to prevent concurrent quota bypass.
 * @param {string} userId
 * @param {number} bytesToReserve
 * @returns {Promise<{ allowed: boolean, usedBytes: number, reservedBytes: number, limitBytes: number, remainingBytes: number, requestedBytes: number }>}
 */
export async function reserveUserStorageAtomic(userId, bytesToReserve) {
  if (!userId || bytesToReserve <= 0) {
    return { allowed: true, usedBytes: 0, reservedBytes: 0, limitBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES, remainingBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES, requestedBytes: bytesToReserve };
  }

  // Ensure record exists
  await getUserStorageMetrics(userId);

  const now = new Date().toISOString();
  const { rows } = await query(
    `UPDATE user_storage
     SET reserved_bytes = reserved_bytes + $1, updated_at = $2
     WHERE user_id = $3
       AND (used_bytes + reserved_bytes + $1) <= storage_limit_bytes
     RETURNING used_bytes, reserved_bytes, storage_limit_bytes`,
    [bytesToReserve, now, userId]
  );

  if (rows && rows.length > 0) {
    const r = rows[0];
    const usedBytes = Number(r.used_bytes) || 0;
    const reservedBytes = Number(r.reserved_bytes) || 0;
    const limitBytes = Number(r.storage_limit_bytes) || DEFAULT_USER_STORAGE_LIMIT_BYTES;
    return {
      allowed: true,
      usedBytes,
      reservedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes - reservedBytes),
      requestedBytes: bytesToReserve,
    };
  }

  // Fetch current state for error details
  const current = await getUserStorageMetrics(userId);
  return {
    allowed: false,
    usedBytes: current.usedBytes,
    reservedBytes: current.reservedBytes,
    limitBytes: current.limitBytes,
    remainingBytes: current.remainingBytes,
    requestedBytes: bytesToReserve,
  };
}

/**
 * Release reserved storage on upload failure or cancellation.
 */
export async function releaseUserStorageReservation(userId, bytesToRelease) {
  if (!userId || bytesToRelease <= 0) return;
  const now = new Date().toISOString();
  await query(
    `UPDATE user_storage
     SET reserved_bytes = GREATEST(0, reserved_bytes - $1), updated_at = $2
     WHERE user_id = $3`,
    [bytesToRelease, now, userId]
  );
}

/**
 * Commit reservation into used bytes upon successful upload.
 */
export async function finalizeUserStorageUpload(userId, bytesUploaded) {
  if (!userId || bytesUploaded <= 0) return;
  const now = new Date().toISOString();
  await query(
    `UPDATE user_storage
     SET reserved_bytes = GREATEST(0, reserved_bytes - $1),
         used_bytes = used_bytes + $1,
         updated_at = $2
     WHERE user_id = $3`,
    [bytesUploaded, now, userId]
  );
}

/**
 * Decrement used storage when an object is deleted.
 */
export async function decreaseUserStorage(userId, bytesDeleted) {
  if (!userId || bytesDeleted <= 0) return;
  const now = new Date().toISOString();
  await query(
    `UPDATE user_storage
     SET used_bytes = GREATEST(0, used_bytes - $1),
         updated_at = $2
     WHERE user_id = $3`,
    [bytesDeleted, now, userId]
  );
}

/**
 * Update user storage usage after live reconciliation.
 */
export async function reconcileUserStorageUsage(userId, actualUsedBytes) {
  if (!userId) return;
  const now = new Date().toISOString();
  await query(
    `UPDATE user_storage
     SET used_bytes = $1,
         reserved_bytes = 0,
         last_recalculated_at = $2,
         updated_at = $2
     WHERE user_id = $3`,
    [Math.max(0, actualUsedBytes), now, userId]
  );
}

/**
 * Update storage quota limit for a user.
 */
export async function updateUserStorageLimit(userId, limitBytes) {
  if (!userId || limitBytes <= 0) return;
  const now = new Date().toISOString();
  await query(
    `UPDATE user_storage
     SET storage_limit_bytes = $1,
         updated_at = $2
     WHERE user_id = $3`,
    [limitBytes, now, userId]
  );
}

