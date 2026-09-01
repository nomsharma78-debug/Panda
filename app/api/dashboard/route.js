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

  // Safe individual metric retrieval with independent fallbacks
  let vaultStats = { login: 0, card: 0, note: 0, identity: 0, total: 0 };
  let mediaStats = { images: 0, videos: 0, audio: 0, documents: 0, total: 0, totalBytes: 0 };
  let storageMetrics = { totalBytes: 0, providerCount: 0, providers: [] };
  let storageConnections = [];
  let recentMedia = [];
  let auditLogs = [];

  try {
    const v = await getVaultStats(userId, userToken);
    if (v) vaultStats = v;
  } catch (e) {
    console.warn('[Dashboard API] vaultStats notice:', e.message);
  }

  try {
    const m = await getMediaStats(userId, userToken);
    if (m) mediaStats = m;
  } catch (e) {
    console.warn('[Dashboard API] mediaStats notice:', e.message);
  }

  try {
    const s = await getCombinedStorageMetrics(userId, userToken);
    if (s) storageMetrics = s;
  } catch (e) {
    console.warn('[Dashboard API] storageMetrics notice:', e.message);
  }

  try {
    const sc = await listUserStorageConnections(userId, userToken);
    if (sc) storageConnections = sc;
  } catch (e) {
    console.warn('[Dashboard API] storageConnections notice:', e.message);
  }

  try {
    const rm = await getRecentMedia(userId, 6, userToken);
    if (rm) recentMedia = rm;
  } catch (e) {
    console.warn('[Dashboard API] recentMedia notice:', e.message);
  }

  try {
    const al = await listUserAuditLogs(userId, 8, userToken);
    if (al) auditLogs = al;
  } catch (e) {
    console.warn('[Dashboard API] auditLogs notice:', e.message);
  }

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
}
