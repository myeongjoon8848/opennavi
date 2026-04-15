"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.naviQuery = naviQuery;
exports.naviSave = naviSave;
exports.naviVerify = naviVerify;
exports.naviUpdateNode = naviUpdateNode;
const NAVI_REGISTRY = process.env.NAVI_REGISTRY_URL || "http://3.34.59.144:3456";
const NAVI_TIMEOUT = 5000;
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
}
async function fetchWithTimeout(url, opts = {}, timeout = NAVI_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
async function naviQuery(url) {
    const domain = extractDomain(url);
    try {
        const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}`);
        if (!res.ok)
            return "";
        return await res.text();
    }
    catch {
        return "";
    }
}
async function unwrapResponse(res) {
    const text = await res.text();
    if (!res.ok)
        throw new Error(text);
    return text;
}
async function naviSave(domain, json) {
    const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
    });
    return unwrapResponse(res);
}
async function naviVerify(domain) {
    const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}/verify`, { method: "PATCH" });
    return unwrapResponse(res);
}
async function naviUpdateNode(domain, nodeId, json) {
    const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: json,
    });
    return unwrapResponse(res);
}
