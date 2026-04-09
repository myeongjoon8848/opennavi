"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsoleLogs = getConsoleLogs;
exports.getPageErrors = getPageErrors;
exports.getNetworkRequests = getNetworkRequests;
exports.clearPageState = clearPageState;
exports.getContext = getContext;
exports.ensureBrowser = ensureBrowser;
exports.openTab = openTab;
exports.getPage = getPage;
exports.getTargetId = getTargetId;
exports.listTabs = listTabs;
exports.closeTab = closeTab;
exports.closeBrowser = closeBrowser;
exports.resolveTargetIdAfterNavigate = resolveTargetIdAfterNavigate;
const playwright_core_1 = require("playwright-core");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
// ---------------------------------------------------------------------------
// CDP configuration
// ---------------------------------------------------------------------------
const CDP_PORT = Number(process.env.BROWSER_CDP_PORT) || 9222;
const CDP_URL = process.env.BROWSER_CDP_URL || `http://127.0.0.1:${CDP_PORT}`;
function findChromeExecutable() {
    if (process.platform === "darwin") {
        const candidates = [
            { kind: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
            { kind: "chrome", path: (0, node_path_1.join)((0, node_os_1.homedir)(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
            { kind: "brave", path: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" },
            { kind: "edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
            { kind: "chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
        ];
        for (const c of candidates) {
            if ((0, node_fs_1.existsSync)(c.path))
                return c;
        }
    }
    if (process.platform === "linux") {
        const names = [
            "google-chrome", "google-chrome-stable", "brave-browser",
            "microsoft-edge", "chromium", "chromium-browser",
        ];
        for (const name of names) {
            try {
                const resolved = (0, node_child_process_1.execFileSync)("which", [name], { encoding: "utf8", timeout: 1000 }).trim();
                if (resolved) {
                    const kind = name.includes("brave") ? "brave"
                        : name.includes("edge") ? "edge"
                            : name.includes("chromium") ? "chromium"
                                : "chrome";
                    return { kind, path: resolved };
                }
            }
            catch { }
        }
    }
    if (process.platform === "win32") {
        const candidates = [
            { kind: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
            { kind: "chrome", path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" },
            { kind: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
            { kind: "brave", path: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
        ];
        for (const c of candidates) {
            if ((0, node_fs_1.existsSync)(c.path))
                return c;
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Chrome auto-launch with CDP port
// ---------------------------------------------------------------------------
let chromeProcess = null;
async function isCdpReachable() {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1000);
        const res = await fetch(`${CDP_URL}/json/version`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
    }
    catch {
        return false;
    }
}
async function launchChromeWithCdp() {
    // Already reachable? Skip launch.
    if (await isCdpReachable())
        return;
    const exe = findChromeExecutable();
    if (!exe) {
        throw new Error([
            "Chrome을 찾을 수 없습니다.",
            "",
            "Chrome, Brave, 또는 Edge를 설치해주세요.",
            "또는 직접 CDP 포트와 함께 실행해주세요:",
            process.platform === "darwin"
                ? '  open -a "Google Chrome" --args --remote-debugging-port=9222'
                : process.platform === "win32"
                    ? "  start chrome --remote-debugging-port=9222"
                    : "  google-chrome --remote-debugging-port=9222",
        ].join("\n"));
    }
    const args = [
        `--remote-debugging-port=${CDP_PORT}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--hide-crash-restore-bubble",
    ];
    chromeProcess = (0, node_child_process_1.spawn)(exe.path, args, {
        stdio: ["ignore", "ignore", "pipe"],
        detached: true,
        env: { ...process.env, HOME: (0, node_os_1.homedir)() },
    });
    // Detach so Chrome survives if our process exits
    chromeProcess.unref();
    // Wait for CDP to become reachable (up to 10s)
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (await isCdpReachable())
            return;
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error([
        `Chrome을 실행했지만 CDP 포트(${CDP_PORT})에 연결할 수 없습니다.`,
        `실행 경로: ${exe.path}`,
        "",
        "Chrome이 이미 CDP 포트 없이 실행 중이면, 먼저 Chrome을 종료한 후 다시 시도해주세요.",
    ].join("\n"));
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
const consoleLogs = new Map();
const pageErrors = new Map();
const networkRequests = new Map();
const requestIds = new WeakMap();
let requestCounter = 0;
function attachPageListeners(id, page) {
    const logs = [];
    const errors = [];
    const requests = [];
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
        if (logs.length > MAX_CONSOLE_ENTRIES)
            logs.shift();
    });
    page.on("pageerror", (error) => {
        errors.push({
            message: error.message,
            name: error.name,
            timestamp: Date.now(),
        });
        if (errors.length > MAX_PAGE_ERRORS)
            errors.shift();
    });
    page.on("request", (req) => {
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
        if (requests.length > MAX_NETWORK_REQUESTS)
            requests.shift();
    });
    page.on("response", (resp) => {
        const req = resp.request();
        const rid = requestIds.get(req);
        if (!rid)
            return;
        const entry = findRequestById(requests, rid);
        if (entry) {
            entry.status = resp.status();
            entry.ok = resp.ok();
        }
    });
    page.on("requestfailed", (req) => {
        const rid = requestIds.get(req);
        if (!rid)
            return;
        const entry = findRequestById(requests, rid);
        if (entry) {
            entry.failureText = req.failure()?.errorText;
            entry.ok = false;
        }
    });
}
function findRequestById(requests, id) {
    for (let i = requests.length - 1; i >= 0; i--) {
        if (requests[i].id === id)
            return requests[i];
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------
function getConsoleLogs(targetId, level) {
    const logs = consoleLogs.get(targetId) ?? [];
    if (!level)
        return logs;
    return logs.filter((entry) => entry.type === level);
}
function getPageErrors(targetId) {
    return pageErrors.get(targetId) ?? [];
}
function getNetworkRequests(targetId) {
    return networkRequests.get(targetId) ?? [];
}
function clearPageState(targetId) {
    consoleLogs.delete(targetId);
    pageErrors.delete(targetId);
    networkRequests.delete(targetId);
}
// ---------------------------------------------------------------------------
// Browser lifecycle — CDP only (attach to user's real Chrome)
// ---------------------------------------------------------------------------
let browser = null;
let context = null;
const pages = new Map();
let tabCounter = 0;
function nextTargetId() {
    return `tab-${++tabCounter}`;
}
function getContext() {
    return context;
}
/**
 * Connect to the user's Chrome via CDP.
 * If Chrome is not running, auto-launch it with --remote-debugging-port.
 * Retries connection up to 3 times with backoff.
 */
async function ensureBrowser() {
    if (context && browser?.isConnected())
        return context;
    await closeBrowser();
    // Auto-launch Chrome if not already running with CDP
    await launchChromeWithCdp();
    // Connect via CDP with retry
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const timeout = 5000 + attempt * 2000;
            browser = await playwright_core_1.chromium.connectOverCDP(CDP_URL, { timeout });
            break;
        }
        catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 250 + attempt * 250));
        }
    }
    if (!browser?.isConnected()) {
        throw new Error(`Chrome CDP에 연결할 수 없습니다 (${CDP_URL}).\n원인: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
    }
    // Use the first existing context (user's real session)
    context = browser.contexts()[0] ?? await browser.newContext();
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
function registerExistingPages() {
    if (!context)
        return;
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
async function openTab(url, timeoutMs) {
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
function getPage(targetId) {
    if (targetId) {
        const page = pages.get(targetId);
        if (!page)
            throw new Error(`Tab not found: ${targetId}. Use action="tabs" to list open tabs.`);
        return page;
    }
    const entries = [...pages.entries()];
    if (entries.length === 0)
        throw new Error("No open tabs. Use action='open' to open a tab.");
    return entries[entries.length - 1][1];
}
function getTargetId(page) {
    for (const [id, p] of pages) {
        if (p === page)
            return id;
    }
    return undefined;
}
function listTabs() {
    return [...pages.entries()].map(([id, page]) => ({
        targetId: id,
        url: page.url(),
        title: "",
    }));
}
async function closeTab(targetId) {
    if (targetId) {
        const page = pages.get(targetId);
        if (page) {
            await page.close();
            pages.delete(targetId);
        }
    }
    else {
        const entries = [...pages.entries()];
        if (entries.length > 0) {
            const [id, page] = entries[entries.length - 1];
            await page.close();
            pages.delete(id);
        }
    }
}
/**
 * Close: only close tabs we opened, then disconnect from Chrome.
 * Chrome itself keeps running.
 */
async function closeBrowser() {
    for (const [id, page] of pages) {
        try {
            await page.close();
        }
        catch { }
        pages.delete(id);
    }
    // Disconnect Playwright from Chrome (doesn't close Chrome itself)
    try {
        await browser?.close();
    }
    catch { }
    context = null;
    browser = null;
    tabCounter = 0;
}
// ---------------------------------------------------------------------------
// SPA Navigation Recovery
// ---------------------------------------------------------------------------
async function resolveTargetIdAfterNavigate(opts) {
    try {
        const pickReplacement = (tabs, options) => {
            if (tabs.some((tab) => tab.targetId === opts.oldTargetId)) {
                return opts.oldTargetId;
            }
            const byUrl = tabs.filter((tab) => tab.url === opts.navigatedUrl);
            if (byUrl.length === 1) {
                return byUrl[0].targetId;
            }
            if (options?.allowSingleTabFallback && tabs.length === 1) {
                return tabs[0].targetId;
            }
            return opts.oldTargetId;
        };
        let targetId = pickReplacement(listTabs());
        if (targetId === opts.oldTargetId && !pages.has(opts.oldTargetId)) {
            if (context) {
                try {
                    await new Promise((resolve) => {
                        const timeout = setTimeout(resolve, 2000);
                        context.once("page", () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    });
                }
                catch { }
            }
            targetId = pickReplacement(listTabs(), { allowSingleTabFallback: true });
        }
        return targetId;
    }
    catch {
        return opts.oldTargetId;
    }
}
