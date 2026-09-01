import { NextResponse } from 'next/server';
import { revokeSessionByToken } from '@/lib/db/sessions';
import { getAuthenticatedUser, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  const authData = await getAuthenticatedUser(request);

  if (authData) {
    // Revoke from DB
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) {
      const token = decodeURIComponent(match[1]);
      await revokeSessionByToken(token);
    }

    await logAuditEvent({
      userId: authData.user.id,
      action: 'auth:logout',
      status: 'SUCCESS',
      ipAddress: ip,
      userAgent,
    });
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });

  // Clear cookie
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
