import { NextResponse } from 'next/server';
import { createUser, findUserByEmail, syncSupabaseUser } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { hashPassword } from '@/lib/crypto/argon2';
import { validateEmail } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';
import { getSessionCookieOptions } from '@/lib/auth/session';
import { isSupabaseConfigured, getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/auth/supabase';

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

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name ? name.trim() : null;

    let userId = null;

    // 1. If Supabase is configured, create/sign up with Supabase Auth
    if (isSupabaseConfigured()) {
      const adminClient = getSupabaseAdminClient();
      if (adminClient && adminClient.auth?.admin) {
        try {
          const { data: adminData, error: adminErr } = await adminClient.auth.admin.createUser({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: cleanName, name: cleanName },
          });

          if (!adminErr && adminData?.user) {
            userId = adminData.user.id;
          }
        } catch {}
      }

      if (!userId) {
        const serverClient = getSupabaseServerClient();
        if (serverClient) {
          try {
            const { data: signupData, error: signupErr } = await serverClient.auth.signUp({
              email: cleanEmail,
              password,
              options: {
                data: { full_name: cleanName, name: cleanName },
              },
            });

            if (signupErr) {
              return NextResponse.json({ error: signupErr.message }, { status: 400 });
            }

            if (signupData?.user) {
              userId = signupData.user.id;
            }
          } catch (sbErr) {
            console.warn('Supabase register error:', sbErr.message);
          }
        }
      }
    }

    // 2. Hash password with Argon2id and save into PostgreSQL public.users
    const passwordHash = await hashPassword(password);
    const user = await syncSupabaseUser({
      id: userId || `user-${Date.now()}`,
      email: cleanEmail,
      name: cleanName,
      password,
      passwordHash,
    });

    // 3. Create initial session
    const { rawToken, expiresAt } = await createSession(user.id, { userAgent, ipAddress: ip });

    // 4. Audit log
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
