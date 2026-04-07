import { type BrowserContext, type Page } from "playwright-core";
export interface TabInfo {
    targetId: string;
    url: string;
    title: string;
}
export declare function ensureBrowser(): Promise<BrowserContext>;
export declare function openTab(url?: string): Promise<{
    targetId: string;
    page: Page;
}>;
export declare function getPage(targetId?: string): Page;
export declare function getTargetId(page: Page): string | undefined;
export declare function listTabs(): TabInfo[];
export declare function closeTab(targetId?: string): Promise<void>;
export declare function closeBrowser(): Promise<void>;
