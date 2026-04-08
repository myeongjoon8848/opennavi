"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAIFriendlyError = toAIFriendlyError;
/**
 * Transforms raw Playwright errors into actionable, AI-friendly messages
 * that guide the agent toward the correct recovery action.
 */
function toAIFriendlyError(err) {
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
    // Default: return original with suggestion
    return raw;
}
