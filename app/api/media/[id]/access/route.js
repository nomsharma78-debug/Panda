import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    console.error('[media/access] Auth failed - no authData returned. URL:', request.url?.split('?')[0]);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const { id } = await params;

  try {
    const { buffer, mimeType, filename, size } = await StorageManager.getMediaBinary(authData.user.id, id, token);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': String(size),
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename || 'file')}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[media/access] getMediaBinary error:', err.message, '| userId:', authData.user.id, '| mediaId:', id);
    const isNotFound = err.message.includes('not found') || err.message.includes('unauthorized');
    return NextResponse.json(
      { error: err.message || 'Media file not found or unauthorized' },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
