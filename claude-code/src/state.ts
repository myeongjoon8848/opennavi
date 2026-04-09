import { devices as playwrightDevices } from "playwright-core";
import type { BrowserContext, Page, Cookie } from "playwright-core";

// ---------------------------------------------------------------------------
// Cookie management
// ---------------------------------------------------------------------------

export async function getCookies(
  context: BrowserContext,
  urls?: string[],
): Promise<Cookie[]> {
  return await context.cookies(urls);
}

export async function setCookie(
  context: BrowserContext,
  cookie: {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  },
): Promise<void> {
  await context.addCookies([cookie as Parameters<BrowserContext["addCookies"]>[0][0]]);
}

export async function clearCookies(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

// ---------------------------------------------------------------------------
// Storage management (localStorage / sessionStorage)
// ---------------------------------------------------------------------------

export async function getStorage(
  page: Page,
  storageType: "local" | "session",
  key?: string,
): Promise<Record<string, string> | string | null> {
  const store = storageType === "local" ? "localStorage" : "sessionStorage";
  if (key) {
    return await page.evaluate(
      ({ store, key }) => (window as any)[store].getItem(key),
      { store, key },
    );
  }
  return await page.evaluate((store) => {
    const s = (window as any)[store];
    const result: Record<string, string> = {};
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) result[k] = s.getItem(k) ?? "";
    }
    return result;
  }, store);
}

export async function setStorage(
  page: Page,
  storageType: "local" | "session",
  key: string,
  value: string,
): Promise<void> {
  const store = storageType === "local" ? "localStorage" : "sessionStorage";
  await page.evaluate(
    ({ store, key, value }) => (window as any)[store].setItem(key, value),
    { store, key, value },
  );
}

export async function clearStorage(
  page: Page,
  storageType: "local" | "session",
): Promise<void> {
  const store = storageType === "local" ? "localStorage" : "sessionStorage";
  await page.evaluate((store) => (window as any)[store].clear(), store);
}

// ---------------------------------------------------------------------------
// Emulation — device, geolocation, timezone, locale, media, headers
// ---------------------------------------------------------------------------

export async function setDevice(
  context: BrowserContext,
  page: Page,
  deviceName: string,
): Promise<{ applied: string; viewport?: { width: number; height: number }; userAgent?: string }> {
  const descriptor = (playwrightDevices as Record<string, any>)[deviceName];
  if (!descriptor) {
    const available = Object.keys(playwrightDevices).slice(0, 20).join(", ");
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
    } finally {
      await session.detach().catch(() => {});
    }
  }

  return {
    applied: deviceName,
    viewport: descriptor.viewport,
    userAgent: descriptor.userAgent,
  };
}

export async function setGeolocation(
  context: BrowserContext,
  page: Page,
  opts: { latitude: number; longitude: number; accuracy?: number } | { clear: true },
): Promise<void> {
  if ("clear" in opts) {
    await context.setGeolocation(null);
    await context.clearPermissions().catch(() => {});
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
  } catch {}
}

export async function setTimezone(page: Page, timezoneId: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setTimezoneOverride" as any, { timezoneId });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("Timezone override is already in effect")) return;
    if (msg.includes("Invalid timezone")) {
      throw new Error(`Invalid timezone ID: ${timezoneId}`);
    }
    throw err;
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function setLocale(page: Page, locale: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setLocaleOverride" as any, { locale });
  } catch (err) {
    if (String(err).includes("Another locale override is already in effect")) return;
    throw err;
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function emulateMedia(
  page: Page,
  colorScheme: "dark" | "light" | "no-preference" | null,
): Promise<void> {
  await page.emulateMedia({ colorScheme });
}

export async function setExtraHeaders(
  context: BrowserContext,
  headers: Record<string, string>,
): Promise<void> {
  await context.setExtraHTTPHeaders(headers);
}

export async function setOffline(context: BrowserContext, offline: boolean): Promise<void> {
  await context.setOffline(offline);
}

export async function setUserAgent(page: Page, userAgent: string, acceptLanguage?: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setUserAgentOverride", {
      userAgent,
      ...(acceptLanguage ? { acceptLanguage } : {}),
    });
  } finally {
    await session.detach().catch(() => {});
  }
}
