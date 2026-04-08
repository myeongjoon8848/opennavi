"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsoleLogs = getConsoleLogs;
exports.getPageErrors = getPageErrors;
exports.clearConsoleLogs = clearConsoleLogs;
exports.ensureBrowser = ensureBrowser;
exports.openTab = openTab;
exports.getPage = getPage;
exports.getTargetId = getTargetId;
exports.listTabs = listTabs;
exports.closeTab = closeTab;
exports.closeBrowser = closeBrowser;
exports.resolveTargetIdAfterNavigate = resolveTargetIdAfterNavigate;
const playwright_core_1 = require("playwright-core");
const node_os_1 = require("node:os");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const MAX_CONSOLE_ENTRIES = 500;
const MAX_PAGE_ERRORS = 200;
const consoleLogs = new Map();
const pageErrors = new Map();
function attachConsoleListeners(id, page) {
    const logs = [];
    const errors = [];
    consoleLogs.set(id, logs);
    pageErrors.set(id, errors);
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
}
function getConsoleLogs(targetId, level) {
    const logs = consoleLogs.get(targetId) ?? [];
    if (!level)
        return logs;
    return logs.filter((entry) => entry.type === level);
}
function getPageErrors(targetId) {
    return pageErrors.get(targetId) ?? [];
}
function clearConsoleLogs(targetId) {
    consoleLogs.delete(targetId);
    pageErrors.delete(targetId);
}
let browser = null;
let context = null;
let userDataDir = null;
const pages = new Map();
let tabCounter = 0;
function nextTargetId() {
    return `tab-${++tabCounter}`;
}
async function ensureBrowser() {
    if (context && browser?.isConnected())
        return context;
    await closeBrowser();
    userDataDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "browser-mcp-"));
    browser = await playwright_core_1.chromium.launch({ headless: false });
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
async function openTab(url, timeoutMs) {
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
    if (userDataDir) {
        try {
            await (0, promises_1.rm)(userDataDir, { recursive: true, force: true });
        }
        catch { }
        userDataDir = null;
    }
    tabCounter = 0;
}
// --- SPA Navigation Recovery ---
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
            // Wait for a new page event instead of arbitrary sleep
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
