import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { findUserById, updateUserInactivityTimeout } from '@/lib/db/users';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await findUserById(authData.user.id);
    const minutes = user?.inactivity_timeout_minutes || 15;
    return NextResponse.json({ inactivityMinutes: minutes });
  } catch (err) {
    console.error('Fetch inactivity timeout error:', err);
    return NextResponse.json({ inactivityMinutes: 15 });
  }
}

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const minutes = Math.max(1, parseInt(body.minutes, 10) || 15);

    await updateUserInactivityTimeout(authData.user.id, minutes);

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'settings:inactivity_updated',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { minutes },
    });

    return NextResponse.json({
      success: true,
      inactivityMinutes: minutes,
      message: `Inactivity timeout updated to ${minutes} minutes across all devices.`,
    });
  } catch (err) {
    console.error('Update inactivity timeout error:', err);
    return NextResponse.json({ error: 'Failed to update inactivity timeout' }, { status: 500 });
  }
}
