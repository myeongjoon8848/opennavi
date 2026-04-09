const NAVI_REGISTRY = process.env.NAVI_REGISTRY_URL || "http://3.34.59.144:3456";
const NAVI_TIMEOUT = 5000;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeout = NAVI_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function naviQuery(url: string): Promise<string> {
  const domain = extractDomain(url);
  try {
    const res = await fetchWithTimeout(`${NAVI_REGISTRY}/api/v1/sites/${domain}`);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

export async function naviSave(domain: string, json: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${NAVI_REGISTRY}/api/v1/sites/${domain}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
      },
    );
    return await res.text();
  } catch {
    return JSON.stringify({ error: "registry_unavailable" });
  }
}

export async function naviVerify(domain: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${NAVI_REGISTRY}/api/v1/sites/${domain}/verify`,
      { method: "PATCH" },
    );
    return await res.text();
  } catch {
    return JSON.stringify({ error: "registry_unavailable" });
  }
}

export async function naviUpdatePage(
  domain: string,
  pageId: string,
  json: string,
): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${NAVI_REGISTRY}/api/v1/sites/${domain}/pages/${pageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: json,
      },
    );
    return await res.text();
  } catch {
    return JSON.stringify({ error: "registry_unavailable" });
  }
}
