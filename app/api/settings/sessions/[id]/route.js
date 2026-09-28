import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { revokeSessionById } from '@/lib/db/sessions';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    await revokeSessionById(id, authData.user.id);

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'auth:session_revoked',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { sessionId: id },
    });

    return NextResponse.json({
      success: true,
      message: 'Device session revoked successfully.',
    });
  } catch (err) {
    console.error('Revoke session by ID error:', err);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
