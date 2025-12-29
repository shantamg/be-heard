# Implementation Plans

Executable implementation plans for building Meet Without Fear. These plans reference the [MVP Planning Docs](../docs/mvp-planning/plans/index.md) as the source of truth.

## Structure

```
implementation/
  shared/      # Shared types and contracts (build first)
  backend/     # API, database, business logic
  mobile/      # React Native app
```

Each directory has an `index.md` listing plans in execution order with dependencies.

## How to Use

### Manual Execution
1. Start with `shared/index.md` - build shared types first
2. Then work on `backend/` and `mobile/` in parallel
3. Each plan file lists prerequisites and verification steps

### With Claude Flow
Claude Flow can auto-parallelize based on declared dependencies:

```bash
claude-flow run --optimize-parallelism
```

This analyzes prerequisites in each plan and executes independent work in parallel.

## Plan File Format

Each plan follows this structure:

```markdown
# [Feature Name]

## Source Documentation
- Links to docs/mvp-planning/plans/ files (source of truth)

## Prerequisites
- [ ] What must be complete before starting

## External Services Required
> **User action needed:** Step-by-step setup instructions
> - What to configure
> - Environment variables to add

## Implementation Steps
1. Write test for X
2. Implement X
3. Write test for Y
4. Implement Y
...

## Verification
- [ ] `npm run test` passes
- [ ] `npm run check` passes
- [ ] Manual verification steps
```

## Parallel Workstreams

Backend and mobile can be built simultaneously once shared types are in place:

```
shared/session-types.md  ─┬─> backend/auth.md ──> backend/stage-0-api.md ──> ...
                          │
                          └─> mobile/auth-flow.md ──> mobile/stage-0-ui.md ──> ...
```

Use git worktrees for independent commit/test cycles:
```bash
git worktree add ../meetwithoutfear-backend -b backend-implementation
git worktree add ../meetwithoutfear-mobile -b mobile-implementation
```
