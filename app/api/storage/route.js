import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import {
  listUserStorageConnections,
  createStorageConnection,
  getCombinedStorageMetrics,
  getStorageConnectionInternal,
  updateStorageUsage,
} from '@/lib/db/storage';
import { encryptData } from '@/lib/crypto/encryption';
import { validateStorageInput } from '@/lib/validation/schemas';
import { StorageManager } from '@/lib/storage/storage-manager';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const shouldSync = new URL(request.url).searchParams.get('sync') === 'true';

  try {
    // Cloud storage bucket reconciliation only runs when explicitly requested (e.g. ?sync=true)
    if (shouldSync) {
      try {
        await StorageManager.syncStorageMedia(authData.user.id, token);
      } catch (syncErr) {
        console.warn('[Storage GET sync notice]:', syncErr.message);
      }
    }

    const [connections, combined] = await Promise.all([
      listUserStorageConnections(authData.user.id, token),
      getCombinedStorageMetrics(authData.user.id, token),
    ]);

    return NextResponse.json({
      connections: connections || [],
      combined: combined || null,
    });
  } catch (err) {
    console.error('List storage connections error:', err);
    return NextResponse.json({ error: 'Failed to retrieve storage connections' }, { status: 500 });
  }
}

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateStorageInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    // Enforce live connection test before saving credentials
    const testResult = await StorageManager.testCandidateConfig(body);
    if (!testResult.success) {
      return NextResponse.json(
        {
          error: testResult.error || 'Could not verify storage credentials. Please check your bucket details and try again.',
          checks: testResult.checks,
        },
        { status: 400 }
      );
    }

    // Encrypt configuration payload with master AES-256-GCM key
    const configToEncrypt = {
      provider: body.provider,
      name: body.name,
      endpoint: body.endpoint || undefined,
      accessKey: body.accessKey || undefined,
      secretKey: body.secretKey || undefined,
      bucket: body.bucket || undefined,
      region: body.region || undefined,
      accountId: body.accountId || undefined,
    };

    const encryptedConfig = encryptData(configToEncrypt);

    const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
    const isDefault = body.isDefault || false;
    const connection = await createStorageConnection(authData.user.id, {
      token,
      provider: body.provider,
      name: body.name,
      encryptedConfig,
      isDefault,
    });

    // Auto-discover and sync existing files in this bucket immediately
    try {
      await StorageManager.syncStorageMedia(authData.user.id, token);
    } catch {}

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'storage:connected',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: {
        connectionId: connection.id,
        provider: connection.provider,
        name: connection.name,
      },
    });

    return NextResponse.json(
      {
        connection,
        message: 'Storage connection tested, connected, and synchronized successfully.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Save storage connection error:', err);
    return NextResponse.json({ error: err.message || 'Failed to connect storage provider' }, { status: 500 });
  }
}
