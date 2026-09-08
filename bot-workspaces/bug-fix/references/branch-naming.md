# Branch and PR Naming Conventions

## Branch Format

| Issue Label | Branch Pattern | Example |
|---|---|---|
| `bug` | `fix/<short-description>-<issue-number>` | `fix/stage4-transition-copy-633` |
| `security` | `fix/security-<short-description>-<issue-number>` | `fix/security-ws-token-in-url-620` |
| `bot-pr` | `feat/<short-description>-<issue-number>` | `feat/analytics-opt-out-toggle-617` |

## PR Title Format

| Issue Label | Title Pattern | Example |
|---|---|---|
| `bug` | `fix(<area>): <description> (#<issue-number>)` | `fix(stage4): warmer transition copy + single CTA (#633)` |
| `security` | `fix(security): <description> (#<issue-number>)` | `fix(security): move WebSocket auth token out of URL (#620)` |
| `bot-pr` | `feat(<area>): <description> (#<issue-number>)` | `feat(mobile): make analytics opt-out toggle functional (#617)` |

## Area Names

MWF is an **npm-workspaces monorepo** (`backend/`, `mobile/`, `shared/`, `website/`).
Use the workspace, or the controller/service area within the backend:

| Code Location | Area |
|---|---|
| `backend/src/controllers/` | controller name, e.g. `auth`, `sessions` |
| `backend/src/services/empathy-*`, `reconciler*` | `empathy` / `reconciler` |
| `backend/src/services/ai*`, `chat-router/` | `ai` / `chat` |
| `backend/src/services/push.ts`, `notifications*` | `push` |
| `backend/src/services/context-*` | `context` |
| `backend/src/routes/` | `api` (or the route area) |
| `backend/prisma/` | `data` (schema / migrations) |
| `mobile/` | `mobile` |
| `shared/` | `shared` |
| `website/` | `website` |
| Cross-cutting | `core` |

## Short Description Rules

- Use lowercase kebab-case: `stage4-transition-copy`, not `Stage4_Transition_Copy`
- Max 4-5 words: `ws-token-in-url`, not `fix-the-issue-where-the-websocket-token-leaks-in-the-url`
- Describe the fix, not the symptom: `move-token-to-header` not `websocket-broken`
