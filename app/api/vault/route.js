import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listVaultItems, createVaultItem } from '@/lib/db/vault';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';
import { encryptData, decryptData } from '@/lib/crypto/encryption';

function extractUserToken(request) {
  const authHeader = request.headers.get ? request.headers.get('authorization') : request.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userToken = extractUserToken(request);
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || null;

  try {
    const items = await listVaultItems(authData.user.id, type, userToken);

    const processedItems = items.map((item) => {
      let serverDecrypted = null;
      if (item.encrypted_payload && typeof item.encrypted_payload === 'string') {
        const parts = item.encrypted_payload.split(':');
        if (parts.length === 3) {
          try {
            serverDecrypted = decryptData(item.encrypted_payload, null, true);
          } catch {}
        }
      }

      return {
        ...item,
        decryptedPayload: serverDecrypted,
      };
    });

    return NextResponse.json({ items: processedItems });
  } catch (err) {
    console.error('List vault items error:', err);
    return NextResponse.json({ error: 'Failed to retrieve vault items' }, { status: 500 });
  }
}

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userToken = extractUserToken(request);

  try {
    const body = await request.json();
    const { type, encryptedPayload } = body || {};

    if (!type || !encryptedPayload) {
      return NextResponse.json({ error: 'Item type and encrypted payload are required' }, { status: 400 });
    }

    const validTypes = ['login', 'card', 'note', 'identity'];
    if (!validTypes.includes(type.toLowerCase())) {
      return NextResponse.json({ error: `Invalid vault item type. Valid: ${validTypes.join(', ')}` }, { status: 400 });
    }

    // Ensure payload is ALWAYS encrypted with AES-256-GCM before writing to database
    let finalPayloadToStore = encryptedPayload;

    try {
      const parsed = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
      if (parsed.ciphertext && parsed.iv && parsed.authTag) {
        // Already client-side encrypted
        finalPayloadToStore = typeof encryptedPayload === 'string' ? encryptedPayload : JSON.stringify(encryptedPayload);
      } else if (parsed.data) {
        // Plaintext payload -> Encrypt with AES-256-GCM on server
        finalPayloadToStore = encryptData(parsed.data);
      } else {
        finalPayloadToStore = encryptData(parsed);
      }
    } catch {
      // If not JSON and not AES formatted, encrypt it
      if (typeof encryptedPayload === 'string' && encryptedPayload.split(':').length !== 3) {
        finalPayloadToStore = encryptData(encryptedPayload);
      }
    }

    const item = await createVaultItem(
      authData.user.id,
      {
        type: type.toLowerCase(),
        encryptedPayload: finalPayloadToStore,
      },
      userToken
    );

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'vault:item_created',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { itemId: item.id, itemType: item.type },
    });

    return NextResponse.json({ item, message: 'Vault item encrypted and saved securely' }, { status: 201 });
  } catch (err) {
    console.error('Create vault item error:', err);
    return NextResponse.json({ error: err.message || 'Failed to save vault item' }, { status: 500 });
  }
}
