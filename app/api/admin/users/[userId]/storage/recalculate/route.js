import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';

export async function POST(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const { userId } = await params;
  if (authData.user.id !== userId && authData.user.role !== 'admin' && !authData.user.is_admin) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Admin privileges required' }, { status: 403 });
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const report = await StorageService.recalculateUserStorage(userId, token);
    return NextResponse.json({
      success: true,
      message: 'Storage recalculated and reconciled successfully',
      data: report,
    });
  } catch (err) {
    console.error('Admin recalculate storage error:', err);
    return NextResponse.json({ success: false, error: 'RECALCULATION_FAILED', message: err.message }, { status: 500 });
  }
}
