interface SiteRecord {
    domain?: string;
    nodes?: Record<string, {
        url?: string;
    }>;
}
export interface DriftSignal {
    type: "unknown_url" | "stale_addr" | "addr_redirect";
    nodeId?: string;
    message: string;
    suggestion?: string;
}
export declare function matchesNodePattern(currentUrl: string, nodePattern: string): boolean;
export declare function findMatchingNode(url: string, record: SiteRecord): string | null;
export declare function detectDrift(params: {
    requestedUrl: string;
    finalUrl: string;
    status?: number;
    record: SiteRecord | null | undefined;
}): DriftSignal[];
export {};
