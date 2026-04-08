---
name: browser-use
description: "Browser automation with ASM (Agent Site Map). Navigates websites, extracts content, fills forms, takes screenshots. Uses ASM for efficient revisits. TRIGGER when: user asks to visit a URL, scrape a page, interact with a website, or any browser automation task."
---

# Browser Automation

Use the `browser` and `client` tools to navigate websites, extract information, and interact with pages.

## Step 1: Check Site Map

Before browsing, always check if there is a saved site map:

```
client(command="query", url="https://example.com")
```

If a map exists, use `overview` for site-level context, and each page's `description` for selectors, URL patterns, and tips. If no map exists (empty response), pay extra attention to site structure (see Step 3).

## Step 2: Browse

### Snapshot + Act Pattern

1. **Navigate**: `browser(action="navigate", url="...")` → returns snapshot with element refs
2. **Act**: `browser(action="act", kind="click", ref="e6")` → performs action + returns updated snapshot
3. Both navigate and act return a snapshot automatically — **no separate snapshot call needed**
4. Refs reset on each new snapshot — always use the latest refs

### All Actions

| Action | Purpose | Key Params |
|---|---|---|
| navigate | Go to URL | url |
| snapshot | Get page content | maxChars, selector |
| act | Interact with element | kind, ref, text, key, ... |
| screenshot | Capture image | fullPage, ref, selector |
| tabs | List open tabs | — |
| open | New tab | url |
| close | Close tab/browser | targetId |

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
| wait | Wait for condition | text, textGone, url, timeMs |
| evaluate | Run JavaScript | fn |

### Tips

- **Form filling**: `browser(action="act", kind="fill", fields=[{ref: "e10", value: "John"}, ...])`
- **Large pages**: `browser(action="snapshot", selector=".main-content")`
- **JS extraction**: `browser(action="act", kind="evaluate", fn="document.title")`

### Error Recovery

| Problem | Solution |
|---------|----------|
| Ref not found | DOM changed — take a new snapshot |
| Element not interactable | Dismiss overlay, or hover to scroll into view |
| Navigation timeout | Take a screenshot to diagnose |
| Blocked by bot protection | Wait 5s then retry, or stop and report the issue |

## Step 3: Observe Site Structure (New Sites Only)

If the site map was empty, observe during browsing — you'll need this for Step 4a.

**Keep it minimal.** The site map is loaded into context on every revisit, so only store what saves meaningful browsing time. Details discoverable from a single snapshot (e.g., form fields, pagination params, board category IDs) should NOT be stored.

**Store only:**
1. **Overview** (1-2 sentences): SPA/SSR, auth required?, bot protection?
2. **Page entries** — for each key page type, store only:
   - `url`: URL pattern with placeholders (e.g., `/articles/{slug}`)
   - `type`: list, detail, search, form, dashboard
   - `description`: one line — the CSS selector for main content extraction, if not obvious

**Do NOT store:** navigation graphs, search parameters, field mappings, pagination details, or anything that can be inferred from a live snapshot.

## Step 4: Exit Sequence (MANDATORY)

After extracting the information you need, execute these three steps **in order**.

### 4a. Save or verify site map

- **New site**: `client(command="save", domain="example.com", json='{"overview": "...", "pages": {...}}')`
- **Returning site (accurate)**: `client(command="verify", domain="example.com")`
- **Returning site (inaccurate)**: use `save` to overwrite
- **Single page changed**: `client(command="update-page", domain="example.com", pageId="search", json='...')`

### 4b. Close browser

```
browser(action="close")
```

### 4c. Report results

Include `[site-map: saved]` or `[site-map: verified]` at the end of the response.

---

**REMINDER: Always end with `[site-map: saved]` or `[site-map: verified]`.**
