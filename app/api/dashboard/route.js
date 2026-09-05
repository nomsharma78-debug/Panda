import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getVaultStats } from '@/lib/db/vault';
import { getMediaStats, getRecentMedia } from '@/lib/db/media';
import { getCombinedStorageMetrics, listUserStorageConnections } from '@/lib/db/storage';
import { listUserAuditLogs } from '@/lib/db/audit';
import { StorageManager } from '@/lib/storage/storage-manager';

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

  // Run all metric queries in parallel for ultra-fast response time
  const [vaultRes, mediaRes, storageMetricsRes, storageConnsRes, recentMediaRes, auditLogsRes] = await Promise.allSettled([
    getVaultStats(userId, userToken),
    getMediaStats(userId, userToken),
    getCombinedStorageMetrics(userId, userToken),
    listUserStorageConnections(userId, userToken),
    getRecentMedia(userId, 6, userToken),
    listUserAuditLogs(userId, 8, userToken),
  ]);

  let vaultStats = vaultRes.status === 'fulfilled' && vaultRes.value ? vaultRes.value : { login: 0, card: 0, note: 0, identity: 0, total: 0 };
  let mediaStats = mediaRes.status === 'fulfilled' && mediaRes.value ? mediaRes.value : { images: 0, videos: 0, audio: 0, documents: 0, total: 0, totalBytes: 0 };
  const storageMetrics = storageMetricsRes.status === 'fulfilled' && storageMetricsRes.value ? storageMetricsRes.value : { totalBytes: 0, providerCount: 0, providers: [] };
  const storageConnections = storageConnsRes.status === 'fulfilled' && storageConnsRes.value ? storageConnsRes.value : [];
  let recentMedia = recentMediaRes.status === 'fulfilled' && recentMediaRes.value ? recentMediaRes.value : [];
  const auditLogs = auditLogsRes.status === 'fulfilled' && auditLogsRes.value ? auditLogsRes.value : [];

  // Auto-discover media files from connected buckets if media count is 0
  if ((!mediaStats.total || mediaStats.total === 0 || recentMedia.length === 0) && storageConnections.length > 0) {
    try {
      const discovered = await StorageManager.syncStorageMedia(userId, userToken);
      if (discovered && discovered.length > 0) {
        const [refreshedStats, refreshedRecent] = await Promise.all([
          getMediaStats(userId, userToken),
          getRecentMedia(userId, 6, userToken),
        ]);
        mediaStats = refreshedStats;
        recentMedia = refreshedRecent;
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
      recentMedia,
      recentActivity: auditLogs,
    },
    {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    }
  );
}
