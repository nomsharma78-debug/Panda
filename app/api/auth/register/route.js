import { NextResponse } from 'next/server';
import { createUser, findUserByEmail, updateUserPassword, updateUserName } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { hashPassword } from '@/lib/crypto/argon2';
import { validateEmail, validatePasswordStrength } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';
import { getSessionCookieOptions } from '@/lib/auth/session';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Rate Limiting
  const rateLimit = checkRateLimit(ip, 'auth:register', 15, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many registration attempts. Please try again in ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password, confirmPassword, name } = body || {};

    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!password || (confirmPassword && password !== confirmPassword)) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    // Hash password with Argon2id
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash, null, name || null);

    // Create initial session
    const { rawToken, expiresAt } = await createSession(user.id);

    // Audit log
    await logAuditEvent({
      userId: user.id,
      action: 'auth:register',
      status: 'SUCCESS',
      ipAddress: ip,
      userAgent,
      metadata: { email: user.email, name: user.name },
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      message: 'Account created successfully.',
    });

    // Set HTTP-only session cookie
    const cookieOptions = getSessionCookieOptions(expiresAt);
    response.cookies.set(cookieOptions.name, rawToken, cookieOptions);

    return response;
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }
}
