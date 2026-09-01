import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserSessions, revokeAllUserSessions } from '@/lib/db/sessions';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await listUserSessions(authData.user.id);
    const formatted = sessions.map((s) => ({
      id: s.id,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      isCurrent: s.id === authData.session.id,
    }));

    return NextResponse.json({ sessions: formatted });
  } catch (err) {
    console.error('List sessions error:', err);
    return NextResponse.json({ error: 'Failed to retrieve sessions' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Revoke all other sessions, keep current session or revoke all
    const body = await request.json().catch(() => ({}));
    const revokeCurrentToo = body.revokeCurrent || false;

    if (revokeCurrentToo) {
      await revokeAllUserSessions(authData.user.id);
    } else {
      // Keep only current session
      const { query } = await import('@/lib/db');
      await query(`DELETE FROM sessions WHERE user_id = $1 AND id != $2`, [authData.user.id, authData.session.id]);
    }

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'auth:sessions_revoked',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { revokeCurrentToo },
    });

    return NextResponse.json({
      success: true,
      message: 'Active sessions revoked successfully.',
    });
  } catch (err) {
    console.error('Revoke sessions error:', err);
    return NextResponse.json({ error: 'Failed to revoke sessions' }, { status: 500 });
  }
}
