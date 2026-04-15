---
name: browser-use
description: "Browser automation with OpenNavi. Navigates websites, extracts content, fills forms, takes screenshots. Uses OpenNavi for efficient revisits. TRIGGER when: user asks to visit a URL, scrape a page, interact with a website, or any browser automation task."
---

# Browser Automation

Use the `browser` and `client` tools to navigate websites, extract information, and interact with pages.

**Why site maps matter**: Site maps let you skip exploration on revisits. Without one, you navigate blindly every time. A clean, accurate map saves tokens and time — for you and every future agent visiting this site. Saving and maintaining site maps is not optional housekeeping — it is a core part of your job.

## Step 1: Check Site Map

When you `navigate` (or `open`) to a new domain, the browser automatically fetches the site map from the registry and inlines it in the response as:

```
siteMap: {
  record,      // existing site map, or omitted if none
  spec,        // spec.rules — storage rules you must follow in Step 3
  violations,  // list of rule violations in the existing record (empty array = compliant)
}
```

If no map exists or the registry is unreachable, `siteMap` is omitted entirely. Pass `skipSiteMap: true` to disable the auto-fetch.

If you need the rules/violations without navigating (e.g., before a first `save`), you can still call `query` directly:

```
client(command="query", url="https://example.com")
```

If a record exists, use it for navigation.

## Step 2: Browse

### Tab Isolation

Always open a dedicated tab and pass its `targetId` to every subsequent call. This prevents interference when multiple agents share the same browser.

```
browser(action="open", url="https://example.com")  → returns targetId (e.g. "tab-3")
browser(action="act", kind="click", ref="e6", targetId="tab-3")
browser(action="snapshot", targetId="tab-3")
browser(action="close", targetId="tab-3")           → closes only your tab
```

Omitting `targetId` defaults to the last-used tab — which may belong to another agent. **Always pass `targetId`.**

### Snapshot + Act Pattern

1. **Open + Navigate**: `browser(action="open", url="...")` → returns snapshot with element refs and your `targetId`
2. **Act**: `browser(action="act", kind="click", ref="e6", targetId="...")` → performs action + returns updated snapshot
3. Both open/navigate and act return a snapshot automatically — **no separate snapshot call needed**
4. Refs reset on each new snapshot — always use the latest refs

### All Actions

| Action | Purpose | Key Params |
|---|---|---|
| navigate | Go to URL | url, timeoutMs |
| snapshot | Get page content | maxChars, selector |
| act | Interact with element | kind, ref, text, key, ... |
| screenshot | Capture image | fullPage, ref, selector |
| tabs | List open tabs | — |
| open | New tab | url |
| close | Close tab/browser | targetId |
| console | Get console logs/errors | level, targetId |

### Act Kinds

| Kind | Purpose | Key Params |
|---|---|---|
| click | Click element | ref, doubleClick, button |
| type | Type into input | ref, text, submit, slowly |
| press | Press key | key, ref |
| hover | Hover element | ref |
| drag | Drag and drop | startRef, endRef |
| fill | Fill multiple fields | fields: [{ref, value}] |
| select | Select option | ref, values |
| wait | Wait for condition | text, textGone, url, loadState, timeMs |
| evaluate | Run JavaScript | fn |
| batch | Run multiple actions | actions: [{kind, ref, ...}], stopOnError |
| download | Click element and save downloaded file | ref, path |
| waitForDownload | Wait for next download (no click) | path, timeMs |
| scrollIntoView | Scroll element into viewport | ref |
| armDialog | Handle browser dialog (alert/confirm/prompt) | accept, promptText |
| responseBody | Capture API response by URL pattern | urlPattern |

### Tips

- **Form filling**: `browser(action="act", kind="fill", fields=[{ref: "e10", value: "John"}, ...])`
- **Large pages**: `browser(action="snapshot", selector=".main-content")`
- **JS extraction**: `browser(action="act", kind="evaluate", fn="document.title")`
- **Visual debugging**: `browser(action="snapshot", labels=true)` — overlays ref badges on a screenshot alongside the snapshot
- **Faster snapshots**: `browser(action="snapshot", interactive=true)` — returns only interactive elements (buttons, links, inputs)

### File Downloads

- **Always use `download` kind** to save files — never use `click` then check the Downloads folder.
  In CDP mode, `click` sends files to an inaccessible temp path.
- **`download`** clicks the element AND saves the file atomically:
  `browser(action="act", kind="download", ref="e5", path="/absolute/path/to/file.pdf")`
- **`waitForDownload`** is for downloads triggered indirectly (e.g., after form submission) — it waits without clicking.
- `path` must be an absolute path including the filename.

### Error Recovery

| Problem | Solution |
|---------|----------|
| Ref not found | DOM changed — take a new snapshot |
| Element not interactable | Dismiss overlay, or scroll into view |
| Navigation timeout | Page likely loaded — check the returned snapshot |
| Snapshot truncated | Use `selector` to scope a section, or set `interactive=true` |
| Blocked by bot protection | Wait 5s then retry, or stop and report |
| JS errors | Use `console` action to inspect logs |

## Step 3: Exit Sequence (MANDATORY)

After extracting the information you need, execute these three steps **in order**.

### 3a. Save or verify site map

Use `violations` from the Step 1 response to decide:

- **New site** (record was null): `save` with data conforming to `spec.rules`.
- **`violations` is non-empty**: rewrite the entire map to conform to `spec.rules`, then `save`. **Do NOT verify.**
- **`violations` is empty + no node changed**: `verify`.
- **`violations` is empty + single node changed**: `update-node`.

Follow `spec.rules` from the Step 1 response for all content rules. `nodes` must be an object keyed by kebab-case node ID.

**Site map shape (v0.4):**

```json
{
  "domain": "example.com",
  "overview": "SSR e-commerce. No auth for browsing. CAPTCHA on checkout. AJAX paginated results.",
  "nodes": {
    "home": {
      "url": "/",
      "kind": "dashboard",
      "summary": "Landing page with search and featured products",
      "transitions": [
        { "to": "search-results", "via": "submit search box" },
        { "to": "product-detail", "via": "click featured product" }
      ]
    },
    "product-detail": {
      "url": "/products/{id}",
      "kind": "detail",
      "summary": "Product page with images, price, variants, add-to-cart",
      "transitions": [
        { "to": "checkout", "via": "click Buy Now", "note": "triggers CAPTCHA" }
      ],
      "contains": {
        "variant-picker": {
          "kind": "form",
          "summary": "Size/color variant selector below main image",
          "transitions": [{ "to": ".variant-picker", "via": "select option" }]
        }
      }
    }
  }
}
```

Key rules:
- `kind` ∈ `list | detail | search | form | dashboard`
- `url` uses `{variable}` patterns for dynamic paths (e.g., `/products/{id}`, `/wiki/{ArticleName}`). Hardcoded specific URLs are a bug.
- `transitions[].via` is a **semantic action** (e.g., "click Buy Now", "submit search box"). Never use CSS selectors, element IDs, or JS function names.
- `transitions[].to` is a node ID. Inside `contains`, use `.name` to reference a sibling sub-node. Top-level IDs are plain (`product-detail`).
- `transitions[].note` (optional) captures non-obvious behavior: "AJAX, URL unchanged", "opens new window", "triggers CAPTCHA".
- `contains` holds in-page sub-states (modals, tabs, wizard steps, filter panels). They share the parent URL. Depth 1 only.

**Summary rules** — describe what the node IS and what you can DO, never what it CONTAINS:

| ✅ Good | ❌ Bad |
|---------|--------|
| `"Turing Award recipients table, filterable by year"` | `"2025 winners: Bennett & Brassard for quantum computing"` |
| `"Person bio page with education, career, awards sections"` | `"PhD from Harvard, works at IBM, won Nobel Prize"` |
| `"Package detail with readme, version history, dependency tabs"` | `"v4.3.6, 130M weekly downloads, 0 dependencies"` |

Summaries must be **reusable across visits** — if the data on the page changes, the summary should still be accurate. Factual content (names, numbers, dates, answers) belongs in the agent's response, not in the map.

```
client(command="save", domain="example.com", json="{\"overview\":\"...\",\"nodes\":{\"product-detail\":{\"url\":\"/products/{id}\",\"kind\":\"detail\",\"summary\":\"...\",\"transitions\":[{\"to\":\"home\",\"via\":\"click logo\"}]}}}")
client(command="verify", domain="example.com")
client(command="update-node", domain="example.com", nodeId="product-detail", json="{\"url\":\"/products/{id}\",\"kind\":\"detail\",\"summary\":\"...\",\"transitions\":[]}")
```

### 3b. Close browser

```
browser(action="close")
```

### 3c. Report results

Include `[site-map: saved]` or `[site-map: verified]` at the end of the response.

---

**REMINDER: Always end with `[site-map: saved]` or `[site-map: verified]`.**
