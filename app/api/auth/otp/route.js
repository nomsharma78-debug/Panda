import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/auth/supabase';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { validateEmail } from '@/lib/validation/schemas';
import { findUserByEmail, syncSupabaseUser } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { getSessionCookieOptions } from '@/lib/auth/session';

export async function POST(request) {
  const ip = getClientIp(request);

  // Rate Limiting
  const rateLimit = checkRateLimit(ip, 'auth:otp', 15, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many verification requests. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { action, email, token, name } = body || {};
    const isSignUp = body.isSignUp === true;

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. ACTION: Send OTP
    if (action === 'send') {
      // If logging in (not signing up), verify user is actually registered in DB
      if (!isSignUp) {
        const existingUser = await findUserByEmail(normalizedEmail);
        if (!existingUser) {
          return NextResponse.json(
            { error: 'No account found with this email address. Please create an account first.' },
            { status: 404 }
          );
        }
      }

      const supabase = getSupabaseServerClient();
      if (supabase) {
        const options = { shouldCreateUser: isSignUp };
        if (name) {
          options.data = { full_name: name.trim(), name: name.trim() };
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options,
        });

        if (error) {
          const errMsg = (error.message || '').toLowerCase();
          if (errMsg.includes('signup') || errMsg.includes('not found') || errMsg.includes('user not found')) {
            return NextResponse.json(
              { error: 'No account found with this email address. Please create an account first.' },
              { status: 404 }
            );
          }
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true, message: 'Verification code sent.' });
    }

    // 2. ACTION: Verify OTP
    if (action === 'verify') {
      const cleanToken = (token || '').toString().trim().replace(/\D/g, '');
      if (!cleanToken || cleanToken.length !== 6) {
        return NextResponse.json({ error: 'Please enter a valid 6-digit verification code.' }, { status: 400 });
      }

      let userId = `user-${Date.now()}`;
      let userName = name || null;

      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: cleanToken,
          type: 'email',
        });

        if (error) {
          return NextResponse.json({ error: error.message || 'Invalid verification code.' }, { status: 400 });
        }

        if (data?.user) {
          userId = data.user.id;
          userName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || userName;
        }
      }

      // Sync user to database
      const user = await syncSupabaseUser({
        id: userId,
        email: normalizedEmail,
        name: userName,
      });

      // Create session cookie
      const { rawToken, expiresAt } = await createSession(user.id);
      const response = NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
      });

      const cookieOptions = getSessionCookieOptions(expiresAt);
      response.cookies.set(cookieOptions.name, rawToken, cookieOptions);

      return response;
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    console.error('OTP Route Error:', err);
    return NextResponse.json({ error: 'Failed to process verification. Please try again.' }, { status: 500 });
  }
}
