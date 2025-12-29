# Implementation Structure Design

Date: 2025-12-26

## Overview

This document captures the design decisions for transitioning from planning to building the Meet Without Fear app. It establishes development practices, implementation plan structure, and parallel execution strategy using Claude Flow.

## Decisions Made

### 1. Development Practices (CLAUDE.md)

- **Test-Driven Development**: Write tests first, then implementation
- **Shared types**: All DTOs and contracts live in `shared/`
- **Small, testable functions**: Each function does one thing
- **Logic separate from views**: Mobile uses hooks/services for logic, components for UI
- **Verification before completion**: Run `npm run check` and `npm run test`
- **Git workflow**: Commit and push often, small focused commits

### 2. Implementation Plans Location

**Decision**: `implementation/` at repo root

Structure:
```
implementation/
  README.md                    # How to use plans + Claude Flow instructions
  shared/
    index.md                   # Dependencies and order
    session-types.md
    api-contracts.md
    ...
  backend/
    index.md
    auth.md
    database.md
    stage-0-api.md
    ...
  mobile/
    index.md
    auth-flow.md
    navigation.md
    stage-0-ui.md
    ...
```

### 3. Plan File Format

Implementation plans **reference** existing planning docs (source of truth) rather than duplicating content.

Template:
```markdown
# [Feature Name]

## Source Documentation
- Links to relevant docs/mvp-planning/plans/ files

## Prerequisites
- [ ] What must be complete before starting

## External Services Required
> **User action needed:** Setup instructions here

## Implementation Steps
1. Test-first steps referencing the planning docs

## Verification
- [ ] `npm run test` passes
- [ ] `npm run check` passes
- [ ] Manual verification steps
```

### 4. Claude Flow Orchestration

**Decision**: Let Claude Flow auto-detect dependencies and parallelize

- Structure plans with clear dependencies in `index.md` files
- Use `--optimize-parallelism` flag for automatic parallel execution
- No complex yaml configuration needed
- Claude Flow reads prerequisites from plan files and builds dependency graph

## Related Documents

- [MVP Planning Index](../mvp-planning/plans/index.md)
- [Backend Architecture](../mvp-planning/plans/backend/overview/architecture.md)
- [Stage Overview](../mvp-planning/plans/stages/index.md)
