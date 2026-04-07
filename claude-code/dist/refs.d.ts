import type { Page } from "playwright-core";
export type RoleRef = {
    role: string;
    name?: string;
    nth?: number;
};
export type RoleRefMap = Record<string, RoleRef>;
export interface SnapshotOptions {
    interactive?: boolean;
    compact?: boolean;
    maxDepth?: number;
    maxChars?: number;
    selector?: string;
}
interface RoleNameTracker {
    counts: Map<string, number>;
    refsByKey: Map<string, string[]>;
    getKey(role: string, name?: string): string;
    getNextIndex(role: string, name?: string): number;
    trackRef(role: string, name: string | undefined, ref: string): void;
    getDuplicateKeys(): Set<string>;
}
export declare function createRoleNameTracker(): RoleNameTracker;
export declare function removeNthFromNonDuplicates(refs: RoleRefMap, tracker: RoleNameTracker): void;
export declare function parseRef(raw: string): string | null;
export declare function parseAiSnapshotRef(suffix: string): string | null;
export declare function storeRefs(opts: {
    page: Page;
    targetId?: string;
    refs: RoleRefMap;
    mode: "role" | "aria";
    frameSelector?: string;
}): void;
export declare function restoreRefs(page: Page, targetId?: string): void;
export declare function refLocator(page: Page, ref: string): import("playwright-core").Locator;
export declare function buildRefsFromAiSnapshot(aiSnapshot: string, options?: SnapshotOptions): {
    snapshot: string;
    refs: RoleRefMap;
};
export declare function buildRefsFromAriaSnapshot(ariaSnapshot: string, options?: SnapshotOptions): {
    snapshot: string;
    refs: RoleRefMap;
};
export {};
