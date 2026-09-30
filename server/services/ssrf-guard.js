/**
 * @file services/ssrf-guard.js
 * @description Guards outbound "connect to this host" actions against SSRF.
 *
 * yDB is a self-hosted database tool, so connecting to hosts on private
 * networks (10.x, 192.168.x, localhost, etc.) is a legitimate, common case.
 * We therefore do NOT block private ranges by default. What we always block
 * is the cloud instance metadata endpoint (169.254.169.254 / fd00:ec2::254),
 * the highest-value SSRF target, since a DB connection has no reason to reach it.
 *
 * Deployments that want stricter behaviour can set YDB_BLOCK_PRIVATE_HOSTS=true
 * to also reject loopback, link-local, and RFC1918 / unique-local addresses.
 */

const dns = require('dns').promises;
const net = require('net');

// Cloud metadata endpoints — always blocked.
const METADATA_IPS = new Set([
    '169.254.169.254',        // AWS, GCP, Azure, DigitalOcean, OpenStack
    'fd00:ec2::254',          // AWS IMDS over IPv6
    '100.100.100.200'         // Alibaba Cloud
]);

const BLOCK_PRIVATE = String(process.env.YDB_BLOCK_PRIVATE_HOSTS || '').toLowerCase() === 'true';

/** Parse an IPv4 string into its four octets, or null if not IPv4. */
function ipv4Octets(ip) {
    if (net.isIPv4(ip) !== true) return null;
    return ip.split('.').map(Number);
}

/** True for RFC1918 / loopback / link-local IPv4. */
function isPrivateIPv4(ip) {
    const o = ipv4Octets(ip);
    if (!o) return false;
    const [a, b] = o;
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // loopback
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 169 && b === 254) return true;           // link-local
    if (a === 0) return true;                          // 0.0.0.0/8
    return false;
}

/** True for loopback / link-local / unique-local IPv6. */
function isPrivateIPv6(ip) {
    if (net.isIPv6(ip) !== true) return false;
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;                  // loopback
    if (lower.startsWith('fe80')) return true;         // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
}

/** True if the resolved IP is a cloud metadata address. */
function isMetadataIP(ip) {
    return METADATA_IPS.has(ip.toLowerCase());
}

/**
 * Validate a host before connecting.
 * Resolves the hostname and inspects every resolved address.
 * @param {string} host - hostname or IP the caller wants to connect to
 * @throws {Error} if the host is disallowed
 * @returns {Promise<void>}
 */
async function assertHostAllowed(host) {
    if (!host || typeof host !== 'string') {
        throw new Error('A host is required');
    }
    const trimmed = host.trim();

    // Collect candidate IPs: the literal (if it is one) plus DNS resolutions.
    const candidates = [];
    if (net.isIP(trimmed)) {
        candidates.push(trimmed);
    } else {
        // Common loopback aliases resolve locally; check the name too.
        if (['localhost'].includes(trimmed.toLowerCase()) && BLOCK_PRIVATE) {
            throw new Error('Connections to localhost are not allowed by policy');
        }
        let resolved = [];
        try {
            resolved = await dns.lookup(trimmed, { all: true });
        } catch (err) {
            throw new Error(`Could not resolve host: ${trimmed}`);
        }
        for (const r of resolved) candidates.push(r.address);
    }

    if (!candidates.length) {
        throw new Error(`Could not resolve host: ${trimmed}`);
    }

    for (const ip of candidates) {
        if (isMetadataIP(ip)) {
            throw new Error('Connections to the cloud metadata endpoint are not allowed');
        }
        if (BLOCK_PRIVATE && (isPrivateIPv4(ip) || isPrivateIPv6(ip))) {
            throw new Error('Connections to private/internal addresses are not allowed by policy');
        }
    }
}

module.exports = {
    assertHostAllowed,
    // exported for testing
    isPrivateIPv4,
    isPrivateIPv6,
    isMetadataIP
};
