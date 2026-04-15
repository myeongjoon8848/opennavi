"use strict";
// URL pattern matching and drift detection for OpenNavi site maps.
// Patterns use `{variable}` segments, e.g. /wiki/{ArticleName}.
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesNodePattern = matchesNodePattern;
exports.findMatchingNode = findMatchingNode;
exports.detectDrift = detectDrift;
const DUMMY_ORIGIN = "https://dummy.opennavi.invalid";
function parseUrl(raw) {
    try {
        // Accept relative paths like "/wiki/{X}" by resolving against a dummy origin.
        if (raw.startsWith("/") || raw.startsWith("?")) {
            return new URL(raw, DUMMY_ORIGIN);
        }
        return new URL(raw);
    }
    catch {
        return null;
    }
}
// Node URL patterns contain `{var}` placeholders which get percent-encoded
// by the URL constructor. Parse them as raw strings instead.
function parsePattern(raw) {
    if (typeof raw !== "string" || raw.length === 0)
        return null;
    // Strip origin if the pattern is absolute (shouldn't be — bad data).
    let s = raw;
    const schemeMatch = s.match(/^[a-z]+:\/\/[^/]+/i);
    if (schemeMatch)
        s = s.slice(schemeMatch[0].length) || "/";
    const hashIdx = s.indexOf("#");
    if (hashIdx >= 0)
        s = s.slice(0, hashIdx);
    const qIdx = s.indexOf("?");
    const path = qIdx >= 0 ? s.slice(0, qIdx) : s;
    const queryRaw = qIdx >= 0 ? s.slice(qIdx + 1) : "";
    const query = new Map();
    if (queryRaw) {
        for (const pair of queryRaw.split("&")) {
            if (!pair)
                continue;
            const eq = pair.indexOf("=");
            const k = eq >= 0 ? pair.slice(0, eq) : pair;
            const v = eq >= 0 ? pair.slice(eq + 1) : "";
            query.set(decodeURIComponent(k), decodeURIComponent(v));
        }
    }
    return { path: path || "/", query };
}
function normalizePath(path) {
    if (path.length > 1 && path.endsWith("/"))
        return path.slice(0, -1);
    return path;
}
function isVariable(segment) {
    return segment.startsWith("{") && segment.endsWith("}") && segment.length > 2;
}
function matchesPath(currentPath, patternPath) {
    const cur = normalizePath(currentPath).split("/");
    const pat = normalizePath(patternPath).split("/");
    if (cur.length !== pat.length)
        return false;
    for (let i = 0; i < pat.length; i++) {
        if (isVariable(pat[i]))
            continue;
        if (pat[i] !== cur[i])
            return false;
    }
    return true;
}
function matchesQuery(currentParams, patternParams) {
    for (const [key, value] of patternParams) {
        const cur = currentParams.get(key);
        if (cur === null)
            return false;
        if (isVariable(value))
            continue;
        if (cur !== value)
            return false;
    }
    return true;
}
function matchesNodePattern(currentUrl, nodePattern) {
    const cur = parseUrl(currentUrl);
    const pat = parsePattern(nodePattern);
    if (!cur || !pat)
        return false;
    return matchesPath(cur.pathname, pat.path) &&
        matchesQuery(cur.searchParams, pat.query);
}
function findMatchingNode(url, record) {
    if (!record?.nodes)
        return null;
    for (const [id, node] of Object.entries(record.nodes)) {
        if (node && typeof node.url === "string" && matchesNodePattern(url, node.url)) {
            return id;
        }
    }
    return null;
}
function sameHostAndPath(a, b) {
    const ua = parseUrl(a);
    const ub = parseUrl(b);
    if (!ua || !ub)
        return a === b;
    return ua.host === ub.host && normalizePath(ua.pathname) === normalizePath(ub.pathname);
}
function detectDrift(params) {
    const { requestedUrl, finalUrl, status, record } = params;
    if (!record?.nodes)
        return [];
    const domain = record.domain || "<domain>";
    const drift = [];
    const requestedMatch = findMatchingNode(requestedUrl, record);
    const finalMatch = findMatchingNode(finalUrl, record);
    if (requestedMatch && typeof status === "number" && status >= 400) {
        drift.push({
            type: "stale_addr",
            nodeId: requestedMatch,
            message: `nodes.${requestedMatch}.url returned HTTP ${status}`,
            suggestion: `PATCH /sites/${domain}/nodes/${requestedMatch}`,
        });
    }
    if (requestedMatch &&
        !finalMatch &&
        !sameHostAndPath(requestedUrl, finalUrl)) {
        drift.push({
            type: "addr_redirect",
            nodeId: requestedMatch,
            message: `Final URL ${finalUrl} diverged from nodes.${requestedMatch}.url`,
            suggestion: `nodes.${requestedMatch} may need its URL pattern updated`,
        });
    }
    // unknown_url is the weakest signal — only emit if we haven't already
    // flagged a more specific issue for the same final URL.
    const alreadyFlaggedFinal = drift.some((d) => d.type === "addr_redirect");
    if (!finalMatch && !alreadyFlaggedFinal) {
        drift.push({
            type: "unknown_url",
            message: `Final URL ${finalUrl} does not match any node pattern in the map`,
            suggestion: `Consider PATCH to add or extend a node pattern`,
        });
    }
    return drift;
}
