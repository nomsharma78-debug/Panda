/**
 * Parse a User-Agent string and/or request headers into human-friendly device, browser, and OS metadata.
 * @param {string} userAgent 
 * @param {object|Headers} [headers] 
 * @returns {{ deviceName: string, browser: string, os: string, deviceType: 'mobile'|'tablet'|'desktop'|'unknown', deviceId: string|null }}
 */
export function parseUserAgent(userAgent = '', headers = null) {
  // 1. Extract explicit headers if available
  let headerDeviceName = null;
  let headerDeviceId = null;
  let headerDeviceOs = null;
  let headerDeviceType = null;
  let secChModel = null;
  let secChPlatform = null;

  if (headers) {
    if (typeof headers.get === 'function') {
      headerDeviceName = headers.get('x-device-name');
      headerDeviceId = headers.get('x-device-id');
      headerDeviceOs = headers.get('x-device-os');
      headerDeviceType = headers.get('x-device-type');
      secChModel = headers.get('sec-ch-ua-model')?.replace(/"/g, '')?.trim();
      secChPlatform = headers.get('sec-ch-ua-platform')?.replace(/"/g, '')?.trim();
    } else if (typeof headers === 'object') {
      headerDeviceName = headers['x-device-name'] || headers['X-Device-Name'];
      headerDeviceId = headers['x-device-id'] || headers['X-Device-Id'];
      headerDeviceOs = headers['x-device-os'] || headers['X-Device-OS'];
      headerDeviceType = headers['x-device-type'] || headers['X-Device-Type'];
      secChModel = (headers['sec-ch-ua-model'] || headers['Sec-Ch-Ua-Model'])?.replace(/"/g, '')?.trim();
      secChPlatform = (headers['sec-ch-ua-platform'] || headers['Sec-Ch-Ua-Platform'])?.replace(/"/g, '')?.trim();
    }
  }

  const rawUa = typeof userAgent === 'string' ? userAgent.trim() : '';
  const uaLower = rawUa.toLowerCase();

  // 2. Check for Panda Mobile App structured User-Agent or okhttp/expo client:
  const pandaMatch = rawUa.match(/PandaMobile(?:\/[\d.]+)?\s*\(([^;)]+)(?:;\s*([^;)]+))?(?:;\s*DeviceId\/([a-zA-Z0-9_-]+))?\)/i);
  const isNativeApp = Boolean(
    pandaMatch ||
    headerDeviceName ||
    headerDeviceId ||
    uaLower.includes('pandamobile') ||
    uaLower.includes('okhttp') ||
    uaLower.includes('reactnative') ||
    uaLower.includes('expo')
  );

  if (isNativeApp) {
    const extractedName = headerDeviceName || (pandaMatch ? pandaMatch[1]?.trim() : '');
    const extractedOs = headerDeviceOs || (pandaMatch ? pandaMatch[2]?.trim() : '');
    const extractedDeviceId = headerDeviceId || (pandaMatch ? pandaMatch[3]?.trim() : null);

    let os = extractedOs;
    if (!os) {
      if (extractedName.toLowerCase().includes('iphone') || extractedName.toLowerCase().includes('ipad')) {
        os = 'iOS';
      } else {
        os = 'Android';
      }
    }

    const isTablet = extractedName.toLowerCase().includes('ipad') || extractedName.toLowerCase().includes('tablet');
    const deviceType = headerDeviceType || (isTablet ? 'tablet' : 'mobile');

    return {
      deviceName: extractedName || (os.includes('iOS') ? 'Apple iPhone' : 'Android Phone'),
      browser: 'Panda Mobile App',
      os: os || 'Mobile OS',
      deviceType,
      deviceId: extractedDeviceId || null,
    };
  }

  if (!rawUa && !secChModel && !secChPlatform) {
    return {
      deviceName: 'Unknown Device',
      browser: 'Web Browser',
      os: 'Unknown OS',
      deviceType: 'desktop',
      deviceId: null,
    };
  }

  const ua = rawUa.toLowerCase();

  // 3. Detect OS & Hardware Device Models
  let os = secChPlatform || 'Unknown OS';
  let deviceType = 'desktop';
  let modelName = secChModel || null;

  if (ua.includes('iphone')) {
    os = 'iOS';
    deviceType = 'mobile';
    modelName = modelName || 'iPhone';
  } else if (ua.includes('ipad')) {
    os = 'iPadOS';
    deviceType = 'tablet';
    modelName = modelName || 'iPad';
  } else if (ua.includes('android')) {
    os = 'Android';
    deviceType = ua.includes('mobile') ? 'mobile' : 'tablet';

    // Extract Android OS Version
    const androidVerMatch = rawUa.match(/Android\s+([\d.]+)/i);
    if (androidVerMatch) {
      os = `Android ${androidVerMatch[1]}`;
    }

    // Extract Hardware Model from Android UA if not supplied by Client Hints
    if (!modelName) {
      const modelMatch = rawUa.match(/;\s*(?:Android\s+[\d.]+;\s*)?([^;)]+)\s*(?:Build\/|;\s*wv|\))/i);
      if (modelMatch && modelMatch[1]) {
        const candidate = modelMatch[1].trim();
        if (candidate.length > 1 && !['k', 'mobile', 'linux', 'arm', 'arm64', 'wv'].includes(candidate.toLowerCase())) {
          modelName = candidate;
        }
      }
    }
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

  // 4. Detect Browser
  let browser = 'Web Browser';
  if (ua.includes('samsungbrowser/')) {
    browser = 'Samsung Internet';
  } else if (ua.includes('edg/') || ua.includes('edge/')) {
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

  // 5. Construct Clean Human-Friendly Device Name
  let deviceName = `${browser} on ${os}`;

  if (deviceType === 'mobile' || deviceType === 'tablet') {
    if (modelName && modelName.toLowerCase() !== 'k') {
      let formattedModel = modelName;
      if (modelName.startsWith('SM-') || modelName.startsWith('GT-')) {
        formattedModel = `Samsung ${modelName}`;
      } else if (modelName.toLowerCase().startsWith('pixel')) {
        formattedModel = `Google ${modelName}`;
      } else if (modelName.toLowerCase().startsWith('redmi') || modelName.toLowerCase().startsWith('mi ')) {
        formattedModel = `Xiaomi ${modelName}`;
      } else if (modelName.startsWith('CPH') || modelName.startsWith('RMX')) {
        formattedModel = `OPPO/Realme ${modelName}`;
      } else if (modelName.startsWith('NE') || modelName.startsWith('KB') || modelName.startsWith('IN20')) {
        formattedModel = `OnePlus ${modelName}`;
      }
      deviceName = `${formattedModel} • ${browser}`;
    } else if (os.includes('iOS') || os.includes('iPhone')) {
      deviceName = `iPhone • ${browser}`;
    } else if (os.includes('iPad')) {
      deviceName = `iPad • ${browser}`;
    } else {
      deviceName = `Android Mobile • ${browser}`;
    }
  }

  return {
    deviceName,
    browser,
    os,
    deviceType,
    deviceId: null,
  };
}

/**
 * Format relative activity timestamp with second-by-second live precision
 * (e.g. "Active now", "Active 5s ago", "Active 1m ago", "Active 2h ago")
 * @param {string|Date} date 
 * @returns {{ label: string, isActiveNow: boolean }}
 */
export function formatRelativeActivity(date) {
  if (!date) return { label: 'Active recently', isActiveNow: false };

  const activeTime = new Date(date).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - activeTime) / 1000));

  // If active within the last 10 seconds, mark as "Active now"
  if (diffSec < 10) {
    return { label: 'Active now', isActiveNow: true };
  }

  // Second-by-second live countdown under 1 minute
  if (diffSec < 60) {
    return { label: `Active ${diffSec}s ago`, isActiveNow: false };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { label: `Active ${diffMin}m ago`, isActiveNow: false };
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return { label: `Active ${diffHours}h ago`, isActiveNow: false };
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return { label: 'Active yesterday', isActiveNow: false };
  }
  if (diffDays < 7) {
    return { label: `Active ${diffDays}d ago`, isActiveNow: false };
  }

  return { label: `Active on ${new Date(date).toLocaleDateString()}`, isActiveNow: false };
}
