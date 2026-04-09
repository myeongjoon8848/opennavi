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
export interface SsrfPolicy {
    /** Allow navigation to private/loopback IPs (default: false) */
    allowPrivateNetwork?: boolean;
    /** Hostnames that bypass private-network checks */
    hostnameAllowlist?: string[];
}
export declare class NavigationBlockedError extends Error {
    constructor(message: string);
}
/**
 * Validate a URL before navigation.
 * Performs hostname and DNS-resolved IP checks.
 */
export declare function assertNavigationAllowed(url: string, policy?: SsrfPolicy): Promise<void>;
/**
 * Validate the final URL after navigation (post-redirect check).
 * Catches redirects that land on private/internal addresses.
 */
export declare function assertNavigationResultAllowed(url: string, policy?: SsrfPolicy): Promise<void>;
