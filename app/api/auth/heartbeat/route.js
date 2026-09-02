import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { touchDeviceSession } from '@/lib/db/sessions';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ip = getClientIp(request);

  // Validate that this device session is still active and has NOT been revoked
  const isAlive = await touchDeviceSession(authData.user.id, userAgent, ip);
  if (!isAlive) {
    return NextResponse.json(
      { authenticated: false, revoked: true, error: 'Session has been revoked from another device.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    userId: authData.user.id,
    timestamp: new Date().toISOString(),
  });
}
