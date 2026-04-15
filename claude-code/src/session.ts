import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from "playwright-core";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, readlinkSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { BrowserTabNotFoundError, BrowserConnectionError } from "./errors.js";

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
// CDP configuration
// ---------------------------------------------------------------------------

const CDP_PORT = Number(process.env.BROWSER_CDP_PORT) || 9222;
const CDP_URL = process.env.BROWSER_CDP_URL || `http://127.0.0.1:${CDP_PORT}`;

// ---------------------------------------------------------------------------
// Chrome executable detection (macOS / Linux / Windows)
// ---------------------------------------------------------------------------

interface ChromeExecutable {
  path: string;
  kind: "chrome" | "brave" | "edge" | "chromium";
}

function findChromeExecutable(): ChromeExecutable | null {
  if (process.platform === "darwin") {
    const candidates: ChromeExecutable[] = [
      { kind: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { kind: "chrome", path: join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
      { kind: "brave", path: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" },
      { kind: "edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
      { kind: "chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
    ];
    for (const c of candidates) {
      if (existsSync(c.path)) return c;
    }
  }

  if (process.platform === "linux") {
    const names = [
      "google-chrome", "google-chrome-stable", "brave-browser",
      "microsoft-edge", "chromium", "chromium-browser",
    ];
    for (const name of names) {
      try {
        const resolved = execFileSync("which", [name], { encoding: "utf8", timeout: 1000 }).trim();
        if (resolved) {
          const kind = name.includes("brave") ? "brave" as const
            : name.includes("edge") ? "edge" as const
            : name.includes("chromium") ? "chromium" as const
            : "chrome" as const;
          return { kind, path: resolved };
        }
      } catch {}
    }
  }

  if (process.platform === "win32") {
    const candidates: ChromeExecutable[] = [
      { kind: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
      { kind: "chrome", path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" },
      { kind: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
      { kind: "brave", path: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
    ];
    for (const c of candidates) {
      if (existsSync(c.path)) return c;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Chrome auto-launch with CDP port
// ---------------------------------------------------------------------------

let chromeProcess: ChildProcess | null = null;

async function isCdpReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${CDP_URL}/json/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Check if the CDP port is free by attempting to listen on it. */
function ensurePortAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`PORT_IN_USE:${port}`));
      } else {
        reject(err);
      }
    });
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve());
    });
  });
}

/** Stop Chrome: graceful quit → SIGKILL escalation, confirmed by port release. */
async function stopChrome(): Promise<void> {
  // Phase 1: graceful quit
  if (process.platform === "darwin") {
    try {
      execFileSync("osascript", ["-e", 'tell application "Google Chrome" to quit'], {
        timeout: 5000,
      });
    } catch {}
  } else {
    try {
      execFileSync("pkill", ["-f", "chrome|chromium|brave|msedge"], { timeout: 3000 });
    } catch {}
  }

  // Wait for port release (up to 5s)
  const gracefulDeadline = Date.now() + 5000;
  while (Date.now() < gracefulDeadline) {
    try {
      await ensurePortAvailable(CDP_PORT);
      return; // port is free
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }

  // Phase 2: force kill
  try {
    execFileSync("pkill", ["-9", "-f", "chrome|chromium|brave|msedge"], { timeout: 3000 });
  } catch {}

  // Wait for kernel to release port (up to 2s)
  const killDeadline = Date.now() + 2000;
  while (Date.now() < killDeadline) {
    try {
      await ensurePortAvailable(CDP_PORT);
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Write clean-exit flags to prevent Chrome's crash-restore dialog. */
function ensureProfileCleanExit(userDataDir: string): void {
  const prefsPath = join(userDataDir, "Default", "Preferences");
  try {
    const raw = readFileSync(prefsPath, "utf-8");
    const prefs = JSON.parse(raw);
    prefs.exit_type = "Normal";
    prefs.exited_cleanly = true;
    writeFileSync(prefsPath, JSON.stringify(prefs), "utf-8");
  } catch {
    // Preferences file may not exist on first run — ignore
  }
}

/**
 * Chrome 147+ requires `--user-data-dir` to be a "non-default" path for CDP.
 * We create a separate directory with symlinks to the real profile so the user's
 * existing cookies, logins, and sessions are preserved.
 */
function getCdpUserDataDir(kind: ChromeExecutable["kind"]): string {
  const dataDir = process.env.BROWSER_MCP_DATA
    ? join(process.env.BROWSER_MCP_DATA, "chrome-cdp-data")
    : join(homedir(), ".opennavi", "chrome-cdp-data");

  // Determine default Chrome data directory per platform
  let defaultDataDir: string | null = null;
  if (process.platform === "darwin") {
    const map: Record<string, string> = {
      chrome: join(homedir(), "Library/Application Support/Google/Chrome"),
      brave: join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser"),
      edge: join(homedir(), "Library/Application Support/Microsoft Edge"),
      chromium: join(homedir(), "Library/Application Support/Chromium"),
    };
    defaultDataDir = map[kind] ?? null;
  } else if (process.platform === "linux") {
    const map: Record<string, string> = {
      chrome: join(homedir(), ".config/google-chrome"),
      brave: join(homedir(), ".config/BraveSoftware/Brave-Browser"),
      edge: join(homedir(), ".config/microsoft-edge"),
      chromium: join(homedir(), ".config/chromium"),
    };
    defaultDataDir = map[kind] ?? null;
  }

  if (!defaultDataDir || !existsSync(defaultDataDir)) return dataDir;

  mkdirSync(dataDir, { recursive: true });

  // Symlink the Default profile and Local State if not already linked
  const links = ["Default", "Local State"];
  for (const name of links) {
    const src = join(defaultDataDir, name);
    const dest = join(dataDir, name);
    if (!existsSync(src)) continue;
    // Skip if symlink already points to the correct target
    try {
      if (readlinkSync(dest) === src) continue;
    } catch {}
    // Remove stale entry and create fresh symlink
    try {
      const { rmSync } = require("node:fs");
      rmSync(dest, { force: true, recursive: true });
    } catch {}
    try {
      symlinkSync(src, dest);
    } catch {}
  }

  return dataDir;
}

async function launchChromeWithCdp(): Promise<void> {
  // Already reachable? Skip launch.
  if (await isCdpReachable()) return;

  const exe = findChromeExecutable();
  if (!exe) {
    throw new Error(
      [
        "Chrome을 찾을 수 없습니다.",
        "",
        "Chrome, Brave, 또는 Edge를 설치해주세요.",
      ].join("\n"),
    );
  }

  // Check if the CDP port is available. If something is occupying it (e.g. Chrome
  // running without CDP, or another process), attempt to stop Chrome and reclaim it.
  try {
    await ensurePortAvailable(CDP_PORT);
  } catch {
    // Port in use — try to stop Chrome and reclaim
    await stopChrome();
    try {
      await ensurePortAvailable(CDP_PORT);
    } catch {
      throw new Error(
        [
          `CDP 포트(${CDP_PORT})가 다른 프로세스에 의해 사용 중입니다.`,
          "Chrome을 수동으로 종료하거나, 포트를 점유한 프로세스를 확인해주세요.",
          `  lsof -nP -iTCP:${CDP_PORT} -sTCP:LISTEN`,
        ].join("\n"),
      );
    }
  }

  const userDataDir = getCdpUserDataDir(exe.kind);

  ensureProfileCleanExit(userDataDir);

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
  ];

  chromeProcess = spawn(exe.path, args, {
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
    env: { ...process.env, HOME: homedir() },
  });

  // Detach so Chrome survives if our process exits
  chromeProcess.unref();

  // Wait for CDP to become reachable (up to 15s — Chrome can be slow on first start)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isCdpReachable()) return;
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    [
      `Chrome을 실행했지만 CDP 포트(${CDP_PORT})에 연결할 수 없습니다.`,
      `실행 경로: ${exe.path}`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Blocked target tracking (ported from OpenClaw)
// ---------------------------------------------------------------------------

/** Targets quarantined after an SSRF policy violation */
const blockedTargets = new Set<string>();

/**
 * Quarantine a tab after an SSRF violation.
 * The tab is closed and future access is blocked.
 */
export async function markTargetBlocked(targetId: string): Promise<void> {
  blockedTargets.add(targetId);
  const page = pages.get(targetId);
  if (page) {
    try { await page.close(); } catch {}
    pages.delete(targetId);
    clearPageState(targetId);
    if (lastTargetId === targetId) lastTargetId = null;
  }
}

export function isTargetBlocked(targetId: string): boolean {
  return blockedTargets.has(targetId);
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
// Browser lifecycle — CDP only (attach to user's real Chrome)
// ---------------------------------------------------------------------------

let browser: Browser | null = null;
let context: BrowserContext | null = null;
const pages = new Map<string, Page>();
let tabCounter = 0;

/** Last used tab — auto-selected when targetId is omitted */
let lastTargetId: string | null = null;

/** Pending connection promise — deduplicates concurrent ensureBrowser() calls */
let connectingPromise: Promise<BrowserContext> | null = null;

function nextTargetId(): string {
  return `tab-${++tabCounter}`;
}

export function getContext(): BrowserContext | null {
  return context;
}

/**
 * Connect to the user's Chrome via CDP.
 * If Chrome is not running, auto-launch it with --remote-debugging-port.
 * Retries connection up to 3 times with backoff.
 *
 * Concurrent calls are deduplicated — only one connection attempt runs at a time.
 */
export async function ensureBrowser(): Promise<BrowserContext> {
  if (context && browser?.isConnected()) return context;

  // Deduplicate concurrent connection attempts
  if (connectingPromise) return connectingPromise;

  connectingPromise = connectBrowserInternal().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

async function connectBrowserInternal(): Promise<BrowserContext> {
  await closeBrowser();

  // Auto-launch Chrome if not already running with CDP
  await launchChromeWithCdp();

  // Connect via CDP with retry
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const timeout = 5000 + attempt * 2000;
      browser = await chromium.connectOverCDP(CDP_URL, { timeout });
      break;
    } catch (err) {
      lastErr = err;
      // Don't retry rate-limit errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("rate limit")) break;
      await new Promise((r) => setTimeout(r, 250 + attempt * 250));
    }
  }

  if (!browser?.isConnected()) {
    const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    // Chrome 147+ rejects Browser.setDownloadBehavior on default-profile CDP attaches.
    // Normally neutralized by scripts/patch-playwright.mjs, but the postinstall hook
    // does not run in installs that use --ignore-scripts (e.g. some marketplace flows).
    if (errMsg.includes("setDownloadBehavior") || errMsg.includes("context management is not supported")) {
      throw new BrowserConnectionError(
        [
          "Chrome이 default 프로파일로 CDP 디버그 포트를 점유 중이라 attach가 거부되었습니다.",
          "(Chrome 147+ 제약 — playwright-core 패치가 적용되지 않은 환경에서 발생)",
          "",
          "해결 방법:",
          "1. 현재 실행 중인 Chrome을 완전히 종료하세요 (Cmd+Q / 모든 창 닫기)",
          "2. 동일한 브라우저 액션을 다시 호출하면 플러그인이 격리된 user-data-dir로",
          "   Chrome을 자동 실행합니다. 기존 프로파일은 symlink로 공유되어 로그인이 유지됩니다.",
        ].join("\n"),
      );
    }
    throw new BrowserConnectionError(
      `Chrome CDP에 연결할 수 없습니다 (${CDP_URL}).\n원인: ${errMsg}`,
    );
  }

  // Auto-cleanup on unexpected disconnect
  browser.on("disconnected", () => {
    context = null;
    browser = null;
  });

  // Use the first existing context (user's real session).
  // Never call browser.newContext() — it triggers Browser.setDownloadBehavior
  // which Chrome 147+ no longer supports for CDP-attached browsers.
  // The same command is also sent during connectOverCDP handshake; that path
  // is neutralized by scripts/patch-playwright.mjs (postinstall).
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new BrowserConnectionError(
      "Chrome에 연결했지만 활성 브라우저 컨텍스트가 없습니다.\nChrome 창을 하나 열고 다시 시도해주세요.",
    );
  }
  context = contexts[0]!;

  registerExistingPages();

  // Listen for new pages (popups, window.open)
  context.on("page", (page) => {
    const id = nextTargetId();
    pages.set(id, page);
    attachPageListeners(id, page);
    page.once("close", () => {
      pages.delete(id);
      clearPageState(id);
    });
  });

  return context;
}

function registerExistingPages(): void {
  if (!context) return;
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

/**
 * Resolve a tab by targetId.
 * - Exact match first, then prefix match (e.g. "tab-1" matches "tab-12" only if unique).
 * - If targetId is omitted, returns the last used tab or the most recent tab.
 * - Updates lastTargetId on every successful resolution.
 */
export function getPage(targetId?: string): Page {
  if (targetId) {
    // Check if target is blocked (SSRF quarantine)
    if (isTargetBlocked(targetId)) {
      throw new BrowserTabNotFoundError(
        `Tab "${targetId}" is unavailable — it was closed after an SSRF policy violation. Use action="tabs" to find available tabs.`,
      );
    }

    // Exact match
    const exact = pages.get(targetId);
    if (exact) {
      lastTargetId = targetId;
      return exact;
    }

    // Prefix match — only if unambiguous
    const lower = targetId.toLowerCase();
    const matches = [...pages.keys()].filter((id) => id.toLowerCase().startsWith(lower));
    if (matches.length === 1) {
      lastTargetId = matches[0]!;
      return pages.get(matches[0]!)!;
    }
    if (matches.length > 1) {
      throw new BrowserTabNotFoundError(
        `Ambiguous targetId "${targetId}" matches ${matches.length} tabs: ${matches.join(", ")}. Use a more specific targetId.`,
      );
    }

    throw new BrowserTabNotFoundError(`Tab not found: ${targetId}. Use action="tabs" to list open tabs.`);
  }

  // No targetId — require explicit targetId when multiple tabs are open
  const entries = [...pages.entries()];
  if (entries.length === 0) throw new BrowserTabNotFoundError("No open tabs. Use action='open' to open a tab.");
  if (entries.length > 1) {
    const tabList = entries.map(([id]) => id).join(", ");
    throw new BrowserTabNotFoundError(
      `Multiple tabs open (${tabList}) — targetId is required. Use action="tabs" to list tabs, then pass targetId to target a specific tab.`,
    );
  }
  const [id, page] = entries[0]!;
  lastTargetId = id;
  return page;
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
      if (lastTargetId === targetId) lastTargetId = null;
    }
  } else {
    const entries = [...pages.entries()];
    if (entries.length > 0) {
      const [id, page] = entries[entries.length - 1]!;
      await page.close();
      pages.delete(id);
      if (lastTargetId === id) lastTargetId = null;
    }
  }
}

/**
 * Close: only close tabs we opened, then disconnect from Chrome.
 * Chrome itself keeps running.
 */
export async function closeBrowser(): Promise<void> {
  for (const [id, page] of pages) {
    try { await page.close(); } catch {}
    clearPageState(id);
    pages.delete(id);
  }
  // Disconnect Playwright from Chrome (doesn't close Chrome itself)
  try { await browser?.close(); } catch {}
  context = null;
  browser = null;
  tabCounter = 0;
  lastTargetId = null;
  blockedTargets.clear();
}

// ---------------------------------------------------------------------------
// Force reconnect (ported from OpenClaw forceDisconnectPlaywrightForTarget)
// ---------------------------------------------------------------------------

/**
 * Force-disconnect and reconnect to Chrome CDP.
 * Used when frame-detached or target-closed errors indicate a stale connection.
 * Returns the refreshed BrowserContext.
 */
export async function forceReconnect(): Promise<BrowserContext> {
  // Clear cached state without closing Chrome itself
  try { await browser?.close(); } catch {}
  context = null;
  browser = null;
  connectingPromise = null;

  // Re-establish connection
  return ensureBrowser();
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
