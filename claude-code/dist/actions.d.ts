import type { Page } from "playwright-core";
import { type SsrfPolicy } from "./navigation-guard.js";
export type ActKind = "click" | "type" | "press" | "hover" | "drag" | "fill" | "select" | "wait" | "evaluate" | "batch" | "scrollIntoView" | "armDialog" | "waitForDownload" | "download" | "responseBody";
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
    loadState?: "load" | "domcontentloaded" | "networkidle";
    actions?: ActRequest[];
    stopOnError?: boolean;
    delayMs?: number;
    accept?: boolean;
    promptText?: string;
    path?: string;
    urlPattern?: string;
    maxChars?: number;
}
export declare function executeAct(page: Page, request: ActRequest, depth?: number, ssrfPolicy?: SsrfPolicy): Promise<unknown>;
