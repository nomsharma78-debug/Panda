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
    const [vaultStats, mediaStats, storageMetrics, storageConnections, recentMedia, auditLogs] = await Promise.all([
      getVaultStats(userId, userToken),
      getMediaStats(userId, userToken),
      getCombinedStorageMetrics(userId, userToken),
      listUserStorageConnections(userId, userToken),
      getRecentMedia(userId, 6, userToken),
      listUserAuditLogs(userId, 8, userToken),
    ]);

    return NextResponse.json({
      vault: vaultStats,
      media: mediaStats,
      storage: {
        ...storageMetrics,
        connections: storageConnections,
      },
      recentMedia,
      recentActivity: auditLogs,
    });
  } catch (err) {
    console.error('Dashboard aggregation error:', err);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}
