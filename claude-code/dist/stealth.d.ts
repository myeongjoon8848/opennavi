import type { BrowserContext } from "playwright-core";
export declare function resolveUserDataDir(profileName?: string): string;
export declare function buildStealthLaunchArgs(): string[];
export declare function pickUserAgent(): string;
/**
 * Apply all stealth patches to a BrowserContext.
 * Must be called BEFORE any page.goto().
 */
export declare function applyStealthScripts(context: BrowserContext): Promise<void>;
