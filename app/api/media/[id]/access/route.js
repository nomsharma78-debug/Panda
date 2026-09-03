import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    console.error('[MEDIA ACCESS] Auth failed - no session/authData returned for URL:', request.url?.split('?')[0]);
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const { id } = await params;

  console.log('[MEDIA ACCESS] START', {
    mediaId: id,
    authenticatedUserId: authData.user.id,
    authenticatedUserEmail: authData.user.email,
  });

  try {
    const { buffer, mimeType, filename, size } = await StorageManager.getMediaBinary(authData.user.id, id, token);

    console.log('[MEDIA ACCESS] RESPONSE 200 OK', { mediaId: id, size, mimeType, filename });

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
    console.error('[MEDIA ACCESS] Error:', err.message, '| userId:', authData.user.id, '| mediaId:', id);
    
    let status = 500;
    let code = 'INTERNAL_ERROR';
    const msg = err.message || '';

    if (msg.includes('FORBIDDEN') || msg.includes('belongs to another user')) {
      status = 403;
      code = 'FORBIDDEN';
    } else if (msg.includes('not found') || msg.includes('NoSuchKey') || msg.includes('NotFound')) {
      status = 404;
      code = 'FILE_NOT_FOUND';
    } else if (msg.includes('Storage connection not found')) {
      status = 404;
      code = 'STORAGE_NOT_CONFIGURED';
    } else if (msg.includes('storage') || msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('Provider')) {
      status = 502;
      code = 'STORAGE_PROVIDER_ERROR';
    }

    return NextResponse.json(
      { error: err.message || 'Media file could not be loaded', code },
      { status }
    );
  }
}
