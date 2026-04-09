"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAct = executeAct;
const refs_js_1 = require("./refs.js");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const node_crypto_1 = require("node:crypto");
const errors_js_1 = require("./errors.js");
const navigation_guard_js_1 = require("./navigation-guard.js");
// ---------------------------------------------------------------------------
// Timeout helpers (ported from OpenClaw pw-tools-core.shared.ts)
// ---------------------------------------------------------------------------
/** Clamp timeout: min 500ms, max 120s */
function normalizeTimeout(ms, fallback) {
    return Math.max(500, Math.min(120_000, ms ?? fallback));
}
const MAX_CLICK_DELAY_MS = 5_000;
const MAX_WAIT_TIME_MS = 30_000;
const MAX_BATCH_ACTIONS = 100;
const MAX_BATCH_DEPTH = 5;
function requireRef(request) {
    if (!request.ref)
        throw new errors_js_1.BrowserValidationError(`ref is required for action kind="${request.kind}"`);
    return request.ref;
}
// ---------------------------------------------------------------------------
// Core action executor
// ---------------------------------------------------------------------------
async function executeAct(page, request, depth = 0, ssrfPolicy) {
    switch (request.kind) {
        case "click": {
            const ref = requireRef(request);
            const locator = (0, refs_js_1.refLocator)(page, ref);
            const timeout = normalizeTimeout(request.timeoutMs, 8_000);
            const clickOpts = { timeout };
            if (request.button)
                clickOpts.button = request.button;
            if (request.modifiers?.length) {
                clickOpts.modifiers = request.modifiers;
            }
            const doClick = async () => {
                // Click delay: clamp to MAX_CLICK_DELAY_MS
                if (request.delayMs) {
                    const delay = Math.max(0, Math.min(MAX_CLICK_DELAY_MS, request.delayMs));
                    if (delay > 0) {
                        await locator.hover({ timeout });
                        await page.waitForTimeout(delay);
                    }
                }
                if (request.doubleClick) {
                    await locator.dblclick(clickOpts);
                }
                else {
                    await locator.click(clickOpts);
                }
            };
            // Clicks can trigger navigation — validate against SSRF policy
            await (0, navigation_guard_js_1.assertInteractionNavigationSafe)({ action: doClick, page, policy: ssrfPolicy });
            return { ok: true };
        }
        case "type": {
            const ref = requireRef(request);
            const text = request.text ?? "";
            const locator = (0, refs_js_1.refLocator)(page, ref);
            const timeout = normalizeTimeout(request.timeoutMs, 8_000);
            const doType = async () => {
                if (request.slowly) {
                    await locator.pressSequentially(text, { delay: 75, timeout });
                }
                else {
                    await locator.fill(text, { timeout });
                }
                if (request.submit) {
                    await locator.press("Enter");
                }
            };
            // Form submit can trigger navigation — validate against SSRF policy
            if (request.submit) {
                await (0, navigation_guard_js_1.assertInteractionNavigationSafe)({ action: doType, page, policy: ssrfPolicy });
            }
            else {
                await doType();
            }
            return { ok: true };
        }
        case "press": {
            const key = request.key;
            if (!key)
                throw new errors_js_1.BrowserValidationError("key is required for action kind='press'");
            if (request.ref) {
                await (0, refs_js_1.refLocator)(page, request.ref).press(key);
            }
            else {
                await page.keyboard.press(key);
            }
            return { ok: true };
        }
        case "hover": {
            const ref = requireRef(request);
            const timeout = normalizeTimeout(request.timeoutMs, 8_000);
            await (0, refs_js_1.refLocator)(page, ref).hover({ timeout });
            return { ok: true };
        }
        case "scrollIntoView": {
            const ref = requireRef(request);
            const timeout = normalizeTimeout(request.timeoutMs, 8_000);
            await (0, refs_js_1.refLocator)(page, ref).scrollIntoViewIfNeeded({ timeout });
            return { ok: true };
        }
        case "drag": {
            const startRef = request.startRef;
            const endRef = request.endRef;
            if (!startRef || !endRef)
                throw new errors_js_1.BrowserValidationError("startRef and endRef are required for drag");
            const source = (0, refs_js_1.refLocator)(page, startRef);
            const target = (0, refs_js_1.refLocator)(page, endRef);
            await source.dragTo(target);
            return { ok: true };
        }
        case "fill": {
            const fields = request.fields;
            if (!fields?.length)
                throw new errors_js_1.BrowserValidationError("fields array is required for fill");
            const timeout = normalizeTimeout(request.timeoutMs, 8_000);
            for (const field of fields) {
                await (0, refs_js_1.refLocator)(page, field.ref).fill(field.value, { timeout });
            }
            return { ok: true, filled: fields.length };
        }
        case "select": {
            const ref = requireRef(request);
            const values = request.values ?? [];
            await (0, refs_js_1.refLocator)(page, ref).selectOption(values);
            return { ok: true };
        }
        case "wait": {
            if (request.loadState) {
                const timeout = normalizeTimeout(request.timeoutMs, 30_000);
                await page.waitForLoadState(request.loadState, { timeout });
                return { ok: true, waited: `loadState:${request.loadState}` };
            }
            if (request.text) {
                const timeout = normalizeTimeout(request.timeoutMs, 10_000);
                await page.getByText(request.text).waitFor({ timeout });
                return { ok: true, waited: "text appeared" };
            }
            if (request.textGone) {
                const timeout = normalizeTimeout(request.timeoutMs, 10_000);
                await page.getByText(request.textGone).waitFor({
                    state: "hidden",
                    timeout,
                });
                return { ok: true, waited: "text gone" };
            }
            if (request.url) {
                const timeout = normalizeTimeout(request.timeoutMs, 30_000);
                await page.waitForURL(request.url, { timeout });
                return { ok: true, waited: "url" };
            }
            if (request.selector) {
                const timeout = normalizeTimeout(request.timeoutMs, 10_000);
                await page.locator(request.selector).waitFor({ timeout });
                return { ok: true, waited: "selector" };
            }
            // Simple time wait — clamp to MAX_WAIT_TIME_MS
            const ms = Math.min(request.timeMs ?? 1000, MAX_WAIT_TIME_MS);
            await page.waitForTimeout(ms);
            return { ok: true, waited: `${ms}ms` };
        }
        // -----------------------------------------------------------------
        // Safe evaluate with Promise.race timeout
        // Prevents blocking Playwright's CDP command queue on long-running JS
        // -----------------------------------------------------------------
        case "evaluate": {
            const fnText = request.fn;
            if (!fnText)
                throw new errors_js_1.BrowserValidationError("fn is required for evaluate");
            const outerTimeout = normalizeTimeout(request.timeoutMs, 20_000);
            // Leave 500ms headroom for routing/serialization
            const evaluateTimeout = Math.max(1000, Math.min(120_000, outerTimeout - 500));
            if (request.ref) {
                const locator = (0, refs_js_1.refLocator)(page, request.ref);
                const result = await locator.evaluate((el, args) => {
                    "use strict";
                    try {
                        const candidate = eval("(" + args.fnBody + ")");
                        const result = typeof candidate === "function" ? candidate(el) : candidate;
                        if (result && typeof result.then === "function") {
                            return Promise.race([
                                result,
                                new Promise((_, reject) => {
                                    setTimeout(() => reject(new Error(`evaluate timed out after ${args.timeoutMs}ms`)), args.timeoutMs);
                                }),
                            ]);
                        }
                        return result;
                    }
                    catch (err) {
                        throw new Error("Invalid evaluate function: " + (err?.message ?? String(err)));
                    }
                }, { fnBody: fnText, timeoutMs: evaluateTimeout });
                return { ok: true, result };
            }
            const result = await page.evaluate((args) => {
                "use strict";
                try {
                    const candidate = eval("(" + args.fnBody + ")");
                    const result = typeof candidate === "function" ? candidate() : candidate;
                    if (result && typeof result.then === "function") {
                        return Promise.race([
                            result,
                            new Promise((_, reject) => {
                                setTimeout(() => reject(new Error(`evaluate timed out after ${args.timeoutMs}ms`)), args.timeoutMs);
                            }),
                        ]);
                    }
                    return result;
                }
                catch (err) {
                    throw new Error("Invalid evaluate function: " + (err?.message ?? String(err)));
                }
            }, { fnBody: fnText, timeoutMs: evaluateTimeout });
            return { ok: true, result };
        }
        // -----------------------------------------------------------------
        // Dialog handling — arm a listener for alert/confirm/prompt
        // -----------------------------------------------------------------
        case "armDialog": {
            const accept = request.accept ?? true;
            const promptText = request.promptText;
            const timeout = normalizeTimeout(request.timeoutMs, 120_000);
            void page
                .waitForEvent("dialog", { timeout })
                .then(async (dialog) => {
                if (accept) {
                    await dialog.accept(promptText);
                }
                else {
                    await dialog.dismiss();
                }
            })
                .catch(() => {
                // Ignore timeouts — dialog may never appear
            });
            return { ok: true, armed: "dialog", accept };
        }
        // -----------------------------------------------------------------
        // Download — wait for next download event
        // -----------------------------------------------------------------
        case "waitForDownload": {
            const timeout = normalizeTimeout(request.timeoutMs, 120_000);
            const outPath = request.path?.trim();
            const download = await page.waitForEvent("download", { timeout });
            const suggested = download.suggestedFilename() || "download.bin";
            const resolvedPath = outPath || (0, node_path_1.join)((0, node_os_1.tmpdir)(), "opennavi-downloads", `${(0, node_crypto_1.randomUUID)()}-${suggested}`);
            await (0, promises_1.mkdir)((0, node_path_1.join)(resolvedPath, ".."), { recursive: true });
            await download.saveAs(resolvedPath);
            return {
                ok: true,
                url: download.url(),
                suggestedFilename: suggested,
                path: resolvedPath,
            };
        }
        // -----------------------------------------------------------------
        // Download — click element then capture download
        // -----------------------------------------------------------------
        case "download": {
            const ref = requireRef(request);
            const timeout = normalizeTimeout(request.timeoutMs, 120_000);
            const outPath = request.path?.trim();
            const [download] = await Promise.all([
                page.waitForEvent("download", { timeout }),
                (0, refs_js_1.refLocator)(page, ref).click({ timeout }),
            ]);
            const suggested = download.suggestedFilename() || "download.bin";
            const resolvedPath = outPath || (0, node_path_1.join)((0, node_os_1.tmpdir)(), "opennavi-downloads", `${(0, node_crypto_1.randomUUID)()}-${suggested}`);
            await (0, promises_1.mkdir)((0, node_path_1.join)(resolvedPath, ".."), { recursive: true });
            await download.saveAs(resolvedPath);
            return {
                ok: true,
                url: download.url(),
                suggestedFilename: suggested,
                path: resolvedPath,
            };
        }
        // -----------------------------------------------------------------
        // Response body capture — listen for a response matching URL pattern
        // -----------------------------------------------------------------
        case "responseBody": {
            const pattern = request.urlPattern ?? request.url;
            if (!pattern)
                throw new errors_js_1.BrowserValidationError("urlPattern or url is required for responseBody");
            const timeout = normalizeTimeout(request.timeoutMs, 20_000);
            const maxChars = Math.max(1, Math.min(5_000_000, request.maxChars ?? 200_000));
            const resp = await new Promise((resolve, reject) => {
                let done = false;
                let timer;
                const handler = (response) => {
                    if (done)
                        return;
                    const respUrl = response.url?.() || "";
                    if (!respUrl.toLowerCase().includes(pattern.toLowerCase()))
                        return;
                    done = true;
                    if (timer)
                        clearTimeout(timer);
                    page.off("response", handler);
                    resolve(response);
                };
                page.on("response", handler);
                timer = setTimeout(() => {
                    if (done)
                        return;
                    done = true;
                    page.off("response", handler);
                    reject(new Error(`Response not found for pattern "${pattern}" within ${timeout}ms. Use action="requests" to inspect recent network activity.`));
                }, timeout);
            });
            const url = resp.url?.() || "";
            const status = resp.status?.();
            const headers = resp.headers?.();
            let bodyText = "";
            try {
                if (typeof resp.text === "function") {
                    bodyText = await resp.text();
                }
                else if (typeof resp.body === "function") {
                    const buf = await resp.body();
                    bodyText = new TextDecoder("utf-8").decode(buf);
                }
            }
            catch (err) {
                throw new Error(`Failed to read response body for "${url}": ${String(err)}`);
            }
            const truncated = bodyText.length > maxChars;
            return {
                ok: true,
                url,
                status,
                headers,
                body: truncated ? bodyText.slice(0, maxChars) : bodyText,
                truncated,
            };
        }
        // -----------------------------------------------------------------
        // Batch — atomic multi-action
        // -----------------------------------------------------------------
        case "batch": {
            const actions = request.actions;
            if (!actions?.length)
                throw new errors_js_1.BrowserValidationError("actions array is required for batch");
            if (actions.length > MAX_BATCH_ACTIONS)
                throw new errors_js_1.BrowserValidationError(`batch supports at most ${MAX_BATCH_ACTIONS} actions`);
            if (depth >= MAX_BATCH_DEPTH)
                throw new errors_js_1.BrowserValidationError(`batch nesting depth exceeded (max ${MAX_BATCH_DEPTH})`);
            const stopOnError = request.stopOnError ?? true;
            const results = [];
            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                if (action.kind === "batch") {
                    // Allow nested batch up to MAX_BATCH_DEPTH
                    if (depth + 1 >= MAX_BATCH_DEPTH) {
                        results.push({ index: i, ok: false, error: `nested batch depth exceeded (max ${MAX_BATCH_DEPTH})` });
                        if (stopOnError)
                            break;
                        continue;
                    }
                }
                try {
                    const result = await executeAct(page, action, depth + 1, ssrfPolicy);
                    results.push({ index: i, ok: true, result });
                }
                catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    results.push({ index: i, ok: false, error });
                    if (stopOnError)
                        break;
                }
            }
            const allOk = results.every((r) => r.ok);
            return { ok: allOk, results };
        }
        default:
            throw new Error(`Unknown act kind: ${request.kind}`);
    }
}
