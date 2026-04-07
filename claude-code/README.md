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
- **browser-agent** — subagent for delegated browsing tasks
- **ASM CLI** (`bin/asm`) — query, save, update, and verify site maps via ASM Registry

## Usage

### Direct (from main agent)

```
browser(action="navigate", url="https://example.com")
browser(action="act", kind="click", ref="e6")
```

### Via subagent

```
Agent(subagent_type="browser-agent", prompt="https://example.com 에서 제목을 가져와줘")
```
