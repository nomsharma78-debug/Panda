import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';
import { validateUploadFile } from '@/lib/validation/schemas';
import { getClientIp } from '@/lib/security/rate-limit';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'No file provided in multipart payload' }, { status: 400 });
    }

    const validation = validateUploadFile(file);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: 'VALIDATION_FAILED', message: validation.message }, { status: 400 });
    }

    const folderId = formData.get('folderId') || undefined;
    const storageConnectionId = formData.get('storageConnectionId') || undefined;
    const encrypted = formData.get('encrypted') !== 'false';

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const record = await StorageService.uploadUserFile(authData.user.id, {
      fileBuffer,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      storageConnectionId,
      folderId,
      encrypted,
      token,
      ipAddress: ip,
    });

    return NextResponse.json(
      {
        success: true,
        data: record,
        message: 'File uploaded successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('File upload route error:', err);

    if (err.code === 'STORAGE_LIMIT_EXCEEDED') {
      return NextResponse.json(
        {
          success: false,
          error: 'STORAGE_LIMIT_EXCEEDED',
          message: 'Storage limit exceeded.',
          data: err.data || null,
        },
        { status: 413 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: err.code || 'UPLOAD_FAILED',
        message: err.message || 'File upload failed',
      },
      { status: err.statusCode || 500 }
    );
  }
}
