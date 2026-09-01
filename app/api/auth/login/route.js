import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { verifyPassword } from '@/lib/crypto/argon2';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';
import { getSessionCookieOptions } from '@/lib/auth/session';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Rate Limiting (5 failed attempts per minute per IP)
  const rateLimit = checkRateLimit(ip, 'auth:login', 15, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many login attempts. Please try again in ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await logAuditEvent({
        action: 'auth:login_failed',
        status: 'FAILED',
        ipAddress: ip,
        userAgent,
        metadata: { emailAttempt: email },
      });
      // Generic non-enumerating error message
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Verify Argon2id hash
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logAuditEvent({
        userId: user.id,
        action: 'auth:login_failed',
        status: 'FAILED',
        ipAddress: ip,
        userAgent,
        metadata: { emailAttempt: email },
      });
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Create session
    const { rawToken, expiresAt } = await createSession(user.id);

    // Audit log
    await logAuditEvent({
      userId: user.id,
      action: 'auth:login',
      status: 'SUCCESS',
      ipAddress: ip,
      userAgent,
      metadata: { email: user.email },
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
      message: 'Login successful.',
    });

    // Set HTTP-only session cookie
    const cookieOptions = getSessionCookieOptions(expiresAt);
    response.cookies.set(cookieOptions.name, rawToken, cookieOptions);

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
  }
}
