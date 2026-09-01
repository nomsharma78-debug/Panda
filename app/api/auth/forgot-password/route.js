import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/db/users';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { validateEmail } from '@/lib/validation/schemas';
import { logAuditEvent } from '@/lib/security/audit';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Rate Limiting (5 attempts per minute)
  const rateLimit = checkRateLimit(ip, 'auth:forgot-password', 5, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many password reset requests. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email } = body || {};

    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    // Always respond with success to prevent user enumeration
    if (user) {
      await logAuditEvent({
        userId: user.id,
        action: 'auth:forgot_password_requested',
        status: 'SUCCESS',
        ipAddress: ip,
        userAgent,
        metadata: { email: normalizedEmail },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a security code has been sent.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
