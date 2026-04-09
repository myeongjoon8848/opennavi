"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookies = getCookies;
exports.setCookie = setCookie;
exports.clearCookies = clearCookies;
exports.getStorage = getStorage;
exports.setStorage = setStorage;
exports.clearStorage = clearStorage;
exports.setDevice = setDevice;
exports.setGeolocation = setGeolocation;
exports.setTimezone = setTimezone;
exports.setLocale = setLocale;
exports.emulateMedia = emulateMedia;
exports.setExtraHeaders = setExtraHeaders;
exports.setOffline = setOffline;
exports.setUserAgent = setUserAgent;
const playwright_core_1 = require("playwright-core");
// ---------------------------------------------------------------------------
// Cookie management
// ---------------------------------------------------------------------------
async function getCookies(context, urls) {
    return await context.cookies(urls);
}
async function setCookie(context, cookie) {
    await context.addCookies([cookie]);
}
async function clearCookies(context) {
    await context.clearCookies();
}
// ---------------------------------------------------------------------------
// Storage management (localStorage / sessionStorage)
// ---------------------------------------------------------------------------
async function getStorage(page, storageType, key) {
    const store = storageType === "local" ? "localStorage" : "sessionStorage";
    if (key) {
        return await page.evaluate(({ store, key }) => window[store].getItem(key), { store, key });
    }
    return await page.evaluate((store) => {
        const s = window[store];
        const result = {};
        for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k !== null)
                result[k] = s.getItem(k) ?? "";
        }
        return result;
    }, store);
}
async function setStorage(page, storageType, key, value) {
    const store = storageType === "local" ? "localStorage" : "sessionStorage";
    await page.evaluate(({ store, key, value }) => window[store].setItem(key, value), { store, key, value });
}
async function clearStorage(page, storageType) {
    const store = storageType === "local" ? "localStorage" : "sessionStorage";
    await page.evaluate((store) => window[store].clear(), store);
}
// ---------------------------------------------------------------------------
// Emulation — device, geolocation, timezone, locale, media, headers
// ---------------------------------------------------------------------------
async function setDevice(context, page, deviceName) {
    const descriptor = playwright_core_1.devices[deviceName];
    if (!descriptor) {
        const available = Object.keys(playwright_core_1.devices).slice(0, 20).join(", ");
        throw new Error(`Unknown device "${deviceName}". Some available: ${available}...`);
    }
    if (descriptor.viewport) {
        await page.setViewportSize({
            width: descriptor.viewport.width,
            height: descriptor.viewport.height,
        });
    }
    // User-agent override via CDP
    if (descriptor.userAgent) {
        const session = await page.context().newCDPSession(page);
        try {
            await session.send("Emulation.setUserAgentOverride", {
                userAgent: descriptor.userAgent,
                acceptLanguage: descriptor.locale ?? undefined,
            });
            if (descriptor.viewport) {
                await session.send("Emulation.setDeviceMetricsOverride", {
                    mobile: Boolean(descriptor.isMobile),
                    width: descriptor.viewport.width,
                    height: descriptor.viewport.height,
                    deviceScaleFactor: descriptor.deviceScaleFactor ?? 1,
                    screenWidth: descriptor.viewport.width,
                    screenHeight: descriptor.viewport.height,
                });
            }
            if (descriptor.hasTouch) {
                await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
            }
        }
        finally {
            await session.detach().catch(() => { });
        }
    }
    return {
        applied: deviceName,
        viewport: descriptor.viewport,
        userAgent: descriptor.userAgent,
    };
}
async function setGeolocation(context, page, opts) {
    if ("clear" in opts) {
        await context.setGeolocation(null);
        await context.clearPermissions().catch(() => { });
        return;
    }
    await context.setGeolocation({
        latitude: opts.latitude,
        longitude: opts.longitude,
        accuracy: opts.accuracy,
    });
    try {
        const origin = new URL(page.url()).origin;
        if (origin && origin !== "null") {
            await context.grantPermissions(["geolocation"], { origin });
        }
    }
    catch { }
}
async function setTimezone(page, timezoneId) {
    const session = await page.context().newCDPSession(page);
    try {
        await session.send("Emulation.setTimezoneOverride", { timezoneId });
    }
    catch (err) {
        const msg = String(err);
        if (msg.includes("Timezone override is already in effect"))
            return;
        if (msg.includes("Invalid timezone")) {
            throw new Error(`Invalid timezone ID: ${timezoneId}`);
        }
        throw err;
    }
    finally {
        await session.detach().catch(() => { });
    }
}
async function setLocale(page, locale) {
    const session = await page.context().newCDPSession(page);
    try {
        await session.send("Emulation.setLocaleOverride", { locale });
    }
    catch (err) {
        if (String(err).includes("Another locale override is already in effect"))
            return;
        throw err;
    }
    finally {
        await session.detach().catch(() => { });
    }
}
async function emulateMedia(page, colorScheme) {
    await page.emulateMedia({ colorScheme });
}
async function setExtraHeaders(context, headers) {
    await context.setExtraHTTPHeaders(headers);
}
async function setOffline(context, offline) {
    await context.setOffline(offline);
}
async function setUserAgent(page, userAgent, acceptLanguage) {
    const session = await page.context().newCDPSession(page);
    try {
        await session.send("Emulation.setUserAgentOverride", {
            userAgent,
            ...(acceptLanguage ? { acceptLanguage } : {}),
        });
    }
    finally {
        await session.detach().catch(() => { });
    }
}
