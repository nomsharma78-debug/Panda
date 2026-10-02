import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getVaultStats } from '@/lib/db/vault';
import { getMediaStats, getRecentMedia } from '@/lib/db/media';
import { getCombinedStorageMetrics, listUserStorageConnections } from '@/lib/db/storage';
import { listUserAuditLogs } from '@/lib/db/audit';

function extractUserToken(request) {
  const authHeader = request.headers.get ? request.headers.get('authorization') : request.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authData.user.id;
  const userToken = extractUserToken(request);

  try {
    // 1. Fetch connections and basic stats concurrently (< 30ms total)
    const [vaultRes, storageConnsRes, recentMediaRes, auditLogsRes] = await Promise.allSettled([
      getVaultStats(userId, userToken),
      listUserStorageConnections(userId, userToken),
      getRecentMedia(userId, 6, userToken),
      listUserAuditLogs(userId, 8, userToken),
    ]);

    const vaultStats = vaultRes.status === 'fulfilled' && vaultRes.value ? vaultRes.value : { login: 0, card: 0, note: 0, identity: 0, total: 0 };
    const storageConnections = storageConnsRes.status === 'fulfilled' && storageConnsRes.value ? storageConnsRes.value : [];
    const recentMedia = recentMediaRes.status === 'fulfilled' && recentMediaRes.value ? recentMediaRes.value : [];
    const auditLogs = auditLogsRes.status === 'fulfilled' && auditLogsRes.value ? auditLogsRes.value : [];

    // 2. Compute storage metrics & media stats directly using preloaded connections & DB
    let [storageMetrics, mediaStats] = await Promise.all([
      getCombinedStorageMetrics(userId, userToken, storageConnections),
      getMediaStats(userId, userToken),
    ]);

    let finalRecentMedia = recentMedia;

    // Auto-discover media files from connected buckets if media count is 0
    if ((!mediaStats.total || mediaStats.total === 0 || recentMedia.length === 0) && storageConnections.length > 0) {
      try {
        const { StorageManager } = await import('@/lib/storage/storage-manager');
        const syncPromise = StorageManager.syncStorageMedia(userId, userToken);
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 1500));
        const discovered = await Promise.race([syncPromise, timeoutPromise]);
        if (discovered && discovered.length > 0) {
          const [refreshedStats, refreshedRecent, refreshedMetrics] = await Promise.all([
            getMediaStats(userId, userToken),
            getRecentMedia(userId, 6, userToken),
            getCombinedStorageMetrics(userId, userToken, storageConnections),
          ]);
          mediaStats = refreshedStats;
          finalRecentMedia = refreshedRecent;
          storageMetrics = refreshedMetrics;
        }
      } catch {}
    }

    return NextResponse.json(
      {
        vault: vaultStats,
        media: mediaStats,
        storage: {
          ...storageMetrics,
          connections: storageConnections,
        },
        recentMedia: finalRecentMedia,
        recentActivity: auditLogs,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve dashboard overview' },
      { status: 500 }
    );
  }
}
