"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoleNameTracker = createRoleNameTracker;
exports.removeNthFromNonDuplicates = removeNthFromNonDuplicates;
exports.parseRef = parseRef;
exports.parseAiSnapshotRef = parseAiSnapshotRef;
exports.storeRefs = storeRefs;
exports.restoreRefs = restoreRefs;
exports.refLocator = refLocator;
exports.buildRefsFromAiSnapshot = buildRefsFromAiSnapshot;
exports.buildRefsFromAriaSnapshot = buildRefsFromAriaSnapshot;
const roles_js_1 = require("./roles.js");
function createRoleNameTracker() {
    const counts = new Map();
    const refsByKey = new Map();
    return {
        counts,
        refsByKey,
        getKey(role, name) {
            return `${role}:${name ?? ""}`;
        },
        getNextIndex(role, name) {
            const key = this.getKey(role, name);
            const current = counts.get(key) ?? 0;
            counts.set(key, current + 1);
            return current;
        },
        trackRef(role, name, ref) {
            const key = this.getKey(role, name);
            const list = refsByKey.get(key) ?? [];
            list.push(ref);
            refsByKey.set(key, list);
        },
        getDuplicateKeys() {
            const out = new Set();
            for (const [key, refs] of refsByKey) {
                if (refs.length > 1) {
                    out.add(key);
                }
            }
            return out;
        },
    };
}
function removeNthFromNonDuplicates(refs, tracker) {
    const dupKeys = tracker.getDuplicateKeys();
    for (const [ref, info] of Object.entries(refs)) {
        const key = tracker.getKey(info.role, info.name);
        if (!dupKeys.has(key)) {
            delete refs[ref].nth;
        }
    }
}
// --- Ref Parsing ---
function parseRef(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed.startsWith("@")
        ? trimmed.slice(1)
        : trimmed.startsWith("ref=")
            ? trimmed.slice(4)
            : trimmed;
    return /^e\d+$/.test(normalized) ? normalized : null;
}
function parseAiSnapshotRef(suffix) {
    const match = suffix.match(/\[ref=(e\d+)\]/i);
    return match ? match[1] : null;
}
const pageRefStates = new WeakMap();
const refsByTargetId = new Map();
const MAX_REF_CACHE = 50;
function storeRefs(opts) {
    const state = {
        refs: opts.refs,
        mode: opts.mode,
        frameSelector: opts.frameSelector,
    };
    pageRefStates.set(opts.page, state);
    if (opts.targetId) {
        if (refsByTargetId.size >= MAX_REF_CACHE) {
            const oldest = refsByTargetId.keys().next().value;
            if (oldest)
                refsByTargetId.delete(oldest);
        }
        refsByTargetId.set(opts.targetId, { refs: opts.refs, mode: opts.mode });
    }
}
function restoreRefs(page, targetId) {
    if (pageRefStates.has(page))
        return;
    if (!targetId)
        return;
    const cached = refsByTargetId.get(targetId);
    if (!cached)
        return;
    pageRefStates.set(page, { refs: cached.refs, mode: cached.mode });
}
// --- Ref Resolution (semantic) ---
function refLocator(page, ref) {
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
            ? scope.getByRole(info.role, { name: info.name, exact: true })
            : scope.getByRole(info.role);
        return info.nth !== undefined ? locator.nth(info.nth) : locator;
    }
    return page.locator(`aria-ref=${normalized}`);
}
// --- Snapshot Building ---
function getIndentLevel(line) {
    const match = line.match(/^(\s*)/);
    return match ? Math.floor(match[1].length / 2) : 0;
}
function shouldCreateRef(role, name) {
    return roles_js_1.INTERACTIVE_ROLES.has(role) || (roles_js_1.CONTENT_ROLES.has(role) && !!name);
}
function buildRefsFromAiSnapshot(aiSnapshot, options = {}) {
    const lines = String(aiSnapshot ?? "").split("\n");
    const refs = {};
    const out = [];
    for (const line of lines) {
        const depth = getIndentLevel(line);
        if (options.maxDepth !== undefined && depth > options.maxDepth)
            continue;
        const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
        if (!match) {
            if (!options.interactive)
                out.push(line);
            continue;
        }
        const [, , roleRaw, name, suffix] = match;
        const role = roleRaw.toLowerCase();
        const isInteractive = roles_js_1.INTERACTIVE_ROLES.has(role);
        const isContent = roles_js_1.CONTENT_ROLES.has(role);
        const isStructural = roles_js_1.STRUCTURAL_ROLES.has(role);
        if (options.interactive && !isInteractive)
            continue;
        if (options.compact && isStructural && !name)
            continue;
        const ref = parseAiSnapshotRef(suffix ?? "");
        if (ref) {
            refs[ref] = { role, ...(name ? { name } : {}) };
        }
        out.push(line);
    }
    const tree = out.join("\n") || (options.interactive ? "(no interactive elements)" : "(empty)");
    return { snapshot: compactTree(tree, options.compact), refs };
}
function buildRefsFromAriaSnapshot(ariaSnapshot, options = {}) {
    const lines = ariaSnapshot.split("\n");
    const refs = {};
    const tracker = createRoleNameTracker();
    let counter = 0;
    const nextRef = () => `e${++counter}`;
    const out = [];
    for (const line of lines) {
        const depth = getIndentLevel(line);
        if (options.maxDepth !== undefined && depth > options.maxDepth)
            continue;
        const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
        if (!match) {
            if (!options.interactive)
                out.push(line);
            continue;
        }
        const [, prefix, roleRaw, name, suffix] = match;
        const role = roleRaw.toLowerCase();
        const isInteractive = roles_js_1.INTERACTIVE_ROLES.has(role);
        const isContent = roles_js_1.CONTENT_ROLES.has(role);
        const isStructural = roles_js_1.STRUCTURAL_ROLES.has(role);
        if (options.interactive && !isInteractive)
            continue;
        if (options.compact && isStructural && !name)
            continue;
        if (shouldCreateRef(role, name)) {
            const ref = nextRef();
            const nth = tracker.getNextIndex(role, name);
            tracker.trackRef(role, name, ref);
            refs[ref] = { role, ...(name ? { name } : {}), nth };
            const nameStr = name ? ` "${name}"` : "";
            out.push(`${prefix}${roleRaw}${nameStr} [ref=${ref}]${suffix ?? ""}`);
        }
        else {
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
function compactTree(text, compact) {
    if (!compact)
        return text;
    const lines = text.split("\n");
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Drop empty lines and bare dashes
        if (trimmed === "" || trimmed === "-")
            continue;
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
            const childIndent = getIndentLevel(lines[j]);
            if (childIndent <= currentIndent)
                break; // left sibling/parent scope
            if (lines[j].includes("[ref=")) {
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
