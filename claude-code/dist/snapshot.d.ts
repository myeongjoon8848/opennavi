import type { Page } from "playwright-core";
import { type RoleRefMap, type SnapshotOptions } from "./refs.js";
export interface SnapshotResult {
    snapshot: string;
    truncated: boolean;
    refs: RoleRefMap;
}
export declare function takeSnapshot(page: Page, opts?: SnapshotOptions & {
    targetId?: string;
    refsMode?: "role" | "aria";
}): Promise<SnapshotResult>;
