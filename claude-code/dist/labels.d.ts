import type { Page } from "playwright-core";
import { type RoleRefMap } from "./refs.js";
export declare function screenshotWithLabels(opts: {
    page: Page;
    refs: RoleRefMap;
    maxLabels?: number;
    interactive?: boolean;
    fullPage?: boolean;
}): Promise<{
    buffer: Buffer;
    labels: number;
    skipped: number;
}>;
