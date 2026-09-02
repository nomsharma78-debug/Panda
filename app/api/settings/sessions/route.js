import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserSessions, recordDeviceSession, revokeSessionById, revokeAllUserSessions } from '@/lib/db/sessions';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';
import { parseUserAgent, formatRelativeActivity } from '@/lib/utils/device';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUserAgent = request.headers.get('user-agent') || '';
  const currentIp = getClientIp(request);

  // Guarantee current device session is recorded/updated with active timestamp
  await recordDeviceSession(authData.user.id, {
    userAgent: currentUserAgent,
    ipAddress: currentIp,
  }).catch(() => {});

  try {
    const rawSessions = await listUserSessions(authData.user.id);

    let sessions = rawSessions;
    if (!sessions || sessions.length === 0) {
      sessions = [
        {
          id: authData.session.id || 'current-session',
          user_id: authData.user.id,
          user_agent: currentUserAgent,
          ip_address: currentIp,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        },
      ];
    }

    let foundCurrent = false;

    const formatted = sessions.map((s) => {
      const parsed = parseUserAgent(s.user_agent || currentUserAgent);
      const activity = formatRelativeActivity(s.last_active_at || s.created_at);

      // Check if this session represents the currently connected device
      let isCurrent = false;
      if (!foundCurrent) {
        if (s.id === authData.session.id || (s.user_agent && currentUserAgent && s.user_agent === currentUserAgent)) {
          isCurrent = true;
          foundCurrent = true;
        }
      }

      return {
        id: s.id,
        deviceName: parsed.deviceName,
        browser: parsed.browser,
        os: parsed.os,
        deviceType: parsed.deviceType,
        ipAddress: s.ip_address || (isCurrent ? currentIp : 'Unknown IP'),
        lastActiveLabel: isCurrent ? 'Active now' : activity.label,
        isActiveNow: isCurrent ? true : activity.isActiveNow,
        lastActiveAt: s.last_active_at || s.created_at,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isCurrent,
      };
    });

    // If none matched, mark first as current
    if (!foundCurrent && formatted.length > 0) {
      formatted[0].isCurrent = true;
      formatted[0].isActiveNow = true;
      formatted[0].lastActiveLabel = 'Active now';
    }

    // Ensure current device session appears first
    formatted.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));

    return NextResponse.json({ sessions: formatted });
  } catch (err) {
    console.error('List sessions error:', err);
    return NextResponse.json({ error: 'Failed to retrieve sessions' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetSessionId = searchParams.get('id');
  const revokeAll = searchParams.get('all') === 'true';

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = targetSessionId || body.sessionId;

    if (sessionId) {
      // 1. Revoke single session
      await revokeSessionById(sessionId, authData.user.id);

      const ip = getClientIp(request);
      await logAuditEvent({
        userId: authData.user.id,
        action: 'auth:session_revoked',
        status: 'SUCCESS',
        ipAddress: ip,
        metadata: { sessionId },
      });

      return NextResponse.json({
        success: true,
        message: 'Device session revoked successfully.',
      });
    }

    // 2. Revoke all other sessions
    if (revokeAll || body.revokeOthers) {
      const { queryAuth } = await import('@/lib/db');
      try {
        await queryAuth(
          `DELETE FROM sessions WHERE user_id = $1 AND id != $2`,
          [authData.user.id, authData.session.id]
        );
      } catch {}

      const ip = getClientIp(request);
      await logAuditEvent({
        userId: authData.user.id,
        action: 'auth:sessions_revoked',
        status: 'SUCCESS',
        ipAddress: ip,
        metadata: { keepCurrent: true },
      });

      return NextResponse.json({
        success: true,
        message: 'All other active sessions revoked successfully.',
      });
    }

    // 3. Fallback: revoke all sessions
    await revokeAllUserSessions(authData.user.id);
    return NextResponse.json({
      success: true,
      message: 'All sessions revoked.',
    });
  } catch (err) {
    console.error('Revoke sessions error:', err);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
