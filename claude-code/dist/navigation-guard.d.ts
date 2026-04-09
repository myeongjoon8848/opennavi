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
/**
 * Pre-navigation check that detects when proxy env vars could bypass
 * SSRF protections. When a proxy is configured, the browser may route
 * requests through it — DNS resolution happens on the proxy server,
 * not locally, so our IP checks become ineffective.
 */
export declare function assertNoProxyBypass(policy?: SsrfPolicy): void;
/**
 * Validate each URL in a redirect chain against the SSRF policy.
 * Walks the Playwright Request.redirectedFrom() chain.
 */
export declare function assertRedirectChainAllowed(request: {
    url(): string;
    redirectedFrom(): {
        url(): string;
        redirectedFrom(): any;
    } | null;
} | null, policy?: SsrfPolicy): Promise<void>;
/**
 * Wraps an interaction action (click, type+submit, etc.) and validates
 * any navigation it triggers against the SSRF policy.
 *
 * Three phases:
 * 1. Listen for framenavigated during the action
 * 2. After the action, check if the URL changed (cross-document)
 * 3. If navigation occurred, validate the final URL
 */
export declare function assertInteractionNavigationSafe<T>(opts: {
    action: () => Promise<T>;
    page: {
        url(): string;
        on(event: string, fn: (...args: any[]) => void): void;
        off(event: string, fn: (...args: any[]) => void): void;
        mainFrame?(): any;
    };
    policy?: SsrfPolicy;
}): Promise<T>;
