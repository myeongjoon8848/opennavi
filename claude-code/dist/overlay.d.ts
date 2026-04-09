import type { Page } from "playwright-core";
/**
 * Inject a gradient border overlay and butterfly favicon to indicate agent-controlled browsing.
 * Idempotent — safe to call multiple times on the same page.
 */
export declare function injectAgentOverlay(page: Page): Promise<void>;
