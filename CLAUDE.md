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

## Release Notes

- Language: English only
- Tone: neutral, factual — describe what changed, not who did it or why it matters
  - Good: "Navigations triggered by clicks are now validated against SSRF policy."
  - Bad: "We hardened security patterns." / "보안을 강화했습니다."
- Structure: `## What's New` → category sections (`### 🔒 Security`, `### 🛠 Robustness`, `### ✨ Features`, `### 🐛 Bug Fixes`) → bullet list with **bold label** and em-dash description
- Never mention reference codebases by name — describe what the change does, not where it came from
- Title format: `vX.Y.Z — Short Summary` (under 60 chars)

## Plugin Update

After pushing changes with a version bump:

```
/plugin marketplace update opennavi
```

Then restart the session.

## Playwright 패치 (`claude-code/scripts/patch-playwright.mjs`)

`playwright-core@1.59.1`은 `connectOverCDP` 핸드셰이크 중 `Browser.setDownloadBehavior`를 `.catch()` 없이 호출한다. Chrome 147+는 이 명령을 거부하므로 모든 CDP 연결이 실패한다 (issue #7 참고).

임시 방편으로 `postinstall` 훅이 `node_modules/playwright-core/lib/server/chromium/crBrowser.js`에 한 줄(`.catch(() => {})`)을 추가한다. 스크립트는 idempotent이고, 이미 패치됐거나 파일 구조가 바뀌었으면 no-op.

**playwright-core 버전을 올릴 때 반드시 확인할 것:**

1. 새 버전의 `lib/server/chromium/crBrowser.js`에서 `Browser.setDownloadBehavior` 호출에 이미 `.catch(() => {})`가 있으면 → **패치 스크립트와 `postinstall` 훅을 삭제**하고 CLAUDE.md의 이 섹션도 지운다.
2. 아직 없으면 → `patch-playwright.mjs`의 `NEEDLE` 문자열이 새 버전 포맷과 일치하는지 확인. 불일치하면 스크립트는 경고만 찍고 skip하므로 **버그가 조용히 돌아올 수 있다**.

확인 방법:
```bash
cd claude-code
grep -A 6 "Browser.setDownloadBehavior" node_modules/playwright-core/lib/server/chromium/crBrowser.js
```

**패치가 적용되지 않은 환경**: 마켓플레이스 install이 `npm install --ignore-scripts`로 의존성을 가져오는 경우 등에서 postinstall 훅이 실행되지 않아 패치가 빠진다. 이때 `connectOverCDP`가 `Browser context management is not supported`로 실패하는데, `connectBrowserInternal`이 이를 잡아서 사용자에게 "Chrome 종료 후 재시도" 안내 메시지로 변환한다 (`session.ts`의 catch 분기). 사용자가 Chrome을 종료하면 플러그인이 격리된 `--user-data-dir`로 자동 launch하여 우회한다.
