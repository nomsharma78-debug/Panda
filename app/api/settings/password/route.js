import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { findUserById, updateUserPassword, findUserByEmail } from '@/lib/db/users';
import { hashPassword, verifyPassword } from '@/lib/crypto/argon2';
import { validatePasswordStrength } from '@/lib/validation/schemas';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);

  try {
    const body = await request.json();
    const { currentPassword, newPassword, confirmNewPassword } = body || {};

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 });
    }

    if (newPassword !== confirmNewPassword) {
      return NextResponse.json({ error: 'New passwords do not match' }, { status: 400 });
    }

    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.message }, { status: 400 });
    }

    // Retrieve full user record to verify current password
    const user = await findUserByEmail(authData.user.email);
    if (!user) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    const isCurrentValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      await logAuditEvent({
        userId: authData.user.id,
        action: 'auth:password_change_failed',
        status: 'FAILED',
        ipAddress: ip,
      });
      return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 });
    }

    // Hash new password with Argon2id
    const newHash = await hashPassword(newPassword);
    await updateUserPassword(authData.user.id, newHash);

    await logAuditEvent({
      userId: authData.user.id,
      action: 'auth:password_changed',
      status: 'SUCCESS',
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    console.error('Password change error:', err);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }
}
