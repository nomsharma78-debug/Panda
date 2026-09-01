import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getMediaFileById } from '@/lib/db/media';
import { StorageManager } from '@/lib/storage/storage-manager';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Strict ownership check
  const media = await getMediaFileById(id, authData.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
  }

  return NextResponse.json({ media });
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await StorageManager.deleteMedia(authData.user.id, id);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Media file not found' }, { status: 404 });
    }

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:deleted',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { mediaId: id },
    });

    return NextResponse.json({ success: true, message: 'Media file deleted successfully' });
  } catch (err) {
    console.error('Delete media error:', err);
    return NextResponse.json({ error: 'Failed to delete media file' }, { status: 500 });
  }
}
