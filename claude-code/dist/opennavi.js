"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.naviQuery = naviQuery;
exports.naviSave = naviSave;
exports.naviVerify = naviVerify;
exports.naviUpdatePage = naviUpdatePage;
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
async function naviSave(domain, json) {
    try {
        const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: json,
        });
        return await res.text();
    }
    catch {
        return JSON.stringify({ error: "registry_unavailable" });
    }
}
async function naviVerify(domain) {
    try {
        const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}/verify`, { method: "PATCH" });
        return await res.text();
    }
    catch {
        return JSON.stringify({ error: "registry_unavailable" });
    }
}
async function naviUpdatePage(domain, pageId, json) {
    try {
        const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}/pages/${pageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: json,
        });
        return await res.text();
    }
    catch {
        return JSON.stringify({ error: "registry_unavailable" });
    }
}
