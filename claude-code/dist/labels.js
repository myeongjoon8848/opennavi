"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenshotWithLabels = screenshotWithLabels;
const refs_js_1 = require("./refs.js");
async function screenshotWithLabels(opts) {
    const { page, refs } = opts;
    const maxLabels = opts.maxLabels ?? 150;
    const viewport = await page.evaluate(() => ({
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
    }));
    const refKeys = Object.keys(refs);
    const boxes = [];
    let skipped = 0;
    for (const ref of refKeys) {
        if (boxes.length >= maxLabels) {
            skipped++;
            continue;
        }
        try {
            const box = await (0, refs_js_1.refLocator)(page, ref).boundingBox();
            if (!box) {
                skipped++;
                continue;
            }
            // Skip out-of-viewport elements
            const x1 = box.x + box.width;
            const y1 = box.y + box.height;
            if (x1 < viewport.scrollX ||
                box.x > viewport.scrollX + viewport.width ||
                y1 < viewport.scrollY ||
                box.y > viewport.scrollY + viewport.height) {
                skipped++;
                continue;
            }
            boxes.push({
                ref,
                x: box.x - viewport.scrollX,
                y: box.y - viewport.scrollY,
                w: Math.max(1, box.width),
                h: Math.max(1, box.height),
            });
        }
        catch {
            skipped++;
        }
    }
    try {
        if (boxes.length > 0) {
            await page.evaluate((labels) => {
                document.querySelectorAll("[data-asm-labels]").forEach((el) => el.remove());
                const root = document.createElement("div");
                root.setAttribute("data-asm-labels", "1");
                root.style.position = "fixed";
                root.style.left = "0";
                root.style.top = "0";
                root.style.zIndex = "2147483647";
                root.style.pointerEvents = "none";
                root.style.fontFamily =
                    '"SF Mono",SFMono-Regular,Menlo,Monaco,Consolas,monospace';
                const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
                for (const label of labels) {
                    const box = document.createElement("div");
                    box.setAttribute("data-asm-labels", "1");
                    box.style.position = "absolute";
                    box.style.left = `${label.x}px`;
                    box.style.top = `${label.y}px`;
                    box.style.width = `${label.w}px`;
                    box.style.height = `${label.h}px`;
                    box.style.border = "2px solid #ffb020";
                    box.style.boxSizing = "border-box";
                    const tag = document.createElement("div");
                    tag.setAttribute("data-asm-labels", "1");
                    tag.textContent = label.ref;
                    tag.style.position = "absolute";
                    tag.style.left = `${label.x}px`;
                    tag.style.top = `${clamp(label.y - 18, 0, 20000)}px`;
                    tag.style.background = "#ffb020";
                    tag.style.color = "#1a1a1a";
                    tag.style.fontSize = "12px";
                    tag.style.lineHeight = "14px";
                    tag.style.padding = "1px 4px";
                    tag.style.borderRadius = "3px";
                    tag.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
                    tag.style.whiteSpace = "nowrap";
                    root.appendChild(box);
                    root.appendChild(tag);
                }
                document.documentElement.appendChild(root);
            }, boxes);
        }
        const buffer = (await page.screenshot({
            type: "png",
            fullPage: opts.fullPage,
        }));
        return { buffer, labels: boxes.length, skipped };
    }
    finally {
        await page
            .evaluate(() => {
            document.querySelectorAll("[data-asm-labels]").forEach((el) => el.remove());
        })
            .catch(() => { });
    }
}
