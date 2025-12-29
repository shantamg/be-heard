# Meet Without Fear Development

## Development Practices

### Test-Driven Development

- Write tests first, then implementation
- Run `npm run test` in the relevant workspace before considering work complete
- Run `npm run check` to verify types before committing

### Code Organization

- **Shared types in `shared/`** - All DTOs, contracts, and cross-workspace types
- **Small, testable functions** - Each function does one thing
- **Logic separate from views** - Mobile: hooks/services for logic, components for UI
- **Reusable code** - Extract common patterns to shared or workspace-level utilities

### Verification Before Completion

Always run before considering a task done:

```bash
npm run check   # Type checking across all workspaces
npm run test    # Tests across all workspaces
```

### Git Workflow

- Commit and push often (small, focused commits)
- Each commit should pass check and test

## Project Structure

- `shared/` - Types, DTOs, contracts shared between backend and mobile
- `backend/` - Express API, Prisma, business logic
- `mobile/` - Expo React Native app
- `implementation/` - Executable implementation plans (not deployed)
- `docs/mvp-planning/` - Planning docs (deployed to docs site)
