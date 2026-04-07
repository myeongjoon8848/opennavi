"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeSnapshot = takeSnapshot;
const refs_js_1 = require("./refs.js");
const DEFAULT_MAX_CHARS = 50_000;
function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return { text, truncated: false };
    return {
        text: `${text.slice(0, maxChars)}\n\n[...TRUNCATED - page too large]`,
        truncated: true,
    };
}
async function takeSnapshot(page, opts) {
    const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
    const refsMode = opts?.refsMode ?? "aria";
    const snapshotOpts = {
        interactive: opts?.interactive,
        compact: opts?.compact,
        maxDepth: opts?.maxDepth,
    };
    let rawSnapshot;
    let refs;
    if (opts?.selector) {
        const locator = page.locator(opts.selector);
        const ariaSnapshot = await locator.ariaSnapshot();
        const raw = String(ariaSnapshot ?? "");
        const built = (0, refs_js_1.buildRefsFromAriaSnapshot)(raw, snapshotOpts);
        rawSnapshot = built.snapshot;
        refs = built.refs;
    }
    else if (refsMode === "aria") {
        // Use Playwright's AI snapshot which includes [ref=eN] markers
        const snapshot = await page._snapshotForAI?.({ track: "response" })
            ?? await page.ariaSnapshot?.({ mode: "ai" })
            ?? "";
        const raw = String(snapshot);
        const built = (0, refs_js_1.buildRefsFromAiSnapshot)(raw, snapshotOpts);
        rawSnapshot = built.snapshot;
        refs = built.refs;
    }
    else {
        // Role mode: use ariaSnapshot and assign our own refs
        const ariaSnapshot = await page.ariaSnapshot();
        const raw = String(ariaSnapshot ?? "");
        const built = (0, refs_js_1.buildRefsFromAriaSnapshot)(raw, snapshotOpts);
        rawSnapshot = built.snapshot;
        refs = built.refs;
    }
    const { text, truncated } = truncate(rawSnapshot, maxChars);
    // Store refs for later resolution
    (0, refs_js_1.storeRefs)({
        page,
        targetId: opts?.targetId,
        refs,
        mode: refsMode,
    });
    return { snapshot: text, truncated, refs };
}
