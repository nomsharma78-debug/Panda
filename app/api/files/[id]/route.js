import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';
import { getMediaFileById } from '@/lib/db/media';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const file = await getMediaFileById(id, authData.user.id, token);
    if (!file || file.user_id !== authData.user.id) {
      return NextResponse.json({ success: false, error: 'FILE_NOT_FOUND', message: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: file });
  } catch (err) {
    console.error('Get file error:', err);
    return NextResponse.json({ success: false, error: 'SERVER_ERROR', message: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const ip = getClientIp(request);
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const result = await StorageService.deleteUserFile(authData.user.id, id, { token, ipAddress: ip });
    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
      data: result,
    });
  } catch (err) {
    console.error('Delete file error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.code || 'DELETE_FAILED',
        message: err.message || 'Failed to delete file',
      },
      { status: err.statusCode || 500 }
    );
  }
}
