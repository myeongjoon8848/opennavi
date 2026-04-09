"use strict";
/**
 * SSRF Navigation Guard
 *
 * Validates URLs before and after browser navigation to prevent
 * Server-Side Request Forgery (SSRF) attacks. Blocks navigation to
 * private/internal networks, loopback addresses, and cloud metadata
 * endpoints unless explicitly allowed by policy.
 *
 * Inspired by OpenClaw's navigation-guard and ssrf modules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationBlockedError = void 0;
exports.assertNavigationAllowed = assertNavigationAllowed;
exports.assertNavigationResultAllowed = assertNavigationResultAllowed;
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const DEFAULT_POLICY = {
    allowPrivateNetwork: false,
};
// ---------------------------------------------------------------------------
// Blocked hostname patterns
// ---------------------------------------------------------------------------
const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal", // GCP metadata
    "metadata.internal",
]);
const BLOCKED_HOSTNAME_SUFFIXES = [
    ".localhost",
    ".local",
    ".internal",
];
function isBlockedHostname(hostname) {
    const lower = hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(lower))
        return true;
    return BLOCKED_HOSTNAME_SUFFIXES.some((s) => lower.endsWith(s));
}
// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------
/**
 * Check if an IPv4 or IPv6 address is private/loopback/special-use.
 *
 * Blocked ranges:
 *   IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *          169.254.0.0/16 (link-local), 0.0.0.0/8,
 *          100.64.0.0/10 (CGNAT), 198.18.0.0/15 (benchmark),
 *          198.51.100.0/24, 203.0.113.0/24 (documentation),
 *          192.0.0.0/24, 192.0.2.0/24 (documentation)
 *   IPv6: ::1, fc00::/7 (unique local), fe80::/10 (link-local),
 *          ::ffff:0:0/96 (IPv4-mapped — re-checks the embedded IPv4)
 */
function isPrivateIp(ip) {
    const version = (0, node_net_1.isIP)(ip);
    if (version === 0)
        return true; // invalid → block
    if (version === 4) {
        return isPrivateIpv4(ip);
    }
    // IPv6
    const lower = ip.toLowerCase();
    // Loopback
    if (lower === "::1")
        return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
    if (v4mapped)
        return isPrivateIpv4(v4mapped[1]);
    // Unique local (fc00::/7)
    if (/^f[cd]/i.test(lower))
        return true;
    // Link-local (fe80::/10)
    if (/^fe[89ab]/i.test(lower))
        return true;
    // Unspecified
    if (lower === "::")
        return true;
    return false;
}
function isPrivateIpv4(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return true; // malformed → block
    }
    const [a, b, c] = parts;
    // 0.0.0.0/8
    if (a === 0)
        return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127)
        return true;
    // 10.0.0.0/8
    if (a === 10)
        return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168)
        return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254)
        return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127)
        return true;
    // 198.18.0.0/15 (benchmark)
    if (a === 198 && (b === 18 || b === 19))
        return true;
    // 198.51.100.0/24 (documentation)
    if (a === 198 && b === 51 && c === 100)
        return true;
    // 203.0.113.0/24 (documentation)
    if (a === 203 && b === 0 && c === 113)
        return true;
    // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 0)
        return true;
    // 192.0.2.0/24 (documentation)
    if (a === 192 && b === 0 && c === 2)
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// Hostname allowlist check
// ---------------------------------------------------------------------------
function isAllowlisted(hostname, policy) {
    const allowlist = policy.hostnameAllowlist;
    if (!allowlist?.length)
        return false;
    const lower = hostname.toLowerCase();
    return allowlist.some((entry) => {
        const e = entry.toLowerCase();
        return lower === e || lower.endsWith("." + e);
    });
}
// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------
class NavigationBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = "NavigationBlockedError";
    }
}
exports.NavigationBlockedError = NavigationBlockedError;
/**
 * Validate a URL before navigation.
 * Performs hostname and DNS-resolved IP checks.
 */
async function assertNavigationAllowed(url, policy) {
    const resolved = policy ?? DEFAULT_POLICY;
    // Skip all checks if private network is allowed
    if (resolved.allowPrivateNetwork)
        return;
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new NavigationBlockedError(`Navigation blocked: invalid URL "${url}"`);
    }
    // Only allow http/https (and about:blank)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        if (url === "about:blank")
            return;
        throw new NavigationBlockedError(`Navigation blocked: unsupported protocol "${parsed.protocol}"`);
    }
    const hostname = parsed.hostname;
    // Check allowlist first
    if (isAllowlisted(hostname, resolved))
        return;
    // Phase 1: hostname pattern check (before DNS)
    if (isBlockedHostname(hostname)) {
        throw new NavigationBlockedError(`Navigation blocked: hostname "${hostname}" resolves to a private/internal network`);
    }
    // Phase 1b: literal IP check (before DNS)
    if ((0, node_net_1.isIP)(hostname) && isPrivateIp(hostname)) {
        throw new NavigationBlockedError(`Navigation blocked: "${hostname}" is a private/loopback address`);
    }
    // Phase 2: DNS resolution check
    // Only resolve if it's not already a literal IP
    if (!(0, node_net_1.isIP)(hostname)) {
        try {
            const results = await (0, promises_1.lookup)(hostname, { all: true });
            const addresses = Array.isArray(results) ? results : [results];
            for (const entry of addresses) {
                if (isPrivateIp(entry.address)) {
                    throw new NavigationBlockedError(`Navigation blocked: "${hostname}" resolves to private address ${entry.address}`);
                }
            }
        }
        catch (err) {
            // Re-throw NavigationBlockedError
            if (err instanceof NavigationBlockedError)
                throw err;
            // DNS failure — let the browser handle it (will show net::ERR_NAME_NOT_RESOLVED)
        }
    }
}
/**
 * Validate the final URL after navigation (post-redirect check).
 * Catches redirects that land on private/internal addresses.
 */
async function assertNavigationResultAllowed(url, policy) {
    // Blank pages and data URIs are always ok post-navigation
    if (!url || url === "about:blank" || url.startsWith("data:"))
        return;
    await assertNavigationAllowed(url, policy);
}
