const DEFAULT_MAX_CHARS = 50_000;
function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return { text, truncated: false };
    return {
        text: `${text.slice(0, maxChars)}\n\n[...TRUNCATED - page too large]`,
        truncated: true,
    };
}
export async function takeSnapshot(page, opts) {
    const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
    // If a selector is given, scope to that element
    if (opts?.selector) {
        const locator = page.locator(opts.selector);
        const ariaSnapshot = await locator.ariaSnapshot();
        const { text, truncated } = truncate(String(ariaSnapshot ?? ""), maxChars);
        return { snapshot: text, truncated };
    }
    // Use page.ariaSnapshot({ mode: 'ai' }) which includes [ref=eN] markers
    // These refs can be resolved via page.locator('aria-ref=eN')
    const snapshot = await page.ariaSnapshot({ mode: "ai" });
    const { text, truncated } = truncate(String(snapshot ?? ""), maxChars);
    return { snapshot: text, truncated };
}
