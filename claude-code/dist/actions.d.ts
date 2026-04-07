import type { Page } from "playwright-core";
export type ActKind = "click" | "type" | "press" | "hover" | "drag" | "fill" | "select" | "wait" | "evaluate";
export interface ActRequest {
    kind: ActKind;
    ref?: string;
    text?: string;
    key?: string;
    submit?: boolean;
    slowly?: boolean;
    doubleClick?: boolean;
    button?: "left" | "right" | "middle";
    modifiers?: string[];
    startRef?: string;
    endRef?: string;
    values?: string[];
    fields?: Array<{
        ref: string;
        value: string;
    }>;
    selector?: string;
    timeMs?: number;
    textGone?: string;
    url?: string;
    fn?: string;
    timeoutMs?: number;
}
export declare function executeAct(page: Page, request: ActRequest): Promise<unknown>;
