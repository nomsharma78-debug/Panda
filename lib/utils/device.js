/**
 * Parse a User-Agent string into human-friendly device, browser, and OS metadata.
 * @param {string} userAgent 
 * @returns {{ deviceName: string, browser: string, os: string, deviceType: 'mobile'|'tablet'|'desktop'|'unknown' }}
 */
export function parseUserAgent(userAgent = '') {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      deviceName: 'Unknown Device',
      browser: 'Web Browser',
      os: 'Unknown OS',
      deviceType: 'desktop',
    };
  }

  const ua = userAgent.toLowerCase();

  // 1. Detect OS
  let os = 'Unknown OS';
  let deviceType = 'desktop';

  if (ua.includes('iphone')) {
    os = 'iOS (iPhone)';
    deviceType = 'mobile';
  } else if (ua.includes('ipad')) {
    os = 'iPadOS';
    deviceType = 'tablet';
  } else if (ua.includes('android')) {
    os = 'Android';
    deviceType = ua.includes('mobile') ? 'mobile' : 'tablet';
  } else if (ua.includes('windows nt 10.0') || ua.includes('windows nt 11.0') || ua.includes('windows 10') || ua.includes('windows 11')) {
    os = 'Windows';
    deviceType = 'desktop';
  } else if (ua.includes('windows')) {
    os = 'Windows';
    deviceType = 'desktop';
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    os = 'macOS';
    deviceType = 'desktop';
  } else if (ua.includes('linux')) {
    os = 'Linux';
    deviceType = 'desktop';
  } else if (ua.includes('cros')) {
    os = 'ChromeOS';
    deviceType = 'desktop';
  }

  // 2. Detect Browser
  let browser = 'Web Browser';
  if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('opr/') || ua.includes('opera/')) {
    browser = 'Opera';
  } else if (ua.includes('brave')) {
    browser = 'Brave';
  } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
    browser = 'Chrome';
  } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('firefox/')) {
    browser = 'Firefox';
  }

  // 3. Construct Composite Device Name
  let deviceName = `${browser} on ${os}`;
  if (deviceType === 'mobile' && os.includes('iPhone')) {
    deviceName = `iPhone • ${browser}`;
  } else if (deviceType === 'mobile' && os === 'Android') {
    deviceName = `Android • ${browser}`;
  } else if (deviceType === 'tablet') {
    deviceName = `iPad • ${browser}`;
  }

  return {
    deviceName,
    browser,
    os,
    deviceType,
  };
}

/**
 * Format relative activity timestamp (e.g. "Active now", "Active 5 mins ago", "Active 2 hours ago")
 * @param {string|Date} date 
 * @returns {{ label: string, isActiveNow: boolean }}
 */
export function formatRelativeActivity(date) {
  if (!date) return { label: 'Active recently', isActiveNow: false };

  const activeTime = new Date(date).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - activeTime) / 1000));

  // If active within the last 120 seconds (2 minutes), mark as "Active now"
  if (diffSec < 120) {
    return { label: 'Active now', isActiveNow: true };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { label: `Active ${diffMin} ${diffMin === 1 ? 'min' : 'mins'} ago`, isActiveNow: false };
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return { label: `Active ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`, isActiveNow: false };
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return { label: 'Active yesterday', isActiveNow: false };
  }
  if (diffDays < 7) {
    return { label: `Active ${diffDays} days ago`, isActiveNow: false };
  }

  return { label: `Active on ${new Date(date).toLocaleDateString()}`, isActiveNow: false };
}
