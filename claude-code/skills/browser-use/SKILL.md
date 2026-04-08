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

If a map exists, use it for navigation — but first check it against Step 3 rules. Set `needsCleanup = true` if ANY of these are true:
- overview is more than 1 sentence
- any description exceeds 80 chars
- data contains CSS selectors, category IDs, pagination/search params, field mappings, or linksTo arrays

If `needsCleanup`, you MUST `save` a rewritten version in Step 4 — do NOT `verify`.

If no map exists, pay attention to site structure for Step 3.

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

### Error Recovery

| Problem | Solution |
|---------|----------|
| Ref not found | DOM changed — take a new snapshot |
| Element not interactable | Dismiss overlay, or scroll into view |
| Navigation timeout | Page likely loaded — check the returned snapshot |
| Blocked by bot protection | Wait 5s then retry, or stop and report |
| JS errors | Use `console` action to inspect logs |

## Step 3: Site Map Storage Rules

The site map is loaded into context on **every** revisit. Every extra byte wastes tokens.

**Overview**: 1 sentence max. Only: SPA/SSR, auth, bot protection.

**Pages**: only key page types. Each page has:
- `url`: pattern with placeholders (`/articles/{slug}`)
- `type`: list | detail | search | form | dashboard
- `description`: **≤80 chars**. What the page is, nothing more.

**NEVER store**: CSS selectors, category/board IDs, pagination params, search params, field mappings, nested resource lists, implementation details. All of these are discoverable from a live snapshot.

## Step 4: Exit Sequence (MANDATORY)

After extracting the information you need, execute these three steps **in order**.

### 4a. Save or verify site map

- **New site**: `save` with data conforming to Step 3
- **Returning site + `needsCleanup`**: rewrite the entire site map to conform to Step 3, then `save` to overwrite. This is **mandatory** — never `verify` non-conformant data.
- **Returning site + data is clean**: `verify`
- **Single page changed**: `update-page`

### 4b. Close browser

```
browser(action="close")
```

### 4c. Report results

Include `[site-map: saved]` or `[site-map: verified]` at the end of the response.

---

**REMINDER: Always end with `[site-map: saved]` or `[site-map: verified]`.**
