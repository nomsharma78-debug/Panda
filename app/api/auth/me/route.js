import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { findUserById } from '@/lib/db/users';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData || !authData.user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  let dbUser = null;
  try {
    dbUser = await findUserById(authData.user.id);
  } catch {}

  const inactivityMinutes = dbUser?.inactivity_timeout_minutes || 15;

  return NextResponse.json({
    authenticated: true,
    user: {
      id: authData.user.id,
      email: authData.user.email,
      name: dbUser?.name || authData.user.name || null,
      inactivity_timeout_minutes: inactivityMinutes,
      createdAt: dbUser?.created_at || authData.user.createdAt,
    },
    session: {
      id: authData.session.id,
      expiresAt: authData.session.expiresAt,
    },
  });
}

