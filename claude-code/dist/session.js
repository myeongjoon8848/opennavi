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
const node_fs_1 = require("node:fs");
const stealth_js_1 = require("./stealth.js");
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
// Browser lifecycle
// ---------------------------------------------------------------------------
let browser = null;
let context = null;
let userDataDir = null;
const pages = new Map();
let tabCounter = 0;
function nextTargetId() {
    return `tab-${++tabCounter}`;
}
function getContext() {
    return context;
}
async function ensureBrowser() {
    if (context && browser?.isConnected())
        return context;
    await closeBrowser();
    // Persistent profile directory
    userDataDir = (0, stealth_js_1.resolveUserDataDir)("default");
    (0, node_fs_1.mkdirSync)(userDataDir, { recursive: true });
    const stealthArgs = (0, stealth_js_1.buildStealthLaunchArgs)();
    const userAgent = (0, stealth_js_1.pickUserAgent)();
    browser = await playwright_core_1.chromium.launch({
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
    await (0, stealth_js_1.applyStealthScripts)(context);
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
async function closeBrowser() {
    for (const [id, page] of pages) {
        try {
            await page.close();
        }
        catch { }
        pages.delete(id);
    }
    try {
        await context?.close();
    }
    catch { }
    try {
        await browser?.close();
    }
    catch { }
    context = null;
    browser = null;
    // NOTE: we do NOT delete userDataDir for persistent profiles
    userDataDir = null;
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
