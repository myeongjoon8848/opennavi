# opennavi

OpenNavi plugin for Claude Code — 브라우저 자동화 MCP 서버, browser-use 스킬, OpenNavi 레지스트리 클라이언트.

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **Protocol**: MCP SDK (`@modelcontextprotocol/sdk`)
- **Browser**: Playwright (`playwright-core`)
- **Validation**: Zod

## Directory Structure

```
claude-code/
├── src/              # MCP 서버 소스 (TypeScript)
├── dist/             # 빌드 결과물
├── bin/opennavi      # CLI 엔트리포인트
├── skills/
│   └── browser-use/  # browser-use 스킬 (SKILL.md)
├── .claude-plugin/
│   └── plugin.json   # 플러그인 메타데이터 (버전 관리)
├── .mcp.json         # MCP 서버 설정
├── package.json
└── tsconfig.json
```

## Development

```bash
cd claude-code
npm install
npm run build      # TypeScript 빌드
npm start          # MCP 서버 실행
```

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
/plugin marketplace update opennavi
```

Then restart the session.
