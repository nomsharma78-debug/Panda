import { NextResponse } from 'next/server';
import { findUserByEmail, updateUserPassword } from '@/lib/db/users';
import { revokeAllUserSessions } from '@/lib/db/sessions';
import { hashPassword } from '@/lib/crypto/argon2';
import { validateEmail, validatePasswordStrength } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';
import { isSupabaseConfigured, getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/auth/supabase';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Rate Limiting (5 attempts per minute)
  const rateLimit = checkRateLimit(ip, 'auth:reset-password', 5, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many password reset attempts. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, token, otp, password, confirmPassword } = body || {};

    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const verificationToken = token || otp;
    if (!verificationToken) {
      return NextResponse.json(
        { error: 'Verification code is required to reset your password.' },
        { status: 400 }
      );
    }

    if (!password || (confirmPassword && password !== confirmPassword)) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.message }, { status: 400 });
    }

    const cleanToken = verificationToken.toString().trim().replace(/\D/g, '');
    const normalizedEmail = email.trim().toLowerCase();

    // Verify OTP code with Supabase if configured
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseServerClient();
      let verified = false;

      if (supabase) {
        // Try recovery type
        const { data: recData, error: recErr } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: cleanToken,
          type: 'recovery',
        });

        if (!recErr && recData?.user) {
          verified = true;
        } else {
          // Try email type
          const { data: emailData, error: emailErr } = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token: cleanToken,
            type: 'email',
          });
          if (!emailErr && emailData?.user) {
            verified = true;
          }
        }
      }

      if (!verified) {
        return NextResponse.json(
          { error: 'Invalid or expired verification code.' },
          { status: 400 }
        );
      }

      // Update password in Supabase Auth via admin client
      const adminClient = getSupabaseAdminClient();
      if (adminClient?.auth?.admin) {
        try {
          const user = await findUserByEmail(normalizedEmail);
          if (user?.id) {
            await adminClient.auth.admin.updateUserById(user.id, { password });
          }
        } catch (adminErr) {
          console.warn('Supabase admin password update notice:', adminErr.message);
        }
      }
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Hash new password with Argon2id and update database
    const newHash = await hashPassword(password);
    await updateUserPassword(user.id, newHash);

    // Invalidate all old sessions for security
    await revokeAllUserSessions(user.id);

    // Audit log
    await logAuditEvent({
      userId: user.id,
      action: 'auth:password_reset_success',
      status: 'SUCCESS',
      ipAddress: ip,
      userAgent,
      metadata: { email: normalizedEmail },
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully. You can now sign in.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }
}

