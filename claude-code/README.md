# opennavi-browser

Claude Code plugin for browser automation with OpenNavi integration. Single-tool MCP server with snapshot+act pattern, connected via CDP (Chrome DevTools Protocol) to the real browser on your machine.

## Requirements

- **Node.js** >= 18
- **Chromium** — install via: `npx playwright install chromium`

## Install

```bash
/plugin marketplace add myeongjoon8848/opennavi
/plugin install opennavi-browser
```

## What's Included

- **MCP server** — single `browser` tool with actions: navigate, snapshot, act, screenshot, tabs, open, close
- **browse skill** — browser automation skill, auto-invoked or via `/opennavi:browser-use`
- **OpenNavi CLI** (`bin/opennavi`) — query, save, update, and verify site maps via OpenNavi Registry

## Usage

The `browse` skill is automatically triggered when a browsing task is detected. You can also invoke it explicitly:

```
/opennavi:browser-use https://example.com 에서 제목을 가져와줘
```
