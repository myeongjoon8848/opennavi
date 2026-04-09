import type { Page, Download, Dialog } from "playwright-core";
import { refLocator } from "./refs.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Timeout helpers (ported from OpenClaw pw-tools-core.shared.ts)
// ---------------------------------------------------------------------------

/** Clamp timeout: min 500ms, max 120s */
function normalizeTimeout(ms: number | undefined, fallback: number): number {
  return Math.max(500, Math.min(120_000, ms ?? fallback));
}

const MAX_CLICK_DELAY_MS = 5_000;
const MAX_WAIT_TIME_MS = 30_000;
const MAX_BATCH_ACTIONS = 100;
const MAX_BATCH_DEPTH = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActKind =
  | "click"
  | "type"
  | "press"
  | "hover"
  | "drag"
  | "fill"
  | "select"
  | "wait"
  | "evaluate"
  | "batch"
  | "scrollIntoView"
  | "armDialog"
  | "waitForDownload"
  | "download"
  | "responseBody";

export interface ActRequest {
  kind: ActKind;
  ref?: string;
  text?: string;
  key?: string;
  submit?: boolean;
  slowly?: boolean;
  doubleClick?: boolean;
  button?: "left" | "right" | "middle";
  modifiers?: string[];
  startRef?: string;
  endRef?: string;
  values?: string[];
  fields?: Array<{ ref: string; value: string }>;
  selector?: string;
  timeMs?: number;
  textGone?: string;
  url?: string;
  fn?: string;
  timeoutMs?: number;
  loadState?: "load" | "domcontentloaded" | "networkidle";
  actions?: ActRequest[];
  stopOnError?: boolean;
  delayMs?: number;
  // Dialog
  accept?: boolean;
  promptText?: string;
  // Download
  path?: string;
  // Response body
  urlPattern?: string;
  maxChars?: number;
}

function requireRef(request: ActRequest): string {
  if (!request.ref) throw new Error(`ref is required for action kind="${request.kind}"`);
  return request.ref;
}

// ---------------------------------------------------------------------------
// Core action executor
// ---------------------------------------------------------------------------

export async function executeAct(page: Page, request: ActRequest, depth = 0): Promise<unknown> {
  switch (request.kind) {
    case "click": {
      const ref = requireRef(request);
      const locator = refLocator(page, ref);
      const timeout = normalizeTimeout(request.timeoutMs, 8_000);
      const opts: Parameters<typeof locator.click>[0] = { timeout };
      if (request.button) opts.button = request.button;
      if (request.modifiers?.length) {
        opts.modifiers = request.modifiers as Array<"Alt" | "Control" | "Meta" | "Shift">;
      }
      // Click delay: clamp to MAX_CLICK_DELAY_MS
      if (request.delayMs) {
        const delay = Math.max(0, Math.min(MAX_CLICK_DELAY_MS, request.delayMs));
        if (delay > 0) {
          await locator.hover({ timeout });
          await page.waitForTimeout(delay);
        }
      }
      if (request.doubleClick) {
        await locator.dblclick(opts);
      } else {
        await locator.click(opts);
      }
      return { ok: true };
    }

    case "type": {
      const ref = requireRef(request);
      const text = request.text ?? "";
      const locator = refLocator(page, ref);
      const timeout = normalizeTimeout(request.timeoutMs, 8_000);
      if (request.slowly) {
        await locator.pressSequentially(text, { delay: 75, timeout });
      } else {
        await locator.fill(text, { timeout });
      }
      if (request.submit) {
        await locator.press("Enter");
      }
      return { ok: true };
    }

    case "press": {
      const key = request.key;
      if (!key) throw new Error("key is required for action kind='press'");
      if (request.ref) {
        await refLocator(page, request.ref).press(key);
      } else {
        await page.keyboard.press(key);
      }
      return { ok: true };
    }

    case "hover": {
      const ref = requireRef(request);
      const timeout = normalizeTimeout(request.timeoutMs, 8_000);
      await refLocator(page, ref).hover({ timeout });
      return { ok: true };
    }

    case "scrollIntoView": {
      const ref = requireRef(request);
      const timeout = normalizeTimeout(request.timeoutMs, 8_000);
      await refLocator(page, ref).scrollIntoViewIfNeeded({ timeout });
      return { ok: true };
    }

    case "drag": {
      const startRef = request.startRef;
      const endRef = request.endRef;
      if (!startRef || !endRef) throw new Error("startRef and endRef are required for drag");
      const source = refLocator(page, startRef);
      const target = refLocator(page, endRef);
      await source.dragTo(target);
      return { ok: true };
    }

    case "fill": {
      const fields = request.fields;
      if (!fields?.length) throw new Error("fields array is required for fill");
      const timeout = normalizeTimeout(request.timeoutMs, 8_000);
      for (const field of fields) {
        await refLocator(page, field.ref).fill(field.value, { timeout });
      }
      return { ok: true, filled: fields.length };
    }

    case "select": {
      const ref = requireRef(request);
      const values = request.values ?? [];
      await refLocator(page, ref).selectOption(values);
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
      if (!fnText) throw new Error("fn is required for evaluate");

      const outerTimeout = normalizeTimeout(request.timeoutMs, 20_000);
      // Leave 500ms headroom for routing/serialization
      const evaluateTimeout = Math.max(1000, Math.min(120_000, outerTimeout - 500));

      if (request.ref) {
        const locator = refLocator(page, request.ref);
        const result = await locator.evaluate(
          (el: Element, args: { fnBody: string; timeoutMs: number }) => {
            "use strict";
            try {
              const candidate = eval("(" + args.fnBody + ")");
              const result = typeof candidate === "function" ? candidate(el) : candidate;
              if (result && typeof (result as any).then === "function") {
                return Promise.race([
                  result,
                  new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`evaluate timed out after ${args.timeoutMs}ms`)), args.timeoutMs);
                  }),
                ]);
              }
              return result;
            } catch (err: any) {
              throw new Error("Invalid evaluate function: " + (err?.message ?? String(err)));
            }
          },
          { fnBody: fnText, timeoutMs: evaluateTimeout },
        );
        return { ok: true, result };
      }

      const result = await page.evaluate(
        (args: { fnBody: string; timeoutMs: number }) => {
          "use strict";
          try {
            const candidate = eval("(" + args.fnBody + ")");
            const result = typeof candidate === "function" ? candidate() : candidate;
            if (result && typeof (result as any).then === "function") {
              return Promise.race([
                result,
                new Promise((_, reject) => {
                  setTimeout(() => reject(new Error(`evaluate timed out after ${args.timeoutMs}ms`)), args.timeoutMs);
                }),
              ]);
            }
            return result;
          } catch (err: any) {
            throw new Error("Invalid evaluate function: " + (err?.message ?? String(err)));
          }
        },
        { fnBody: fnText, timeoutMs: evaluateTimeout },
      );
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
        .then(async (dialog: Dialog) => {
          if (accept) {
            await dialog.accept(promptText);
          } else {
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

      const download: Download = await page.waitForEvent("download", { timeout });
      const suggested = download.suggestedFilename() || "download.bin";

      const resolvedPath = outPath || join(tmpdir(), "opennavi-downloads", `${randomUUID()}-${suggested}`);
      await mkdir(join(resolvedPath, ".."), { recursive: true });
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
        page.waitForEvent("download", { timeout }) as Promise<Download>,
        refLocator(page, ref).click({ timeout }),
      ]);

      const suggested = download.suggestedFilename() || "download.bin";
      const resolvedPath = outPath || join(tmpdir(), "opennavi-downloads", `${randomUUID()}-${suggested}`);
      await mkdir(join(resolvedPath, ".."), { recursive: true });
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
      if (!pattern) throw new Error("urlPattern or url is required for responseBody");
      const timeout = normalizeTimeout(request.timeoutMs, 20_000);
      const maxChars = Math.max(1, Math.min(5_000_000, request.maxChars ?? 200_000));

      const resp = await new Promise<any>((resolve, reject) => {
        let done = false;
        let timer: NodeJS.Timeout | undefined;
        const handler = (response: any) => {
          if (done) return;
          const respUrl: string = response.url?.() || "";
          if (!respUrl.toLowerCase().includes(pattern.toLowerCase())) return;
          done = true;
          if (timer) clearTimeout(timer);
          page.off("response", handler);
          resolve(response);
        };
        page.on("response", handler);
        timer = setTimeout(() => {
          if (done) return;
          done = true;
          page.off("response", handler);
          reject(new Error(`Response not found for pattern "${pattern}" within ${timeout}ms. Use action="requests" to inspect recent network activity.`));
        }, timeout);
      });

      const url: string = resp.url?.() || "";
      const status: number | undefined = resp.status?.();
      const headers: Record<string, string> | undefined = resp.headers?.();
      let bodyText = "";
      try {
        if (typeof resp.text === "function") {
          bodyText = await resp.text();
        } else if (typeof resp.body === "function") {
          const buf = await resp.body();
          bodyText = new TextDecoder("utf-8").decode(buf);
        }
      } catch (err) {
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
      if (!actions?.length) throw new Error("actions array is required for batch");
      if (actions.length > MAX_BATCH_ACTIONS) throw new Error(`batch supports at most ${MAX_BATCH_ACTIONS} actions`);
      if (depth >= MAX_BATCH_DEPTH) throw new Error(`batch nesting depth exceeded (max ${MAX_BATCH_DEPTH})`);

      const stopOnError = request.stopOnError ?? true;
      const results: Array<{ index: number; ok: boolean; result?: unknown; error?: string }> = [];

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]!;
        if (action.kind === "batch") {
          // Allow nested batch up to MAX_BATCH_DEPTH
          if (depth + 1 >= MAX_BATCH_DEPTH) {
            results.push({ index: i, ok: false, error: `nested batch depth exceeded (max ${MAX_BATCH_DEPTH})` });
            if (stopOnError) break;
            continue;
          }
        }
        try {
          const result = await executeAct(page, action, depth + 1);
          results.push({ index: i, ok: true, result });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ index: i, ok: false, error });
          if (stopOnError) break;
        }
      }

      const allOk = results.every((r) => r.ok);
      return { ok: allOk, results };
    }

    default:
      throw new Error(`Unknown act kind: ${(request as ActRequest).kind}`);
  }
}
