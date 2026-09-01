import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getVaultStats } from '@/lib/db/vault';
import { getMediaStats, getRecentMedia } from '@/lib/db/media';
import { getCombinedStorageMetrics, listUserStorageConnections } from '@/lib/db/storage';
import { listUserAuditLogs } from '@/lib/db/audit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authData.user.id;

  try {
    const [vaultStats, mediaStats, storageMetrics, storageConnections, recentMedia, auditLogs] = await Promise.all([
      getVaultStats(userId),
      getMediaStats(userId),
      getCombinedStorageMetrics(userId),
      listUserStorageConnections(userId),
      getRecentMedia(userId, 6),
      listUserAuditLogs(userId, 8),
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
