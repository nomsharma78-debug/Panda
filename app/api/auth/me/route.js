import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData || !authData.user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: authData.user.id,
      email: authData.user.email,
      name: authData.user.name || null,
      createdAt: authData.user.createdAt,
    },
    session: {
      id: authData.session.id,
      expiresAt: authData.session.expiresAt,
    },
  });
}
