import { NextResponse } from 'next/server';
import { syncSupabaseUser, createUser } from '@/lib/db/users';
import { createSession } from '@/lib/db/sessions';
import { getSessionCookieOptions } from '@/lib/auth/session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, email, name, password } = body || {};

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    // Sync to Supabase & Postgres databases
    const user = await syncSupabaseUser({
      id: id || `user-${Date.now()}`,
      email: email.trim().toLowerCase(),
      name: name ? name.trim() : null,
    });

    const { rawToken, expiresAt } = await createSession(user.id);
    const response = NextResponse.json({
      success: true,
      user,
      message: 'User synced successfully.',
    });

    const cookieOptions = getSessionCookieOptions(expiresAt);
    response.cookies.set(cookieOptions.name, rawToken, cookieOptions);

    return response;
  } catch (err) {
    console.error('User sync route error:', err);
    return NextResponse.json({ error: 'Failed to sync user.' }, { status: 500 });
  }
}
