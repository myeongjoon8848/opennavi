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

async function unwrapResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text;
}

export async function naviSave(domain: string, json: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${NAVI_REGISTRY}/api/v1/sites/${domain}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: json,
    },
  );
  return unwrapResponse(res);
}

export async function naviVerify(domain: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${NAVI_REGISTRY}/api/v1/sites/${domain}/verify`,
    { method: "PATCH" },
  );
  return unwrapResponse(res);
}

export async function naviUpdateNode(
  domain: string,
  nodeId: string,
  json: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${NAVI_REGISTRY}/api/v1/sites/${domain}/nodes/${nodeId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: json,
    },
  );
  return unwrapResponse(res);
}
