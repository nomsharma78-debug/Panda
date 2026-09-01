import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listVaultItems, createVaultItem } from '@/lib/db/vault';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || null;

  try {
    const items = await listVaultItems(authData.user.id, type);
    return NextResponse.json({ items });
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

    const item = await createVaultItem(authData.user.id, {
      type: type.toLowerCase(),
      encryptedPayload,
    });

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'vault:item_created',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { itemId: item.id, itemType: item.type },
    });

    return NextResponse.json({ item, message: 'Vault item saved securely' }, { status: 201 });
  } catch (err) {
    console.error('Create vault item error:', err);
    return NextResponse.json({ error: 'Failed to save vault item' }, { status: 500 });
  }
}
