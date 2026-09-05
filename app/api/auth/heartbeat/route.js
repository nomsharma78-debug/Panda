import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { touchDeviceSession } from '@/lib/db/sessions';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request) {
  try {
    const authData = await getAuthenticatedUser(request);
    if (!authData) {
      return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userAgent = request.headers.get('user-agent') || '';
    let ip = '';
    try {
      ip = getClientIp(request);
    } catch {}

    // Validate that this device session is still active
    try {
      await touchDeviceSession(authData.user.id, userAgent, ip);
    } catch (touchErr) {
      console.warn('[Heartbeat] touchDeviceSession notice:', touchErr.message);
    }

    return NextResponse.json({
      authenticated: true,
      userId: authData.user.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Heartbeat error:', err);
    return NextResponse.json({ authenticated: false, error: err.message }, { status: 200 });
  }
}
