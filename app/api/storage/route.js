import { getAuthenticatedUser } from '@/lib/auth/session';
import {
  listUserStorageConnections,
  createStorageConnection,
  getCombinedStorageMetrics,
} from '@/lib/db/storage';
import { encryptData } from '@/lib/crypto/encryption';
import { validateStorageInput } from '@/lib/validation/schemas';
import { StorageManager } from '@/lib/storage/storage-manager';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';
import { jsonSuccess, jsonError, jsonBadRequest, jsonUnauthorized, handleApiError } from '@/lib/api/response';
import { logger } from '@/lib/utils/logger';

const storageLogger = logger.child('StorageAPI');

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return jsonUnauthorized();
  }

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const shouldSync = new URL(request.url).searchParams.get('sync') === 'true';

  try {
    // Cloud storage bucket reconciliation only runs when explicitly requested (e.g. ?sync=true)
    if (shouldSync) {
      try {
        await StorageManager.syncStorageMedia(authData.user.id, token);
      } catch (syncErr) {
        storageLogger.warn(`Sync warning: ${syncErr.message}`);
      }
    }

    let [connections, combined] = await Promise.all([
      listUserStorageConnections(authData.user.id, token),
      getCombinedStorageMetrics(authData.user.id, token),
    ]);

    // Auto-discover if storage is connected but zero files/bytes registered
    if (
      (!combined?.usedBytes || combined.usedBytes === 0 || (connections && connections.length > 0 && connections.every(c => (c.used_bytes || 0) === 0))) &&
      (connections && connections.length > 0)
    ) {
      try {
        const synced = await StorageManager.syncStorageMedia(authData.user.id, token);
        if (synced && synced.length > 0) {
          [connections, combined] = await Promise.all([
            listUserStorageConnections(authData.user.id, token),
            getCombinedStorageMetrics(authData.user.id, token),
          ]);
        }
      } catch {}
    }

    return jsonSuccess({
      connections: connections || [],
      combined: combined || null,
    });
  } catch (err) {
    return handleApiError(err, 'ListStorageConnections');
  }
}

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return jsonUnauthorized();
  }

  try {
    const body = await request.json();
    const validation = validateStorageInput(body);
    if (!validation.valid) {
      return jsonBadRequest(validation.message);
    }

    // Enforce live connection test before saving credentials
    const testResult = await StorageManager.testCandidateConfig(body);
    if (!testResult.success) {
      return jsonBadRequest(
        testResult.error || 'Could not verify storage credentials. Please check your bucket details and try again.',
        { checks: testResult.checks }
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

    return jsonSuccess(
      {
        connection,
        message: 'Storage connection tested, connected, and synchronized successfully.',
      },
      201
    );
  } catch (err) {
    return handleApiError(err, 'CreateStorageConnection');
  }
}
