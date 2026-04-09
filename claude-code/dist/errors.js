"use strict";
// ---------------------------------------------------------------------------
// Typed error hierarchy
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserConnectionError = exports.BrowserNavigationBlockedError = exports.BrowserTabNotFoundError = exports.BrowserValidationError = exports.BrowserError = void 0;
exports.toAIFriendlyError = toAIFriendlyError;
/**
 * Base error class for all browser-related errors.
 * Carries a semantic status code for structured error handling.
 */
class BrowserError extends Error {
    status;
    constructor(message, status = 500, options) {
        super(message, options);
        this.name = new.target.name;
        this.status = status;
    }
}
exports.BrowserError = BrowserError;
/** 400 — invalid input parameters */
class BrowserValidationError extends BrowserError {
    constructor(message, options) {
        super(message, 400, options);
    }
}
exports.BrowserValidationError = BrowserValidationError;
/** 404 — tab not found */
class BrowserTabNotFoundError extends BrowserError {
    constructor(message = "Tab not found. Use action='tabs' to list open tabs.", options) {
        super(message, 404, options);
    }
}
exports.BrowserTabNotFoundError = BrowserTabNotFoundError;
/** 400 — navigation blocked by SSRF guard */
class BrowserNavigationBlockedError extends BrowserError {
    constructor(message, options) {
        super(message, 400, options);
    }
}
exports.BrowserNavigationBlockedError = BrowserNavigationBlockedError;
/** 503 — browser connection unavailable */
class BrowserConnectionError extends BrowserError {
    constructor(message, options) {
        super(message, 503, options);
    }
}
exports.BrowserConnectionError = BrowserConnectionError;
// ---------------------------------------------------------------------------
// AI-friendly error transformation
// ---------------------------------------------------------------------------
/**
 * Transforms raw Playwright errors into actionable, AI-friendly messages
 * that guide the agent toward the correct recovery action.
 */
function toAIFriendlyError(err) {
    // Typed errors already have clear messages
    if (err instanceof BrowserError) {
        return err.message;
    }
    const raw = err instanceof Error ? err.message : String(err);
    // Timeout errors
    if (raw.includes("Timeout") && raw.includes("exceeded")) {
        if (raw.includes("waiting for locator") || raw.includes("waitFor")) {
            return `Element not found within timeout. The element may not be visible or may have changed. Try: take a new snapshot to get updated refs, or increase timeoutMs.`;
        }
        if (raw.includes("page.goto") || raw.includes("navigate")) {
            return `Navigation timed out. The page may still be loading background resources. The current page content is likely usable — try taking a snapshot.`;
        }
        return `Operation timed out: ${raw}. Try increasing timeoutMs or check if the page is still responsive.`;
    }
    // Element not found / stale ref
    if (raw.includes("Unknown ref")) {
        return `${raw} Element refs change after every snapshot. Take a new snapshot to get fresh refs.`;
    }
    // Element not interactable
    if (raw.includes("intercepts pointer events") || raw.includes("not interactable")) {
        return `Element is covered by an overlay (modal, cookie banner, etc.). Try: close the overlay first, or use evaluate to scroll/dismiss it.`;
    }
    // Element not visible
    if (raw.includes("not visible") || raw.includes("outside of the viewport")) {
        return `Element is not visible in the viewport. Try: use act kind="wait" with the element's text, or use evaluate to scroll it into view.`;
    }
    // Strict mode violation (multiple elements matched)
    const strictMatch = raw.match(/strict mode violation:.*?(\d+) elements/i);
    if (strictMatch) {
        return `Multiple elements (${strictMatch[1]}) matched the locator. Take a new snapshot and use a more specific ref, or use refsMode="role" for nth-based disambiguation.`;
    }
    // Frame/page detached
    if (raw.includes("frame was detached") || raw.includes("target page, context or browser has been closed")) {
        return `The page or frame was closed during the operation. This may happen after navigation to a new domain. Use action="tabs" to find available tabs, then retry with the correct targetId.`;
    }
    // Tab not found
    if (raw.includes("Tab not found")) {
        return `${raw}`;
    }
    // No open tabs
    if (raw.includes("No open tabs")) {
        return `${raw}`;
    }
    // Navigation blocked (SSRF)
    if (raw.includes("Navigation blocked")) {
        return `${raw}`;
    }
    // Navigation errors
    if (raw.includes("net::ERR_NAME_NOT_RESOLVED")) {
        return `DNS resolution failed — the domain could not be found. Check the URL for typos.`;
    }
    if (raw.includes("net::ERR_CONNECTION_REFUSED")) {
        return `Connection refused — the server is not accepting connections. The site may be down or the port may be wrong.`;
    }
    if (raw.includes("net::ERR_CERT")) {
        return `SSL/TLS certificate error. The site's certificate is invalid or expired.`;
    }
    // Default: return original
    return raw;
}
