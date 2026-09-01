import { NextResponse } from 'next/server';
import { findUserByEmail, syncSupabaseUser } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { verifyPassword } from '@/lib/crypto/argon2';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';
import { getSessionCookieOptions } from '@/lib/auth/session';
import { isSupabaseConfigured, getSupabaseServerClient } from '@/lib/auth/supabase';

export async function POST(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Rate Limiting (15 attempts per minute per IP)
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

    const cleanEmail = email.trim().toLowerCase();

    // 1. Try Supabase Auth First (if Supabase is configured)
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

          if (!error && data?.user) {
            const userName =
              data.user.user_metadata?.full_name ||
              data.user.user_metadata?.name ||
              null;

            // Sync to public.users
            await syncSupabaseUser({
              id: data.user.id,
              email: cleanEmail,
              name: userName,
              password,
            });

            // Create session
            const { rawToken, expiresAt } = await createSession(data.user.id, { userAgent, ipAddress: ip });

            await logAuditEvent({
              userId: data.user.id,
              action: 'auth:login',
              status: 'SUCCESS',
              ipAddress: ip,
              userAgent,
              metadata: { email: cleanEmail, provider: 'supabase' },
            });

            const response = NextResponse.json({
              success: true,
              user: { id: data.user.id, email: cleanEmail, name: userName },
              message: 'Login successful.',
            });

            const cookieOptions = getSessionCookieOptions(expiresAt);
            response.cookies.set(cookieOptions.name, rawToken, cookieOptions);
            return response;
          }

          if (error) {
            // Check for specific Supabase Auth error (e.g. Email not confirmed)
            if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
              return NextResponse.json(
                { error: 'Your email is not confirmed yet. Please check your inbox or turn off "Confirm Email" in Supabase Auth settings.' },
                { status: 403 }
              );
            }
          }
        } catch (sbErr) {
          console.warn('Supabase server login notice:', sbErr.message);
        }
      }
    }

    // 2. Fallback to direct PostgreSQL / Argon2 Password Verification
    const user = await findUserByEmail(cleanEmail);
    if (!user || !user.password_hash) {
      await logAuditEvent({
        action: 'auth:login_failed',
        status: 'FAILED',
        ipAddress: ip,
        userAgent,
        metadata: { emailAttempt: cleanEmail },
      });
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
        metadata: { emailAttempt: cleanEmail },
      });
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Create session
    const { rawToken, expiresAt } = await createSession(user.id, { userAgent, ipAddress: ip });

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
      user: { id: user.id, email: user.email, name: user.name },
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
