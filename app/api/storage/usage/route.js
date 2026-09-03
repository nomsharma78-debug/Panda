import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  try {
    const data = await StorageService.getUserStorageUsage(authData.user.id);
    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('Storage usage error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'STORAGE_CALCULATION_FAILED',
        message: err.message || 'Failed to retrieve storage metrics',
      },
      { status: 500 }
    );
  }
}
