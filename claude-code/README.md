# asm-browser

Claude Code plugin for browser automation with ASM (Agent Site Map) integration. Single-tool MCP server with snapshot+act pattern.

## Requirements

- **Node.js** >= 18
- **Chromium** — install via: `npx playwright install chromium`

## Install

```bash
/plugin marketplace add myeongjoon8848/asm-integrations
/plugin install asm-browser
```

## What's Included

- **MCP server** — single `browser` tool with actions: navigate, snapshot, act, screenshot, tabs, open, close
- **browse skill** — browser automation skill, auto-invoked or via `/asm-browser:browse`
- **ASM CLI** (`bin/asm`) — query, save, update, and verify site maps via ASM Registry

## Usage

The `browse` skill is automatically triggered when a browsing task is detected. You can also invoke it explicitly:

```
/asm-browser:browse https://example.com 에서 제목을 가져와줘
```
