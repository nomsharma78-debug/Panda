import dns from 'dns/promises';
import net from 'net';

/**
 * Check if an IPv4 address falls into private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [a, b, c, d] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local & AWS/Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 100.64.0.0/10 (Shared address space / Carrier Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Check if an IPv6 address falls into private, loopback, or link-local ranges.
 */
export function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase().trim();

  // ::1 / :: (Loopback & unspecified)
  if (normalized === '::1' || normalized === '::' || normalized === '0:0:0:0:0:0:0:1') return true;

  // fe80::/10 (Link-local)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // fc00::/7 (Unique local address / private IPv6)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.replace('::ffff:', '');
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  return false;
}

/**
 * Validate a storage endpoint URL against SSRF attacks.
 * @param {string} endpointUrl - Target URL to test.
 * @param {boolean} [allowHttpInDev=true] - Allow http only in local development.
 * @returns {Promise<{ valid: boolean, error?: string, sanitizedUrl?: string }>}
 */
export async function validateStorageEndpoint(endpointUrl, allowHttpInDev = true) {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return { valid: false, error: 'Endpoint URL is required' };
  }

  let parsedUrl;
  try {
    let urlToParse = endpointUrl.trim();
    if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
      urlToParse = `https://${urlToParse}`;
    }
    parsedUrl = new URL(urlToParse);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Enforce protocol
  const isDev = process.env.NODE_ENV !== 'production';
  if (parsedUrl.protocol !== 'https:' && (parsedUrl.protocol !== 'http:' || (!isDev && !allowHttpInDev))) {
    return { valid: false, error: 'Only HTTPS endpoints are permitted in production' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Explicit blacklist for dangerous hostnames
  const forbiddenHosts = [
    'localhost',
    'metadata.google.internal',
    'instance-data',
    '169.254.169.254',
    'metadata',
  ];

  if (
    forbiddenHosts.includes(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return { valid: false, error: 'Access to internal or loopback hostnames is forbidden' };
  }

  // If host is a direct IP address
  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return { valid: false, error: 'Access to private or restricted IPv4 addresses is forbidden' };
    }
    return { valid: true, sanitizedUrl: parsedUrl.origin };
  }

  if (net.isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      return { valid: false, error: 'Access to private or restricted IPv6 addresses is forbidden' };
    }
    return { valid: true, sanitizedUrl: parsedUrl.origin };
  }

  // Resolve DNS to verify all resolved IPs (prevents DNS rebinding and internal IP aliases)
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: 'Storage endpoint hostname could not be resolved' };
    }

    for (const record of addresses) {
      if (record.family === 4 && isPrivateIPv4(record.address)) {
        return { valid: false, error: `Endpoint resolves to restricted private IP: ${record.address}` };
      }
      if (record.family === 6 && isPrivateIPv6(record.address)) {
        return { valid: false, error: `Endpoint resolves to restricted IPv6 address: ${record.address}` };
      }
    }
  } catch (dnsErr) {
    return { valid: false, error: `DNS resolution failed for hostname '${hostname}': ${dnsErr.message}` };
  }

  return { valid: true, sanitizedUrl: parsedUrl.origin };
}
