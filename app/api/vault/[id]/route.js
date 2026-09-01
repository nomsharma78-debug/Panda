import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getVaultItemById, updateVaultItem, deleteVaultItem } from '@/lib/db/vault';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Strict ownership check
  const item = await getVaultItemById(id, authData.user.id);
  if (!item) {
    return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { type, encryptedPayload } = body || {};

    let finalPayloadToStore = encryptedPayload;
    if (encryptedPayload) {
      try {
        const parsed = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
        if (parsed.ciphertext && parsed.iv && parsed.authTag) {
          finalPayloadToStore = typeof encryptedPayload === 'string' ? encryptedPayload : JSON.stringify(encryptedPayload);
        } else if (parsed.data) {
          const { encryptData } = await import('@/lib/crypto/encryption');
          finalPayloadToStore = encryptData(parsed.data);
        } else {
          const { encryptData } = await import('@/lib/crypto/encryption');
          finalPayloadToStore = encryptData(parsed);
        }
      } catch {
        if (typeof encryptedPayload === 'string' && encryptedPayload.split(':').length !== 3) {
          const { encryptData } = await import('@/lib/crypto/encryption');
          finalPayloadToStore = encryptData(encryptedPayload);
        }
      }
    }

    const updated = await updateVaultItem(id, authData.user.id, {
      type,
      encryptedPayload: finalPayloadToStore,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    }

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'vault:item_updated',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { itemId: id, itemType: updated.type },
    });

    return NextResponse.json({ item: updated, message: 'Vault item updated' });
  } catch (err) {
    console.error('Update vault item error:', err);
    return NextResponse.json({ error: 'Failed to update vault item' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const deleted = await deleteVaultItem(id, authData.user.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
  }

  const ip = getClientIp(request);
  await logAuditEvent({
    userId: authData.user.id,
    action: 'vault:item_deleted',
    status: 'SUCCESS',
    ipAddress: ip,
    metadata: { itemId: id },
  });

  return NextResponse.json({ success: true, message: 'Vault item deleted' });
}
