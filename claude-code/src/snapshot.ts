import type { Page } from "playwright-core";
import {
  buildRefsFromAiSnapshot,
  buildRefsFromAriaSnapshot,
  storeRefs,
  type RoleRefMap,
  type SnapshotOptions,
} from "./refs.js";

// ---------------------------------------------------------------------------
// Snapshot constants (ported from OpenClaw constants.ts)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CHARS = 50_000;
const EFFICIENT_MAX_CHARS = 10_000;
const EFFICIENT_MAX_DEPTH = 6;

export type SnapshotMode = "normal" | "efficient";

export interface SnapshotResult {
  snapshot: string;
  truncated: boolean;
  refs: RoleRefMap;
}

function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n[...TRUNCATED - page too large]`,
    truncated: true,
  };
}

export async function takeSnapshot(
  page: Page,
  opts?: SnapshotOptions & { targetId?: string; refsMode?: "role" | "aria"; mode?: SnapshotMode },
): Promise<SnapshotResult> {
  // Efficient mode: smaller snapshot for LLM context savings
  const isEfficient = opts?.mode === "efficient";
  const maxChars = opts?.maxChars ?? (isEfficient ? EFFICIENT_MAX_CHARS : DEFAULT_MAX_CHARS);
  const refsMode = opts?.refsMode ?? "aria";
  const snapshotOpts: SnapshotOptions = {
    interactive: isEfficient ? true : opts?.interactive,
    compact: isEfficient ? true : opts?.compact,
    maxDepth: opts?.maxDepth ?? (isEfficient ? EFFICIENT_MAX_DEPTH : undefined),
  };

  let rawSnapshot: string;
  let refs: RoleRefMap;

  try {
    if (opts?.selector) {
      const locator = page.locator(opts.selector);
      const ariaSnapshot = await locator.ariaSnapshot();
      const raw = String(ariaSnapshot ?? "");
      const built = buildRefsFromAriaSnapshot(raw, snapshotOpts);
      rawSnapshot = built.snapshot;
      refs = built.refs;
    } else if (refsMode === "aria") {
      // Use Playwright's AI snapshot which includes [ref=eN] markers
      const snapshot = await (page as any)._snapshotForAI?.({ track: "response" })
        ?? await (page as any).ariaSnapshot?.({ mode: "ai" })
        ?? "";
      const raw = String(snapshot);
      const built = buildRefsFromAiSnapshot(raw, snapshotOpts);
      rawSnapshot = built.snapshot;
      refs = built.refs;
    } else {
      // Role mode: use ariaSnapshot and assign our own refs
      const ariaSnapshot = await page.ariaSnapshot();
      const raw = String(ariaSnapshot ?? "");
      const built = buildRefsFromAriaSnapshot(raw, snapshotOpts);
      rawSnapshot = built.snapshot;
      refs = built.refs;
    }
  } catch {
    // Graceful degradation: if primary mode fails, try fallback
    try {
      const ariaSnapshot = await page.ariaSnapshot();
      const raw = String(ariaSnapshot ?? "");
      const built = buildRefsFromAriaSnapshot(raw, snapshotOpts);
      rawSnapshot = built.snapshot;
      refs = built.refs;
    } catch {
      // Last resort: return page title and URL as minimal snapshot
      let title = "";
      try { title = await page.title(); } catch {}
      rawSnapshot = `(snapshot unavailable — page: ${title || page.url()})`;
      refs = {};
    }
  }

  const { text, truncated } = truncate(rawSnapshot, maxChars);

  // Store refs for later resolution
  storeRefs({
    page,
    targetId: opts?.targetId,
    refs,
    mode: refsMode,
  });

  return { snapshot: text, truncated, refs };
}
