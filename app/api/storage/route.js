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

  try {
    // 1. Auto-discover any new files in cloud bucket (such as media/ or test files)
    try {
      await StorageManager.syncStorageMedia(authData.user.id, token);
    } catch (syncErr) {
      console.warn('[Storage GET sync notice]:', syncErr.message);
    }

    let connections = await listUserStorageConnections(authData.user.id, token);

    // 2. Refresh live real-time usage from cloud providers
    if (connections && connections.length > 0) {
      for (const conn of connections) {
        try {
          const storageRecord = await getStorageConnectionInternal(conn.id, authData.user.id, token);
          if (storageRecord) {
            const provider = StorageManager.getProviderFromRecord(storageRecord);
            const usage = await provider.getUsage();
            if (usage && typeof usage.usedBytes === 'number') {
              await updateStorageUsage(authData.user.id, conn.id, usage);
            }
          }
        } catch (e) {
          console.warn('[Storage GET usage check]:', e.message);
        }
      }
      connections = await listUserStorageConnections(authData.user.id, token);
    }

    const combined = await getCombinedStorageMetrics(authData.user.id, token);

    return NextResponse.json({
      connections,
      combined,
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
