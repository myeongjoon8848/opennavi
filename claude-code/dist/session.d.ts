import { type BrowserContext, type Page } from "playwright-core";
export interface TabInfo {
    targetId: string;
    url: string;
    title: string;
}
export interface ConsoleEntry {
    type: string;
    text: string;
    timestamp: number;
    location?: string;
}
export interface PageErrorEntry {
    message: string;
    name?: string;
    timestamp: number;
}
export interface NetworkRequestEntry {
    id: string;
    method: string;
    url: string;
    resourceType?: string;
    status?: number;
    ok?: boolean;
    failureText?: string;
    timestamp: number;
}
/**
 * Quarantine a tab after an SSRF violation.
 * The tab is closed and future access is blocked.
 */
export declare function markTargetBlocked(targetId: string): Promise<void>;
export declare function isTargetBlocked(targetId: string): boolean;
export declare function getConsoleLogs(targetId: string, level?: string): ConsoleEntry[];
export declare function getPageErrors(targetId: string): PageErrorEntry[];
export declare function getNetworkRequests(targetId: string): NetworkRequestEntry[];
export declare function clearPageState(targetId: string): void;
export declare function getContext(): BrowserContext | null;
/**
 * Connect to the user's Chrome via CDP.
 * If Chrome is not running, auto-launch it with --remote-debugging-port.
 * Retries connection up to 3 times with backoff.
 *
 * Concurrent calls are deduplicated — only one connection attempt runs at a time.
 */
export declare function ensureBrowser(): Promise<BrowserContext>;
export declare function openTab(url?: string, timeoutMs?: number): Promise<{
    targetId: string;
    page: Page;
}>;
/**
 * Resolve a tab by targetId.
 * - Exact match first, then prefix match (e.g. "tab-1" matches "tab-12" only if unique).
 * - If targetId is omitted, returns the last used tab or the most recent tab.
 * - Updates lastTargetId on every successful resolution.
 */
export declare function getPage(targetId?: string): Page;
export declare function getTargetId(page: Page): string | undefined;
export declare function listTabs(): TabInfo[];
export declare function closeTab(targetId?: string): Promise<void>;
/**
 * Close: only close tabs we opened, then disconnect from Chrome.
 * Chrome itself keeps running.
 */
export declare function closeBrowser(): Promise<void>;
/**
 * Force-disconnect and reconnect to Chrome CDP.
 * Used when frame-detached or target-closed errors indicate a stale connection.
 * Returns the refreshed BrowserContext.
 */
export declare function forceReconnect(): Promise<BrowserContext>;
export declare function resolveTargetIdAfterNavigate(opts: {
    oldTargetId: string;
    navigatedUrl: string;
}): Promise<string>;
