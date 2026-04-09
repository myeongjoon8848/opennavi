import type { Page } from "playwright-core";
import { INTERACTIVE_ROLES, CONTENT_ROLES, STRUCTURAL_ROLES } from "./roles.js";

// --- Types ---

export type RoleRef = {
  role: string;
  name?: string;
  nth?: number;
};

export type RoleRefMap = Record<string, RoleRef>;

export interface SnapshotOptions {
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
  maxChars?: number;
  selector?: string;
}

// --- Role Name Tracker (duplicate handling) ---

interface RoleNameTracker {
  counts: Map<string, number>;
  refsByKey: Map<string, string[]>;
  getKey(role: string, name?: string): string;
  getNextIndex(role: string, name?: string): number;
  trackRef(role: string, name: string | undefined, ref: string): void;
  getDuplicateKeys(): Set<string>;
}

export function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string) {
      return `${role}:${name ?? ""}`;
    },
    getNextIndex(role: string, name?: string) {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string) {
      const key = this.getKey(role, name);
      const list = refsByKey.get(key) ?? [];
      list.push(ref);
      refsByKey.set(key, list);
    },
    getDuplicateKeys() {
      const out = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) {
          out.add(key);
        }
      }
      return out;
    },
  };
}

export function removeNthFromNonDuplicates(
  refs: RoleRefMap,
  tracker: RoleNameTracker,
): void {
  const dupKeys = tracker.getDuplicateKeys();
  for (const [ref, info] of Object.entries(refs)) {
    const key = tracker.getKey(info.role, info.name);
    if (!dupKeys.has(key)) {
      delete refs[ref].nth;
    }
  }
}

// --- Ref Parsing ---

export function parseRef(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@")
    ? trimmed.slice(1)
    : trimmed.startsWith("ref=")
      ? trimmed.slice(4)
      : trimmed;
  return /^e\d+$/.test(normalized) ? normalized : null;
}

export function parseAiSnapshotRef(suffix: string): string | null {
  const match = suffix.match(/\[ref=(e\d+)\]/i);
  return match ? match[1]! : null;
}

// --- Ref Storage (per-page state) ---

interface PageRefState {
  refs: RoleRefMap;
  mode: "role" | "aria";
  frameSelector?: string;
}

const pageRefStates = new WeakMap<Page, PageRefState>();
const refsByTargetId = new Map<string, { refs: RoleRefMap; mode: "role" | "aria" }>();
const MAX_REF_CACHE = 50;

export function storeRefs(opts: {
  page: Page;
  targetId?: string;
  refs: RoleRefMap;
  mode: "role" | "aria";
  frameSelector?: string;
}): void {
  const state: PageRefState = {
    refs: opts.refs,
    mode: opts.mode,
    frameSelector: opts.frameSelector,
  };
  pageRefStates.set(opts.page, state);

  if (opts.targetId) {
    if (refsByTargetId.size >= MAX_REF_CACHE) {
      const oldest = refsByTargetId.keys().next().value;
      if (oldest) refsByTargetId.delete(oldest);
    }
    refsByTargetId.set(opts.targetId, { refs: opts.refs, mode: opts.mode });
  }
}

export function restoreRefs(page: Page, targetId?: string): void {
  if (pageRefStates.has(page)) return;
  if (!targetId) return;
  const cached = refsByTargetId.get(targetId);
  if (!cached) return;
  pageRefStates.set(page, { refs: cached.refs, mode: cached.mode });
}

// --- Ref Resolution (semantic) ---

export function refLocator(page: Page, ref: string) {
  const normalized = parseRef(ref) ?? ref;
  const state = pageRefStates.get(page);

  if (/^e\d+$/.test(normalized) && state) {
    if (state.mode === "aria") {
      return page.locator(`aria-ref=${normalized}`);
    }

    // Semantic resolution via role + name
    const info = state.refs[normalized];
    if (!info) {
      throw new Error(`Unknown ref "${normalized}". Take a new snapshot.`);
    }

    const scope = state.frameSelector
      ? page.frameLocator(state.frameSelector)
      : page;

    const locator = info.name
      ? (scope as Page).getByRole(info.role as any, { name: info.name, exact: true })
      : (scope as Page).getByRole(info.role as any);

    return info.nth !== undefined ? locator.nth(info.nth) : locator;
  }

  return page.locator(`aria-ref=${normalized}`);
}

// --- Snapshot Building ---

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1]!.length / 2) : 0;
}

function shouldCreateRef(role: string, name?: string): boolean {
  return INTERACTIVE_ROLES.has(role) || (CONTENT_ROLES.has(role) && !!name);
}

export function buildRefsFromAiSnapshot(
  aiSnapshot: string,
  options: SnapshotOptions = {},
): { snapshot: string; refs: RoleRefMap } {
  const lines = String(aiSnapshot ?? "").split("\n");
  const refs: RoleRefMap = {};
  const out: string[] = [];

  for (const line of lines) {
    const depth = getIndentLevel(line);
    if (options.maxDepth !== undefined && depth > options.maxDepth) continue;

    const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) {
      if (!options.interactive) out.push(line);
      continue;
    }

    const [, , roleRaw, name, suffix] = match;
    const role = roleRaw!.toLowerCase();
    const isInteractive = INTERACTIVE_ROLES.has(role);
    const isContent = CONTENT_ROLES.has(role);
    const isStructural = STRUCTURAL_ROLES.has(role);

    if (options.interactive && !isInteractive) continue;
    if (options.compact && isStructural && !name) continue;

    const ref = parseAiSnapshotRef(suffix ?? "");
    if (ref) {
      refs[ref] = { role, ...(name ? { name } : {}) };
    }

    out.push(line);
  }

  const tree = out.join("\n") || (options.interactive ? "(no interactive elements)" : "(empty)");
  return { snapshot: compactTree(tree, options.compact), refs };
}

export function buildRefsFromAriaSnapshot(
  ariaSnapshot: string,
  options: SnapshotOptions = {},
): { snapshot: string; refs: RoleRefMap } {
  const lines = ariaSnapshot.split("\n");
  const refs: RoleRefMap = {};
  const tracker = createRoleNameTracker();
  let counter = 0;
  const nextRef = () => `e${++counter}`;
  const out: string[] = [];

  for (const line of lines) {
    const depth = getIndentLevel(line);
    if (options.maxDepth !== undefined && depth > options.maxDepth) continue;

    const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) {
      if (!options.interactive) out.push(line);
      continue;
    }

    const [, prefix, roleRaw, name, suffix] = match;
    const role = roleRaw!.toLowerCase();
    const isInteractive = INTERACTIVE_ROLES.has(role);
    const isContent = CONTENT_ROLES.has(role);
    const isStructural = STRUCTURAL_ROLES.has(role);

    if (options.interactive && !isInteractive) continue;
    if (options.compact && isStructural && !name) continue;

    if (shouldCreateRef(role, name)) {
      const ref = nextRef();
      const nth = tracker.getNextIndex(role, name);
      tracker.trackRef(role, name, ref);
      refs[ref] = { role, ...(name ? { name } : {}), nth };
      const nameStr = name ? ` "${name}"` : "";
      out.push(`${prefix}${roleRaw}${nameStr} [ref=${ref}]${suffix ?? ""}`);
    } else {
      out.push(line);
    }
  }

  removeNthFromNonDuplicates(refs, tracker);

  const tree = out.join("\n") || (options.interactive ? "(no interactive elements)" : "(empty)");
  return { snapshot: compactTree(tree, options.compact), refs };
}

/**
 * Smart compact tree: removes structural nodes that have no descendant refs.
 * Keeps a node if:
 *   - it has a [ref=...] tag, OR
 *   - it has content after the role (not just a trailing colon), OR
 *   - any descendant (by indent level) has a [ref=...] tag
 */
function compactTree(text: string, compact?: boolean): string {
  if (!compact) return text;
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Drop empty lines and bare dashes
    if (trimmed === "" || trimmed === "-") continue;

    // Always keep lines with refs
    if (line.includes("[ref=")) {
      result.push(line);
      continue;
    }

    // Keep lines that have actual content (not just a structural wrapper ending with ":")
    if (trimmed.includes(":") && !trimmed.endsWith(":")) {
      result.push(line);
      continue;
    }

    // For structural wrappers, scan descendants to see if any have refs
    const currentIndent = getIndentLevel(line);
    let hasRelevantDescendant = false;
    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]!);
      if (childIndent <= currentIndent) break; // left sibling/parent scope
      if (lines[j]!.includes("[ref=")) {
        hasRelevantDescendant = true;
        break;
      }
    }
    if (hasRelevantDescendant) {
      result.push(line);
    }
  }

  return result.join("\n");
}
