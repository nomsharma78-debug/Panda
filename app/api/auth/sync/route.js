import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { syncSupabaseUser } from '@/lib/db/users';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { name, password } = body || {};

    const user = await syncSupabaseUser({
      id: authData.user.id,
      email: authData.user.email,
      name: name ? name.trim() : authData.user.name,
      password: password || null,
    });

    return NextResponse.json({
      success: true,
      user,
      message: 'User synced successfully.',
    });
  } catch (err) {
    console.error('User sync route error:', err);
    return NextResponse.json({ error: 'Failed to sync user.' }, { status: 500 });
  }
}

