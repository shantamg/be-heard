# Stage: Scan

## Input

- `docs/architecture/system-overview.md` — canonical architecture
- `docs/architecture/services.md` — service conventions
- `docs/architecture/data-model.md` — data model conventions
- `CLAUDE.md` — architecture principles
- Optional focus area from issue body. Default: full audit.

## Process

Launch specialist agents in parallel batches:

### Batch 1

1. **Service Architecture** — verify all Hono services follow thin-controller/service-layer pattern. Check for unauthorized new services, direct cross-service imports (should use events), and business logic in route handlers.
2. **Shared Types & Interfaces** — verify frontend/backend type sharing via `shared/`. Check for duplicated types, divergent interfaces, or types defined locally that belong in shared.
3. **Database & Schema** — verify Prisma schema conventions, migration hygiene (no `db:push` artifacts), and data model alignment with `data-model.md`.

### Batch 2

4. **Frontend Patterns** — verify MVC-aligned components, NativeWind usage (no `StyleSheet.create`), business logic in hooks/services not components. Check web and mobile share prop interfaces.
5. **Infrastructure & Config** — verify deployment config matches documented architecture (Render gateway, Vercel workbench, EAS mobile). Check for undocumented services, env vars, or infrastructure.
6. **Recent Drift Detection** — review last 100 commits for architectural exceptions, new patterns, or convention-breaking changes not reflected in docs.

## Output

Raw findings from each agent with: domain, finding, severity, file locations, and recommended remediation.

## Completion

Proceed to `stages/02-report/` with all agent findings.
