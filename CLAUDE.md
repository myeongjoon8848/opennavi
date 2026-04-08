# asm-integrations

ASM (Agent Site Map) plugin for Claude Code — browser automation MCP server, browser-use skill, and ASM registry client.

## Versioning (`claude-code/.claude-plugin/plugin.json`)

| Bump | When |
|------|------|
| **Major** (X.0.0) | Breaking changes — removing actions/params, changing response structure |
| **Minor** (0.X.0) | New features — new actions, new params, new act kinds |
| **Patch** (0.0.X) | Bug fixes, prompt/skill text changes, error message improvements |

Always bump version as a separate commit after the feature/fix commit.

## Plugin Update

After pushing changes with a version bump:

```
/plugin marketplace update asm-integrations
```

Then restart the session.
