import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { recordDeviceSession, listUserSessions } from '@/lib/db/sessions';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ip = getClientIp(request);

  // Touch current device session in DB
  await recordDeviceSession(authData.user.id, { userAgent, ipAddress: ip }).catch(() => {});

  return NextResponse.json({
    authenticated: true,
    userId: authData.user.id,
    timestamp: new Date().toISOString(),
  });
}
