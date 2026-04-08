import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

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

const MAX_CONSOLE_ENTRIES = 500;
const MAX_PAGE_ERRORS = 200;
const consoleLogs = new Map<string, ConsoleEntry[]>();
const pageErrors = new Map<string, PageErrorEntry[]>();

function attachConsoleListeners(id: string, page: Page): void {
  const logs: ConsoleEntry[] = [];
  const errors: PageErrorEntry[] = [];
  consoleLogs.set(id, logs);
  pageErrors.set(id, errors);

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
}

export function getConsoleLogs(targetId: string, level?: string): ConsoleEntry[] {
  const logs = consoleLogs.get(targetId) ?? [];
  if (!level) return logs;
  return logs.filter((entry) => entry.type === level);
}

export function getPageErrors(targetId: string): PageErrorEntry[] {
  return pageErrors.get(targetId) ?? [];
}

export function clearConsoleLogs(targetId: string): void {
  consoleLogs.delete(targetId);
  pageErrors.delete(targetId);
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let userDataDir: string | null = null;
const pages = new Map<string, Page>();
let tabCounter = 0;

function nextTargetId(): string {
  return `tab-${++tabCounter}`;
}

export async function ensureBrowser(): Promise<BrowserContext> {
  if (context && browser?.isConnected()) return context;

  await closeBrowser();

  userDataDir = await mkdtemp(join(tmpdir(), "browser-mcp-"));
  browser = await chromium.launch({ headless: false });
  context = await browser.newContext();

  const existingPages = context.pages();
  for (const page of existingPages) {
    const id = nextTargetId();
    pages.set(id, page);
    attachConsoleListeners(id, page);
    page.once("close", () => {
      pages.delete(id);
      clearConsoleLogs(id);
    });
  }

  return context;
}

export async function openTab(
  url?: string,
  timeoutMs?: number,
): Promise<{ targetId: string; page: Page }> {
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  const id = nextTargetId();
  pages.set(id, page);
  attachConsoleListeners(id, page);
  page.once("close", () => {
    pages.delete(id);
    clearConsoleLogs(id);
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

  if (userDataDir) {
    try { await rm(userDataDir, { recursive: true, force: true }); } catch {}
    userDataDir = null;
  }
  tabCounter = 0;
}

// --- SPA Navigation Recovery ---

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
      // Wait for a new page event instead of arbitrary sleep
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
