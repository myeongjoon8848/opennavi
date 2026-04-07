import type { Page } from "playwright-core";
export interface SnapshotResult {
    snapshot: string;
    truncated: boolean;
}
export declare function takeSnapshot(page: Page, opts?: {
    maxChars?: number;
    selector?: string;
}): Promise<SnapshotResult>;
