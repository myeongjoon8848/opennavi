import type { BrowserContext, Page, Cookie } from "playwright-core";
export declare function getCookies(context: BrowserContext, urls?: string[]): Promise<Cookie[]>;
export declare function setCookie(context: BrowserContext, cookie: {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
}): Promise<void>;
export declare function clearCookies(context: BrowserContext): Promise<void>;
export declare function getStorage(page: Page, storageType: "local" | "session", key?: string): Promise<Record<string, string> | string | null>;
export declare function setStorage(page: Page, storageType: "local" | "session", key: string, value: string): Promise<void>;
export declare function clearStorage(page: Page, storageType: "local" | "session"): Promise<void>;
export declare function setDevice(context: BrowserContext, page: Page, deviceName: string): Promise<{
    applied: string;
    viewport?: {
        width: number;
        height: number;
    };
    userAgent?: string;
}>;
export declare function setGeolocation(context: BrowserContext, page: Page, opts: {
    latitude: number;
    longitude: number;
    accuracy?: number;
} | {
    clear: true;
}): Promise<void>;
export declare function setTimezone(page: Page, timezoneId: string): Promise<void>;
export declare function setLocale(page: Page, locale: string): Promise<void>;
export declare function emulateMedia(page: Page, colorScheme: "dark" | "light" | "no-preference" | null): Promise<void>;
export declare function setExtraHeaders(context: BrowserContext, headers: Record<string, string>): Promise<void>;
export declare function setOffline(context: BrowserContext, offline: boolean): Promise<void>;
export declare function setUserAgent(page: Page, userAgent: string, acceptLanguage?: string): Promise<void>;
