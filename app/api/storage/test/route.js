import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { validateStorageInput } from '@/lib/validation/schemas';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);

  // Strict rate limit on external connection test attempts (10 per minute)
  const rateLimit = checkRateLimit(ip, 'storage:test', 10, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many connection test attempts. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    // If testing an existing saved connection
    if (body.storageId || body.id) {
      const connId = body.storageId || body.id;
      const { getStorageConnectionInternal } = await import('@/lib/db/storage');
      const record = await getStorageConnectionInternal(connId, authData.user.id);
      if (!record) {
        return NextResponse.json({ error: 'Storage connection record not found' }, { status: 404 });
      }
      const provider = StorageManager.getProviderFromRecord(record);
      const testResult = await provider.testConnection();
      if (!testResult.success) {
        return NextResponse.json(testResult, { status: 400 });
      }
      return NextResponse.json(testResult);
    }

    const validation = validateStorageInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    // Run test connection with temporary object write/read/delete
    const testResult = await StorageManager.testCandidateConfig(body);

    if (!testResult.success) {
      return NextResponse.json(testResult, { status: 400 });
    }

    return NextResponse.json(testResult);
  } catch (err) {
    console.error('Storage test error:', err);
    return NextResponse.json(
      {
        success: false,
        checks: { endpoint: false },
        error: err.message || 'Unable to connect to this storage. Please verify your endpoint and credentials.',
      },
      { status: 400 }
    );
  }
}
