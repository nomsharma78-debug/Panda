import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserSessions, touchDeviceSession, revokeSessionById, revokeAllUserSessions } from '@/lib/db/sessions';
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

  // Touch current device session in DB (verifies active status)
  await touchDeviceSession(authData.user.id, currentUserAgent, currentIp).catch(() => {});

  try {
    const rawSessions = await listUserSessions(authData.user.id);
    const sessions = rawSessions || [];

    // Deduplicate sessions per physical device/browser to avoid stale clutter
    // Key: deviceName (e.g. "Microsoft Edge on Windows", "iPhone • Safari", "Android • Chrome")
    const deviceMap = new Map();
    const duplicateIdsToDelete = [];

    // Sort raw sessions by last_active_at / created_at descending (newest first)
    sessions.sort((a, b) => {
      const timeA = new Date(a.last_active_at || a.created_at || 0).getTime();
      const timeB = new Date(b.last_active_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    for (const s of sessions) {
      const parsed = parseUserAgent(s.user_agent || currentUserAgent);
      const isCurrentDevice =
        s.id === currentSessionId ||
        s.id === authData.session.id ||
        (s.user_agent && currentUserAgent && s.user_agent === currentUserAgent);

      const deviceKey = isCurrentDevice
        ? '__current_active_device__'
        : `${parsed.deviceName}_${s.ip_address || ''}`;

      if (!deviceMap.has(deviceKey)) {
        deviceMap.set(deviceKey, { session: s, isCurrent: isCurrentDevice, parsed });
      } else {
        // Stale duplicate record for same device -> mark for deletion
        if (s.id && s.id !== currentSessionId) {
          duplicateIdsToDelete.push(s.id);
        }
      }
    }

    // Clean up stale duplicate session records in background
    if (duplicateIdsToDelete.length > 0) {
      Promise.all(duplicateIdsToDelete.map((id) => revokeSessionById(id, authData.user.id))).catch(() => {});
    }

    // If current device was not in DB, add it
    if (!deviceMap.has('__current_active_device__')) {
      const parsed = parseUserAgent(currentUserAgent);
      deviceMap.set('__current_active_device__', {
        session: {
          id: currentSessionId || authData.session.id || 'current-session',
          user_id: authData.user.id,
          user_agent: currentUserAgent,
          ip_address: currentIp,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        },
        isCurrent: true,
        parsed,
      });
    }

    const formatted = Array.from(deviceMap.values()).map(({ session: s, isCurrent, parsed }) => {
      const activity = formatRelativeActivity(s.last_active_at || s.created_at);

      return {
        id: s.id,
        deviceName: parsed.deviceName,
        browser: parsed.browser,
        os: parsed.os,
        deviceType: parsed.deviceType,
        ipAddress: isCurrent ? currentIp : (s.ip_address || '—'),
        // ONLY the current live device gets "Active now". Other devices show elapsed time.
        lastActiveLabel: isCurrent ? 'Active now' : (activity.label === 'Active now' ? 'Active 1 min ago' : activity.label),
        isActiveNow: isCurrent,
        lastActiveAt: s.last_active_at || s.created_at,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isCurrent,
      };
    });

    // Ensure current device session is at the top
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

    // 2. Revoke all other sessions (Keep only current active device session)
    if (revokeAll || body.revokeOthers) {
      const currentUa = request.headers.get('user-agent') || '';
      const allSessions = await listUserSessions(authData.user.id);

      for (const s of allSessions) {
        const isCurrent = s.id === authData.session.id || (s.user_agent && currentUa && s.user_agent === currentUa);
        if (!isCurrent) {
          await revokeSessionById(s.id, authData.user.id);
        }
      }

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
        message: 'All other device sessions have been revoked.',
      });
    }

    // 3. Fallback: revoke all
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
