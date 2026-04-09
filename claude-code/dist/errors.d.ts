/**
 * Base error class for all browser-related errors.
 * Carries a semantic status code for structured error handling.
 */
export declare class BrowserError extends Error {
    status: number;
    constructor(message: string, status?: number, options?: ErrorOptions);
}
/** 400 — invalid input parameters */
export declare class BrowserValidationError extends BrowserError {
    constructor(message: string, options?: ErrorOptions);
}
/** 404 — tab not found */
export declare class BrowserTabNotFoundError extends BrowserError {
    constructor(message?: string, options?: ErrorOptions);
}
/** 400 — navigation blocked by SSRF guard */
export declare class BrowserNavigationBlockedError extends BrowserError {
    constructor(message: string, options?: ErrorOptions);
}
/** 503 — browser connection unavailable */
export declare class BrowserConnectionError extends BrowserError {
    constructor(message: string, options?: ErrorOptions);
}
/**
 * Transforms raw Playwright errors into actionable, AI-friendly messages
 * that guide the agent toward the correct recovery action.
 */
export declare function toAIFriendlyError(err: unknown): string;
