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
export declare function getConsoleLogs(targetId: string, level?: string): ConsoleEntry[];
export declare function getPageErrors(targetId: string): PageErrorEntry[];
export declare function getNetworkRequests(targetId: string): NetworkRequestEntry[];
export declare function clearPageState(targetId: string): void;
export declare function getContext(): BrowserContext | null;
/**
 * Connect to the user's Chrome via CDP.
 * Chrome must be running with --remote-debugging-port=9222.
 * Retries up to 3 times with backoff.
 */
export declare function ensureBrowser(): Promise<BrowserContext>;
export declare function openTab(url?: string, timeoutMs?: number): Promise<{
    targetId: string;
    page: Page;
}>;
export declare function getPage(targetId?: string): Page;
export declare function getTargetId(page: Page): string | undefined;
export declare function listTabs(): TabInfo[];
export declare function closeTab(targetId?: string): Promise<void>;
/**
 * Close: only close tabs we opened, then disconnect from Chrome.
 * Chrome itself keeps running.
 */
export declare function closeBrowser(): Promise<void>;
export declare function resolveTargetIdAfterNavigate(opts: {
    oldTargetId: string;
    navigatedUrl: string;
}): Promise<string>;
