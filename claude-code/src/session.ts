import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

export interface TabInfo {
  targetId: string;
  url: string;
  title: string;
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

  // Track the default page if one exists
  const existingPages = context.pages();
  for (const page of existingPages) {
    const id = nextTargetId();
    pages.set(id, page);
    page.once("close", () => pages.delete(id));
  }

  return context;
}

export async function openTab(url?: string): Promise<{ targetId: string; page: Page }> {
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  const id = nextTargetId();
  pages.set(id, page);
  page.once("close", () => pages.delete(id));

  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  return { targetId: id, page };
}

export function getPage(targetId?: string): Page {
  if (targetId) {
    const page = pages.get(targetId);
    if (!page) throw new Error(`Tab not found: ${targetId}. Use action="tabs" to list open tabs.`);
    return page;
  }
  // Return the most recently added page
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
    // Close the current (last) page
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
