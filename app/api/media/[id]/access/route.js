import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    console.error('[MEDIA ACCESS] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const { id } = await params;

  try {
    const { buffer, mimeType, filename, size } = await StorageManager.getMediaBinary(authData.user.id, id, token);

    // Convert Buffer to Uint8Array for guaranteed browser stream compatibility
    const uint8Array = new Uint8Array(buffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': String(size || uint8Array.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename || 'file')}"`,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    console.error('[MEDIA ACCESS] FAILED:', err.message);
    let status = 500;
    let code = 'INTERNAL_ERROR';
    const msg = err.message || '';
    if (msg.includes('FORBIDDEN')) { status = 403; code = 'FORBIDDEN'; }
    else if (msg.includes('not found') || msg.includes('NoSuchKey') || msg.includes('could not be retrieved')) { status = 404; code = 'FILE_NOT_FOUND'; }
    else if (msg.includes('Storage connection not found') || msg.includes('not configured')) { status = 404; code = 'STORAGE_NOT_CONFIGURED'; }
    else if (msg.includes('InvalidAccessKeyId') || msg.includes('SignatureDoesNotMatch') || msg.includes('Credentials')) { status = 502; code = 'STORAGE_AUTH_FAILED'; }
    else if (msg.includes('storage') || msg.includes('timeout')) { status = 502; code = 'STORAGE_PROVIDER_ERROR'; }
    return NextResponse.json({ error: msg || 'Media file could not be loaded', code }, { status });
  }
}