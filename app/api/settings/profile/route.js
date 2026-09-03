import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { syncSupabaseUser } from '@/lib/db/users';
import { getSupabaseAdminClient } from '@/lib/auth/supabase';
import { queryAuth, queryVault } from '@/lib/db';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await request.json();
    const trimmedName = typeof name === 'string' ? name.trim() : null;

    if (!trimmedName) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    const userId = authData.user.id;
    const email = authData.user.email;
    const now = new Date().toISOString();

    // 1. Update Supabase Auth user metadata
    try {
      const admin = getSupabaseAdminClient();
      if (admin) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { full_name: trimmedName, name: trimmedName },
        });
      }
    } catch (sbErr) {
      console.warn('[Profile API] Supabase auth update notice:', sbErr.message);
    }

    // 2. Update Database 1 & Database 2 users tables
    await Promise.allSettled([
      syncSupabaseUser({ id: userId, email, name: trimmedName }),
      queryAuth(
        `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3 OR email = $4`,
        [trimmedName, now, userId, email]
      ),
      queryVault(
        `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3 OR email = $4`,
        [trimmedName, now, userId, email]
      ),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: userId,
        email,
        name: trimmedName,
      },
    });
  } catch (err) {
    console.error('[Profile API] Error updating profile:', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
