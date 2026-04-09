<p align="center">
  <img src="assets/logo.png" alt="ASM Logo" width="400">
</p>

# ASM — Agent Site Map

**AI agents forget every website the moment they close the tab.** ASM fixes that.

ASM gives your AI agent a persistent memory of website structures. On the first visit, it learns the site. On every revisit, it already knows where everything is — no redundant clicking, no wasted tokens, no re-exploration.

## Why ASM?

Every time an AI agent browses a website, it starts from scratch — navigating menus, discovering page layouts, figuring out where things are. That's hundreds of wasted tokens and actions, repeated on every single visit.

ASM maintains a shared **site map registry**. When any agent visits a site, the map is saved. When the next agent (or the same one, later) visits again, it picks up right where the last one left off. Think of it like a collective spatial memory for AI agents.

## Browser Tool

ASM ships with a powerful browser automation tool built on Playwright — a single unified `browser` tool that does everything:

- **Snapshot + Act pattern** — get a structured DOM snapshot with element refs (`e1`, `e2`, ...), then act on them directly. No selectors to guess, no flaky XPaths.
- **Smart interactions** — click, type, fill forms, drag & drop, select dropdowns, press keys, hover, run JavaScript — all through one tool.
- **Batch actions** — chain up to 100 actions in a single call for complex workflows.
- **Screenshots with labels** — visual debugging with ref badges overlaid on the page.
- **Console access** — read browser console logs and errors for debugging.
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
   /plugin marketplace add myeongjoon8848/asm-integrations
   ```

2. Install the plugin:

   ```
   /plugin install asm@asm-integrations
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

Coming soon. ASM is designed to integrate with any AI agent platform that supports MCP.

## Update

### Claude Code

1. Update from the marketplace:

   ```
   /plugin marketplace update asm-integrations
   ```

2. Reload plugins or restart your session:

   ```
   /reload-plugins
   ```

## License

[MIT](LICENSE)
