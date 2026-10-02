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

  const cleanBucket = (bucket || 'default').trim();
  const cleanRegion = region ? region.trim() : null;
  const cleanEndpoint = endpoint ? endpoint.trim() : null;

  // Ensure user reference exists in database (to satisfy foreign key if present)
  try {
    const supabase = getSupabaseStorageClient(token);
    if (supabase) {
      await supabase.from('users').upsert(
        { id: userId, email: `${userId}@vault.user`, updated_at: now },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
  } catch { }

  try {
    await query(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@vault.user`, now, now]
    );
  } catch { }

  let savedInSupabase = false;

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
          bucket: cleanBucket,
          region: cleanRegion,
          endpoint: cleanEndpoint,
          encrypted_config: encryptedConfig,
          is_default: isDefault,
          status: 'connected',
          last_verified_at: now,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (insConnErr) {
        // Retry with minimal columns if schema varies
        const retryIns = await supabase.from('storage_connections').insert([
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
        if (retryIns.error) throw new Error(retryIns.error.message);
      }

      savedInSupabase = true;

      const usageId = generateSecureId();
      await supabase.from('storage_usage').insert([
        {
          id: usageId,
          user_id: userId,
          storage_connection_id: id,
          used_bytes: 0,
          available_bytes: 0,
          total_bytes: 0,
          last_checked_at: now,
        },
      ]).catch(() => {});
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase createStorageConnection notice:', sbErr.message);
    }
  }

  // 2. PostgreSQL / Direct Pool: Always sync into PostgreSQL as well for dual-engine resilience!
  if (isDefault) {
    try {
      await query(
        `UPDATE storage_connections SET is_default = false WHERE user_id = $1`,
        [userId]
      );
    } catch { }
  }

  try {
    await query(
      `INSERT INTO storage_connections (id, user_id, provider, name, bucket, region, endpoint, encrypted_config, is_default, status, last_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        userId,
        provider.toLowerCase(),
        name.trim(),
        cleanBucket,
        cleanRegion,
        cleanEndpoint,
        encryptedConfig,
        isDefault,
        'connected',
        now,
        now,
        now,
      ]
    );
  } catch (pgErr) {
    try {
      await query(
        `INSERT INTO storage_connections (id, user_id, provider, name, encrypted_config, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, userId, provider.toLowerCase(), name.trim(), encryptedConfig, isDefault, now, now]
      );
    } catch (fallbackErr) {
      if (!savedInSupabase) {
        throw fallbackErr;
      }
    }
  }

  // Initialize storage usage record in PostgreSQL
  try {
    const usageId = generateSecureId();
    await query(
      `INSERT INTO storage_usage (id, user_id, storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at)
       VALUES ($1, $2, $3, 0, 0, 0, $4)`,
      [usageId, userId, id, now]
    );
  } catch { }

  return {
    id,
    user_id: userId,
    provider: provider.toLowerCase(),
    name: name.trim(),
    bucket: cleanBucket,
    region: cleanRegion,
    endpoint: cleanEndpoint,
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
  wasabi: 1024 * 1024 * 1024 * 1024, // 1 TB Tier
  local: 10 * 1024 * 1024 * 1024,   // 10 GB Local Tier
};

/**
 * List all storage connections for a user along with their usage stats.
 * NEVER returns `encrypted_config` to the frontend!
 */
export async function listUserStorageConnections(userId, token = null) {
  if (!userId) return [];

  // 1. Fetch raw connections from PostgreSQL and Supabase in parallel
  const [pgConnsRes, sbConnsRes] = await Promise.all([
    query(
      `SELECT sc.id, sc.user_id, sc.provider, sc.name, sc.bucket, sc.region, sc.endpoint, sc.is_default, sc.created_at, sc.updated_at
       FROM storage_connections sc
       WHERE sc.user_id = $1
       ORDER BY sc.created_at ASC`,
      [userId]
    ).catch(() => ({ rows: [] })),
    (async () => {
      const supabase = getSupabaseStorageClient(token);
      if (!supabase) return [];
      try {
        const { data, error } = await supabase
          .from('storage_connections')
          .select('id, user_id, provider, name, bucket, region, endpoint, is_default, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });
        return (!error && data) || [];
      } catch {
        return [];
      }
    })(),
  ]);

  const connsMap = new Map();
  for (const c of (pgConnsRes.rows || [])) {
    connsMap.set(c.id, { ...c });
  }
  for (const c of (sbConnsRes || [])) {
    if (!connsMap.has(c.id)) {
      connsMap.set(c.id, { ...c });
    }
  }

  const rawConns = Array.from(connsMap.values());
  if (rawConns.length === 0) return [];

  // 2. Fetch all media files for this user from both PostgreSQL and Supabase
  const seenMediaIds = new Set();
  const allMedia = [];

  try {
    const { rows: pgMedia } = await query(
      `SELECT id, storage_connection_id, storage_provider, file_size FROM media_files WHERE user_id = $1`,
      [userId]
    );
    if (pgMedia && pgMedia.length > 0) {
      for (const m of pgMedia) {
        if (m.id && !seenMediaIds.has(m.id)) {
          seenMediaIds.add(m.id);
          allMedia.push(m);
        }
      }
    }
  } catch {}

  try {
    const supabase = getSupabaseStorageClient(token);
    if (supabase) {
      const { data: sbMedia, error } = await supabase
        .from('media_files')
        .select('id, storage_connection_id, storage_provider, file_size')
        .eq('user_id', userId);
      if (!error && sbMedia && sbMedia.length > 0) {
        for (const m of sbMedia) {
          if (m.id && !seenMediaIds.has(m.id)) {
            seenMediaIds.add(m.id);
            allMedia.push(m);
          }
        }
      }
    }
  } catch {}

  // 3. Fetch storage usage rows from PostgreSQL and Supabase
  const usageMap = {};
  try {
    const { rows: pgUsage } = await query(
      `SELECT storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at FROM storage_usage WHERE user_id = $1`,
      [userId]
    );
    if (pgUsage && pgUsage.length > 0) {
      for (const u of pgUsage) {
        usageMap[u.storage_connection_id] = u;
      }
    }
  } catch {}

  try {
    const supabase = getSupabaseStorageClient(token);
    if (supabase) {
      const { data: sbUsage, error } = await supabase
        .from('storage_usage')
        .select('storage_connection_id, used_bytes, available_bytes, total_bytes, last_checked_at')
        .eq('user_id', userId);
      if (!error && sbUsage && sbUsage.length > 0) {
        for (const u of sbUsage) {
          const prev = usageMap[u.storage_connection_id];
          if (!prev || (Number(u.used_bytes) || 0) > (Number(prev.used_bytes) || 0)) {
            usageMap[u.storage_connection_id] = u;
          }
        }
      }
    }
  } catch {}

  // 4. Map media files to connections
  const fileCounts = {};
  const unassignedMedia = [];

  for (const m of allMedia) {
    const connId = m.storage_connection_id;
    if (connId && connsMap.has(connId)) {
      if (!fileCounts[connId]) fileCounts[connId] = { count: 0, size: 0 };
      fileCounts[connId].count += 1;
      fileCounts[connId].size += Number(m.file_size) || 0;
    } else {
      unassignedMedia.push(m);
    }
  }

  // Assign unassigned media files by provider or default connection
  const defaultConn = rawConns.find((c) => c.is_default) || rawConns[0];
  for (const m of unassignedMedia) {
    const prov = (m.storage_provider || '').toLowerCase();
    const matchingConn = rawConns.find((c) => c.provider?.toLowerCase() === prov) || defaultConn;
    if (matchingConn) {
      if (!fileCounts[matchingConn.id]) fileCounts[matchingConn.id] = { count: 0, size: 0 };
      fileCounts[matchingConn.id].count += 1;
      fileCounts[matchingConn.id].size += Number(m.file_size) || 0;
    }
  }

  // 5. Construct final connection objects
  return rawConns.map((c) => {
    const usage = usageMap[c.id];
    const media = fileCounts[c.id] || { count: 0, size: 0 };
    const usedBytes = Math.max(Number(usage?.used_bytes) || 0, media.size);
    const defaultTotal = PROVIDER_DEFAULT_QUOTAS[c.provider?.toLowerCase()] || 10 * 1024 * 1024 * 1024;
    const totalBytes = Number(usage?.total_bytes) > 0 ? Number(usage?.total_bytes) : defaultTotal;
    const availableBytes = Math.max(0, totalBytes - usedBytes);

    return {
      id: c.id,
      user_id: c.user_id,
      provider: c.provider,
      name: c.name,
      bucket: c.bucket,
      region: c.region,
      endpoint: c.endpoint,
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
      `SELECT sc.id, sc.user_id, sc.provider, sc.name, sc.bucket, sc.region, sc.endpoint, sc.encrypted_config, sc.is_default, sc.created_at, sc.updated_at,
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
 * Update storage usage metrics across both Supabase and PostgreSQL.
 */
export async function updateStorageUsage(userId, storageConnectionId, { usedBytes, availableBytes, totalBytes }) {
  if (!userId || !storageConnectionId) return;
  const now = new Date().toISOString();

  const supabase = getSupabaseStorageClient();
  if (supabase) {
    try {
      await supabase
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
    } catch {}
  }

  // Check if usage row exists in PostgreSQL
  try {
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
  } catch {}
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
      await supabase.from('storage_connections').delete().eq('id', id).eq('user_id', userId);
    } catch {}
  }

  try {
    await query(
      `DELETE FROM storage_usage WHERE storage_connection_id = $1 AND user_id = $2`,
      [id, userId]
    );

    const result = await query(
      `DELETE FROM storage_connections WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return result && (result.rowCount > 0 || result.affectedRows > 0);
  } catch {
    return false;
  }
}

/**
 * Get combined aggregate storage metrics for a user across all connected providers.
 * usedBytes is always computed from media_files.file_size sum (source of truth).
 * totalBytes is the sum of provider tier quotas.
 */
export async function getCombinedStorageMetrics(userId, token = null, prefetchedConns = null) {
  const DEFAULT_QUOTA = 10 * 1024 * 1024 * 1024;

  if (!userId) {
    return {
      totalBytes: DEFAULT_QUOTA,
      usedBytes: 0,
      availableBytes: DEFAULT_QUOTA,
      hasFixedQuota: true,
      providerCount: 0,
      fileCount: 0,
    };
  }

  const conns = prefetchedConns || await listUserStorageConnections(userId, token);
  let totalCap = 0;
  let totalUsed = 0;
  let totalFiles = 0;

  if (conns && conns.length > 0) {
    conns.forEach((row) => {
      const defaultQuota = PROVIDER_DEFAULT_QUOTAS[row.provider?.toLowerCase()] || DEFAULT_QUOTA;
      const total = Number(row.total_bytes) > 0 ? Number(row.total_bytes) : defaultQuota;
      totalCap += total;
      totalUsed += Number(row.used_bytes) || 0;
      totalFiles += Number(row.file_count) || 0;
    });
  }

  // Always cross-verify against media_files table to ensure usedBytes is never 0 if files exist
  try {
    const { rows } = await query(
      `SELECT COUNT(id) as count, COALESCE(SUM(file_size), 0) as total_bytes FROM media_files WHERE user_id = $1`,
      [userId]
    );
    if (rows && rows[0]) {
      const sqlFiles = parseInt(rows[0].count || '0', 10);
      const sqlBytes = parseInt(rows[0].total_bytes || '0', 10);
      if (sqlBytes > totalUsed) totalUsed = sqlBytes;
      if (sqlFiles > totalFiles) totalFiles = sqlFiles;
    }
  } catch {}

  const finalCap = totalCap > 0 ? totalCap : (conns.length > 0 ? conns.length * DEFAULT_QUOTA : DEFAULT_QUOTA);
  const finalAvail = Math.max(0, finalCap - totalUsed);

  return {
    totalBytes: finalCap,
    usedBytes: totalUsed,
    availableBytes: finalAvail,
    hasFixedQuota: true,
    providerCount: conns.length,
    fileCount: totalFiles,
  };
}


/**
 * Default user storage quota: 10 GB (10 * 1024 * 1024 * 1024 bytes)
 */
export const DEFAULT_USER_STORAGE_LIMIT_BYTES =
  parseInt(process.env.USER_STORAGE_LIMIT_GB || '10', 10) * 1024 * 1024 * 1024;

/**
 * Retrieve authoritative user storage record calculated directly from media files and storage connections.
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
      combined: {
        totalBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES,
        usedBytes: 0,
        availableBytes: DEFAULT_USER_STORAGE_LIMIT_BYTES,
        providerCount: 0,
        fileCount: 0,
      },
    };
  }

  const combined = await getCombinedStorageMetrics(userId);
  const usedBytes = combined.usedBytes;
  const limitBytes = combined.totalBytes;
  const remainingBytes = combined.availableBytes;
  const percentage = limitBytes > 0 ? Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2))) : 0;
  const GB = 1024 * 1024 * 1024;

  return {
    usedBytes,
    reservedBytes: 0,
    limitBytes,
    totalBytes: limitBytes,
    remainingBytes,
    availableBytes: remainingBytes,
    percentage,
    usedGB: Number((usedBytes / GB).toFixed(2)),
    limitGB: Number((limitBytes / GB).toFixed(2)),
    remainingGB: Number((remainingBytes / GB).toFixed(2)),
    lastRecalculatedAt: new Date().toISOString(),
    combined,
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


