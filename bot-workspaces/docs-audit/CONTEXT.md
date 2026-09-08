# Docs Audit — Workspace Context

## Purpose

Detect documentation drift by comparing docs against code. Two modes: incremental (git-aware, fast) and full (brute-force, thorough).

## Stage Pointers

- `stages/incremental/CONTEXT.md` — Git-history-aware targeted audit
- `stages/full/CONTEXT.md` — Complete brute-force audit of all living docs

## Shared Resources Used

- `shared/slack/slack-post.md` — Summary to #agentic-devs
- `shared/skills/pr.md` — PR for doc updates

## Code-to-Doc Mapping

Authoritative mapping lives in `docs/code-to-docs-mapping.json` (the `docs-impact`
GitHub Action uses it) — consult it first. Quick reference:

| Code area | Docs to check |
|---|---|
| `backend/src/controllers/`, `backend/src/routes/` | `docs/backend/api/index.md`, `docs/architecture/backend-overview.md` |
| `backend/src/services/` (AI / prompting / reconciler) | `docs/backend/prompting-architecture.md`, `docs/backend/reconciler-flow.md` |
| `backend/prisma/schema.prisma` | `docs/backend/data-model/prisma-schema.md` |
| `backend/src/**` (security / RLS) | `docs/backend/security/index.md` |
| `mobile/` | `docs/architecture/structure.md`, `docs/mobile/wireframes/` |
| `shared/` | Any doc referencing shared types / DTOs |
| Ably / Clerk / Bedrock / Mixpanel integration | `docs/architecture/integrations.md` |
| `render.yaml`, `.github/workflows/`, deploy scripts | `docs/deployment/`, `docs/infrastructure/` |
