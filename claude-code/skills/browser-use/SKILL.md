---
name: browser-use
description: "Browser automation with ASM (Agent Site Map). Navigates websites, extracts content, fills forms, takes screenshots. Uses ASM for efficient revisits. TRIGGER when: user asks to visit a URL, scrape a page, interact with a website, or any browser automation task."
---

# Browser Automation

Use the `browser` and `client` tools to navigate websites, extract information, and interact with pages.

**Why site maps matter**: Site maps let you skip exploration on revisits. Without one, you navigate blindly every time. A clean, accurate map saves tokens and time — for you and every future agent visiting this site. Saving and maintaining site maps is not optional housekeeping — it is a core part of your job.

## Step 1: Check Site Map

Before browsing, always check if there is a saved site map:

```
client(command="query", url="https://example.com")
```

The response contains:
- `spec.rules` — **storage rules you must follow** when saving/updating (Step 3)
- `violations` — list of rule violations in the existing record (empty array = compliant)
- `record` — existing site map, or `null` if none

If a record exists, use it for navigation.

## Step 2: Browse

### Snapshot + Act Pattern

1. **Navigate**: `browser(action="navigate", url="...")` → returns snapshot with element refs
2. **Act**: `browser(action="act", kind="click", ref="e6")` → performs action + returns updated snapshot
3. Both navigate and act return a snapshot automatically — **no separate snapshot call needed**
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

### Tips

- **Form filling**: `browser(action="act", kind="fill", fields=[{ref: "e10", value: "John"}, ...])`
- **Large pages**: `browser(action="snapshot", selector=".main-content")`
- **JS extraction**: `browser(action="act", kind="evaluate", fn="document.title")`
- **Visual debugging**: `browser(action="snapshot", labels=true)` — overlays ref badges on a screenshot alongside the snapshot
- **Faster snapshots**: `browser(action="snapshot", interactive=true)` — returns only interactive elements (buttons, links, inputs)

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
- **`violations` is empty + no page changed**: `verify`.
- **`violations` is empty + single page changed**: `update-page`.

**Writing rules** (see `spec.rules` for full details):
- **description**: what the page IS + what you can DO (search, filter, paginate). Not what it CONTAINS (no field names, response shapes, counts).
- **linksTo**: required for every page. Use `[]` if no links. This builds the navigation graph.
- Same URL with different params = separate pages (e.g. `/board?type=5` and `/board?type=6`).

```
client(command="save", domain="example.com", json="{...}")
client(command="verify", domain="example.com")
client(command="update-page", domain="example.com", pageId="product-list", json="{...}")
```

### 3b. Close browser

```
browser(action="close")
```

### 3c. Report results

Include `[site-map: saved]` or `[site-map: verified]` at the end of the response.

---

**REMINDER: Always end with `[site-map: saved]` or `[site-map: verified]`.**
