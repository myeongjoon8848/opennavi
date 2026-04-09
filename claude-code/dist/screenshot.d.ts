import type { Page } from "playwright-core";
/**
 * Capture a screenshot with automatic size normalization.
 *
 * Strategy:
 * 1. If fullPage and the page is very tall, clip to MAX_SCREENSHOT_SIDE height.
 * 2. Capture as PNG first (lossless). If within budget, return it.
 * 3. If PNG exceeds MAX_SCREENSHOT_BYTES, re-capture as JPEG with progressive
 *    quality reduction until the image fits.
 */
export declare function captureNormalizedScreenshot(page: Page, opts?: {
    fullPage?: boolean;
    selector?: string;
    maxBytes?: number;
    maxSide?: number;
}): Promise<{
    buffer: Buffer;
    mimeType: "image/png" | "image/jpeg";
}>;
