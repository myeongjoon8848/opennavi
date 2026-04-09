import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveUserDataDir, buildStealthLaunchArgs, applyStealthScripts, pickUserAgent } from "./stealth.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONSOLE_ENTRIES = 500;
const MAX_PAGE_ERRORS = 200;
const MAX_NETWORK_REQUESTS = 500;

// ---------------------------------------------------------------------------
// Per-tab state
// ---------------------------------------------------------------------------

const consoleLogs = new Map<string, ConsoleEntry[]>();
const pageErrors = new Map<string, PageErrorEntry[]>();
const networkRequests = new Map<string, NetworkRequestEntry[]>();
const requestIds = new WeakMap<Request, string>();
let requestCounter = 0;

function attachPageListeners(id: string, page: Page): void {
  const logs: ConsoleEntry[] = [];
  const errors: PageErrorEntry[] = [];
  const requests: NetworkRequestEntry[] = [];
  consoleLogs.set(id, logs);
  pageErrors.set(id, errors);
  networkRequests.set(id, requests);

  page.on("console", (msg) => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
      location: msg.location()?.url,
    });
    if (logs.length > MAX_CONSOLE_ENTRIES) logs.shift();
  });

  page.on("pageerror", (error) => {
    errors.push({
      message: error.message,
      name: error.name,
      timestamp: Date.now(),
    });
    if (errors.length > MAX_PAGE_ERRORS) errors.shift();
  });

  page.on("request", (req: Request) => {
    requestCounter++;
    const rid = `r${requestCounter}`;
    requestIds.set(req, rid);
    requests.push({
      id: rid,
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      timestamp: Date.now(),
    });
    if (requests.length > MAX_NETWORK_REQUESTS) requests.shift();
  });

  page.on("response", (resp: Response) => {
    const req = resp.request();
    const rid = requestIds.get(req);
    if (!rid) return;
    const entry = findRequestById(requests, rid);
    if (entry) {
      entry.status = resp.status();
      entry.ok = resp.ok();
    }
  });

  page.on("requestfailed", (req: Request) => {
    const rid = requestIds.get(req);
    if (!rid) return;
    const entry = findRequestById(requests, rid);
    if (entry) {
      entry.failureText = req.failure()?.errorText;
      entry.ok = false;
    }
  });
}

function findRequestById(requests: NetworkRequestEntry[], id: string): NetworkRequestEntry | undefined {
  for (let i = requests.length - 1; i >= 0; i--) {
    if (requests[i]!.id === id) return requests[i];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getConsoleLogs(targetId: string, level?: string): ConsoleEntry[] {
  const logs = consoleLogs.get(targetId) ?? [];
  if (!level) return logs;
  return logs.filter((entry) => entry.type === level);
}

export function getPageErrors(targetId: string): PageErrorEntry[] {
  return pageErrors.get(targetId) ?? [];
}

export function getNetworkRequests(targetId: string): NetworkRequestEntry[] {
  return networkRequests.get(targetId) ?? [];
}

export function clearPageState(targetId: string): void {
  consoleLogs.delete(targetId);
  pageErrors.delete(targetId);
  networkRequests.delete(targetId);
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let userDataDir: string | null = null;
const pages = new Map<string, Page>();
let tabCounter = 0;

function nextTargetId(): string {
  return `tab-${++tabCounter}`;
}

export function getContext(): BrowserContext | null {
  return context;
}

export async function ensureBrowser(): Promise<BrowserContext> {
  if (context && browser?.isConnected()) return context;

  await closeBrowser();

  // Persistent profile directory
  userDataDir = resolveUserDataDir("default");
  mkdirSync(userDataDir, { recursive: true });

  const stealthArgs = buildStealthLaunchArgs();
  const userAgent = pickUserAgent();

  browser = await chromium.launch({
    headless: false,
    args: stealthArgs,
  });

  context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
    // Bypass Content-Security-Policy to allow our init scripts
    bypassCSP: true,
  });

  // Apply stealth scripts before any navigation
  await applyStealthScripts(context);

  const existingPages = context.pages();
  for (const page of existingPages) {
    const id = nextTargetId();
    pages.set(id, page);
    attachPageListeners(id, page);
    page.once("close", () => {
      pages.delete(id);
      clearPageState(id);
    });
  }

  return context;
}

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

export async function openTab(
  url?: string,
  timeoutMs?: number,
): Promise<{ targetId: string; page: Page }> {
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  const id = nextTargetId();
  pages.set(id, page);
  attachPageListeners(id, page);
  page.once("close", () => {
    pages.delete(id);
    clearPageState(id);
  });

  if (url) {
    const timeout = Math.max(1000, Math.min(120_000, timeoutMs ?? 30_000));
    await page.goto(url, { timeout }).catch(() => {
      // Navigation may time out on slow sites, but the page is still usable
    });
  }
  return { targetId: id, page };
}

export function getPage(targetId?: string): Page {
  if (targetId) {
    const page = pages.get(targetId);
    if (!page) throw new Error(`Tab not found: ${targetId}. Use action="tabs" to list open tabs.`);
    return page;
  }
  const entries = [...pages.entries()];
  if (entries.length === 0) throw new Error("No open tabs. Use action='open' to open a tab.");
  return entries[entries.length - 1]![1];
}

export function getTargetId(page: Page): string | undefined {
  for (const [id, p] of pages) {
    if (p === page) return id;
  }
  return undefined;
}

export function listTabs(): TabInfo[] {
  return [...pages.entries()].map(([id, page]) => ({
    targetId: id,
    url: page.url(),
    title: "",
  }));
}

export async function closeTab(targetId?: string): Promise<void> {
  if (targetId) {
    const page = pages.get(targetId);
    if (page) {
      await page.close();
      pages.delete(targetId);
    }
  } else {
    const entries = [...pages.entries()];
    if (entries.length > 0) {
      const [id, page] = entries[entries.length - 1]!;
      await page.close();
      pages.delete(id);
    }
  }
}

export async function closeBrowser(): Promise<void> {
  for (const [id, page] of pages) {
    try { await page.close(); } catch {}
    pages.delete(id);
  }
  try { await context?.close(); } catch {}
  try { await browser?.close(); } catch {}
  context = null;
  browser = null;
  // NOTE: we do NOT delete userDataDir for persistent profiles
  userDataDir = null;
  tabCounter = 0;
}

// ---------------------------------------------------------------------------
// SPA Navigation Recovery
// ---------------------------------------------------------------------------

export async function resolveTargetIdAfterNavigate(opts: {
  oldTargetId: string;
  navigatedUrl: string;
}): Promise<string> {
  try {
    const pickReplacement = (
      tabs: TabInfo[],
      options?: { allowSingleTabFallback?: boolean },
    ) => {
      if (tabs.some((tab) => tab.targetId === opts.oldTargetId)) {
        return opts.oldTargetId;
      }
      const byUrl = tabs.filter((tab) => tab.url === opts.navigatedUrl);
      if (byUrl.length === 1) {
        return byUrl[0]!.targetId;
      }
      if (options?.allowSingleTabFallback && tabs.length === 1) {
        return tabs[0]!.targetId;
      }
      return opts.oldTargetId;
    };

    let targetId = pickReplacement(listTabs());
    if (targetId === opts.oldTargetId && !pages.has(opts.oldTargetId)) {
      if (context) {
        try {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 2000);
            context!.once("page", () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        } catch {}
      }
      targetId = pickReplacement(listTabs(), { allowSingleTabFallback: true });
    }
    return targetId;
  } catch {
    return opts.oldTargetId;
  }
}
