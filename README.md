<p align="center">
  <img src="assets/logo.png" alt="OpenNavi Logo" width="100%">
</p>

# OpenNavi

**AI agents forget every website the moment they close the tab.** OpenNavi fixes that.

OpenNavi gives your AI agent a persistent memory of website structures. On the first visit, it learns the site. On every revisit, it already knows where everything is — no redundant clicking, no wasted tokens, no re-exploration.

## Why OpenNavi?

Every time an AI agent browses a website, it starts from scratch — navigating menus, discovering page layouts, figuring out where things are. That's hundreds of wasted tokens and actions, repeated on every single visit.

OpenNavi maintains a shared **site map registry**. When any agent visits a site, the map is saved. When the next agent (or the same one, later) visits again, it picks up right where the last one left off. Think of it like a collective spatial memory for AI agents.

## 🚀 Token Savings

**With an OpenNavi map, agents use 50%+ fewer tokens on deep browsing tasks.**

For any task that requires navigating 4 or more levels deep into a site, agents with an OpenNavi map cut token consumption by **more than half** compared to agents exploring from scratch. And here's the best part:

> **The more complex the task, the bigger the savings.**

Token efficiency scales with task complexity. A quick 2-click lookup might save you 20%. A multi-step workflow that crawls deep into a dashboard, filters results, and extracts structured data? That's where OpenNavi really shines — savings climb well past 50%, and keep growing as tasks get harder.

Why? Because exploration cost is non-linear. Every wasted click cascades into more DOM snapshots, more reasoning, more retries. OpenNavi skips the exploration entirely and goes straight to the destination.

## Browser Tool

OpenNavi ships with a powerful browser automation tool built on [Playwright](https://playwright.dev/) — a single unified `browser` tool that does everything:

- **CDP-only architecture** — connects to Chrome/Chromium via the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/). No bundled browser, no WebDriver — just a direct CDP connection to the real browser on your machine. This means you get your existing cookies, sessions, and extensions out of the box.
- **Snapshot + Act pattern** — get a structured DOM snapshot with element refs (`e1`, `e2`, ...), then act on them directly. No selectors to guess, no flaky XPaths.
- **Smart interactions** — click, type, fill forms, drag & drop, select dropdowns, press keys, hover, run JavaScript — all through one tool.
- **Batch actions** — chain up to 100 actions in a single call for complex workflows.
- **Screenshots with labels** — visual debugging with ref badges overlaid on the page.
- **Console & network access** — read browser console logs, errors, and network requests for debugging.
- **Multi-tab support** — open, switch, and manage multiple tabs.
- **SPA-aware** — handles single-page app navigation and route changes gracefully.

The `browser-use` skill is auto-triggered when a browsing task is detected — just ask your agent to visit a URL and it handles the rest.

## Installation

### Claude Code

**Prerequisites**

- Node.js >= 18

**Steps**

1. Add the marketplace:

   ```
   /plugin marketplace add myeongjoon8848/opennavi
   ```

2. Install the plugin:

   ```
   /plugin install opennavi@opennavi
   ```

3. Install Chromium for browser automation:

   ```bash
   npx playwright install chromium
   ```

4. Reload plugins or restart your session:

   ```
   /reload-plugins
   ```

You're ready to go — just ask Claude to browse any website.

### Other Platforms

Coming soon. OpenNavi is designed to integrate with any AI agent platform that supports MCP.

## Update

### Claude Code

1. Update from the marketplace:

   ```
   /plugin marketplace update opennavi
   ```

2. Reload plugins or restart your session:

   ```
   /reload-plugins
   ```

## License

[MIT](LICENSE)
