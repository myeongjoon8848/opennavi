"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        page.once("close", () => pages.delete(id));
    }
    return context;
}
async function openTab(url) {
    const ctx = await ensureBrowser();
    const page = await ctx.newPage();
    const id = nextTargetId();
    pages.set(id, page);
    page.once("close", () => pages.delete(id));
    if (url) {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
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
            await new Promise((r) => setTimeout(r, 800));
            targetId = pickReplacement(listTabs(), { allowSingleTabFallback: true });
        }
        return targetId;
    }
    catch {
        return opts.oldTargetId;
    }
}
