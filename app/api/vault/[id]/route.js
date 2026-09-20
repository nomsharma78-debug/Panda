import { getAuthenticatedUser } from '@/lib/auth/session';
import { getVaultItemById, updateVaultItem, deleteVaultItem } from '@/lib/db/vault';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';
import { jsonSuccess, jsonBadRequest, jsonUnauthorized, jsonNotFound, handleApiError } from '@/lib/api/response';
import { VAULT_TYPES } from '@/lib/constants/vault';

function extractUserToken(request) {
  const authHeader = request.headers.get ? request.headers.get('authorization') : request.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return jsonUnauthorized();
  }

  const { id } = await params;
  const userToken = extractUserToken(request);

  // Strict ownership check
  const item = await getVaultItemById(id, authData.user.id, userToken);
  if (!item) {
    return jsonNotFound('Vault item not found');
  }

  let serverDecrypted = null;
  if (item.encrypted_payload) {
    if (typeof item.encrypted_payload === 'string' && item.encrypted_payload.split(':').length === 3) {
      try {
        const { decryptData } = await import('@/lib/crypto/encryption');
        serverDecrypted = decryptData(item.encrypted_payload, null, true);
      } catch {}
    } else {
      try {
        const parsed = typeof item.encrypted_payload === 'string' ? JSON.parse(item.encrypted_payload) : item.encrypted_payload;
        if (parsed?.data) serverDecrypted = parsed.data;
        else if (parsed?.title || parsed?.username) serverDecrypted = parsed;
      } catch {}
    }
  }

  return jsonSuccess({ item: { ...item, decryptedPayload: serverDecrypted } });
}

export async function PATCH(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return jsonUnauthorized();
  }

  const { id } = await params;
  const userToken = extractUserToken(request);

  try {
    const body = await request.json();
    const { type, encryptedPayload } = body || {};

    if (!type && !encryptedPayload) {
      return jsonBadRequest('Type or encrypted payload is required for update');
    }

    if (type) {
      const validTypes = Object.values(VAULT_TYPES).filter((t) => t !== VAULT_TYPES.ALL);
      if (!validTypes.includes(type.toLowerCase())) {
        return jsonBadRequest(`Invalid vault item type. Valid: ${validTypes.join(', ')}`);
      }
    }

    let finalPayloadToStore = encryptedPayload;
    let dataObject = null;

    if (encryptedPayload) {
      try {
        const parsed = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
        if (parsed.data) {
          dataObject = parsed.data;
        } else if (!parsed.ciphertext) {
          dataObject = parsed;
        }
      } catch {
        if (typeof encryptedPayload === 'string' && encryptedPayload.split(':').length !== 3) {
          dataObject = { content: encryptedPayload };
        }
      }

      if (dataObject) {
        const { encryptData } = await import('@/lib/crypto/encryption');
        finalPayloadToStore = encryptData(dataObject);
      }
    }

    const updated = await updateVaultItem(
      id,
      authData.user.id,
      {
        type: type ? type.toLowerCase() : undefined,
        encryptedPayload: finalPayloadToStore,
      },
      userToken
    );

    if (!updated) {
      return jsonNotFound('Vault item not found or unauthorized');
    }

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'vault:item_updated',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { itemId: id, itemType: updated.type },
    });

    const returnedItem = {
      ...updated,
      decryptedPayload: dataObject || null,
    };

    return jsonSuccess({ item: returnedItem, message: 'Vault item updated securely' });
  } catch (err) {
    return handleApiError(err, 'UpdateVaultItem');
  }
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return jsonUnauthorized();
  }

  const { id } = await params;
  const userToken = extractUserToken(request);

  const deleted = await deleteVaultItem(id, authData.user.id, userToken);
  if (!deleted) {
    return jsonNotFound('Vault item not found');
  }

  const ip = getClientIp(request);
  await logAuditEvent({
    userId: authData.user.id,
    action: 'vault:item_deleted',
    status: 'SUCCESS',
    ipAddress: ip,
    metadata: { itemId: id },
  });

  return jsonSuccess({ success: true, message: 'Vault item deleted' });
}
