import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';
import { listUserMedia } from '@/lib/db/media';
import { ProviderFactory } from '@/lib/storage/provider-factory';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  // Admin access validation (self or admin role check)
  const { userId } = await params;
  if (authData.user.id !== userId && authData.user.role !== 'admin' && !authData.user.is_admin) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Admin privileges required' }, { status: 403 });
  }

  try {
    const usage = await StorageService.getUserStorageUsage(userId);
    const files = await listUserMedia(userId, { limit: 1 });
    const resolved = await ProviderFactory.resolveProviderForUser(userId);

    return NextResponse.json({
      success: true,
      data: {
        userId,
        usedBytes: usage.usedBytes,
        reservedBytes: usage.reservedBytes,
        limitBytes: usage.limitBytes,
        remainingBytes: usage.remainingBytes,
        percentage: usage.percentage,
        usedGB: usage.usedGB,
        limitGB: usage.limitGB,
        remainingGB: usage.remainingGB,
        provider: resolved.providerName,
        lastRecalculatedAt: usage.lastRecalculatedAt,
      },
    });
  } catch (err) {
    console.error('Admin storage inspect error:', err);
    return NextResponse.json({ success: false, error: 'SERVER_ERROR', message: err.message }, { status: 500 });
  }
}
