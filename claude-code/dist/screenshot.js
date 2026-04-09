"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureNormalizedScreenshot = captureNormalizedScreenshot;
// ---------------------------------------------------------------------------
// Screenshot size normalization
// Prevents huge screenshots from blowing up MCP message size and LLM context.
// ---------------------------------------------------------------------------
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_SCREENSHOT_SIDE = 2000; // px
/**
 * Capture a screenshot with automatic size normalization.
 *
 * Strategy:
 * 1. If fullPage and the page is very tall, clip to MAX_SCREENSHOT_SIDE height.
 * 2. Capture as PNG first (lossless). If within budget, return it.
 * 3. If PNG exceeds MAX_SCREENSHOT_BYTES, re-capture as JPEG with progressive
 *    quality reduction until the image fits.
 */
async function captureNormalizedScreenshot(page, opts) {
    const maxBytes = opts?.maxBytes ?? MAX_SCREENSHOT_BYTES;
    const maxSide = opts?.maxSide ?? MAX_SCREENSHOT_SIDE;
    const fullPage = opts?.fullPage ?? false;
    // If fullPage, check page dimensions and clip if too tall
    let clipOpts;
    if (fullPage) {
        const dims = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
        }));
        if (dims.height > maxSide || dims.width > maxSide) {
            // Clip to reasonable dimensions instead of capturing gigantic page
            clipOpts = {
                type: "png",
                fullPage: false,
                clip: {
                    x: 0,
                    y: 0,
                    width: Math.min(dims.width, maxSide),
                    height: Math.min(dims.height, maxSide),
                },
            };
        }
    }
    // If a selector is given, just capture it
    if (opts?.selector) {
        const buffer = await page.locator(opts.selector).screenshot({ type: "png" });
        if (buffer.byteLength <= maxBytes) {
            return { buffer, mimeType: "image/png" };
        }
        // Fall through to JPEG reduction
        return reduceToJpeg(page, buffer, maxBytes, opts.selector);
    }
    // Attempt PNG capture
    const pngOpts = clipOpts ?? { type: "png", fullPage };
    const pngBuffer = await page.screenshot(pngOpts);
    if (pngBuffer.byteLength <= maxBytes) {
        return { buffer: pngBuffer, mimeType: "image/png" };
    }
    // PNG too large — try JPEG at decreasing quality levels
    return reduceToJpeg(page, pngBuffer, maxBytes);
}
const JPEG_QUALITY_STEPS = [85, 70, 50, 35, 20];
async function reduceToJpeg(page, _fallbackBuffer, maxBytes, selector) {
    for (const quality of JPEG_QUALITY_STEPS) {
        let buffer;
        if (selector) {
            buffer = await page.locator(selector).screenshot({
                type: "jpeg",
                quality,
            });
        }
        else {
            buffer = await page.screenshot({
                type: "jpeg",
                quality,
                fullPage: false,
            });
        }
        if (buffer.byteLength <= maxBytes) {
            return { buffer, mimeType: "image/jpeg" };
        }
    }
    // Last resort: return lowest quality JPEG even if still above budget
    const lastBuffer = await page.screenshot({
        type: "jpeg",
        quality: JPEG_QUALITY_STEPS[JPEG_QUALITY_STEPS.length - 1],
        fullPage: false,
    });
    return { buffer: lastBuffer, mimeType: "image/jpeg" };
}
