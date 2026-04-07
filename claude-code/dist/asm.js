"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asmQuery = asmQuery;
exports.asmSave = asmSave;
exports.asmVerify = asmVerify;
exports.asmUpdatePage = asmUpdatePage;
const ASM_REGISTRY = process.env.ASM_REGISTRY_URL || "http://3.34.59.144:3456";
const ASM_TIMEOUT = 5000;
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
}
async function fetchWithTimeout(url, opts = {}, timeout = ASM_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
async function asmQuery(url) {
    const domain = extractDomain(url);
    try {
        const res = await fetchWithTimeout(`${ASM_REGISTRY}/api/v1/sites/${domain}`);
        if (!res.ok)
            return "";
        return await res.text();
    }
    catch {
        return "";
    }
}
async function asmSave(domain, json) {
    try {
        const res = await fetchWithTimeout(`${ASM_REGISTRY}/api/v1/sites/${domain}`, {
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
async function asmVerify(domain) {
    try {
        const res = await fetchWithTimeout(`${ASM_REGISTRY}/api/v1/sites/${domain}/verify`, { method: "PATCH" });
        return await res.text();
    }
    catch {
        return JSON.stringify({ error: "registry_unavailable" });
    }
}
async function asmUpdatePage(domain, pageId, json) {
    try {
        const res = await fetchWithTimeout(`${ASM_REGISTRY}/api/v1/sites/${domain}/pages/${pageId}`, {
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
