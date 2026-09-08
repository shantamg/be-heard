# Stage 04: Implement Fix

## Input

- Fix plan from Stage 03 (files, changes, branch name, test strategy)
- Issue number and title

## Process

### 1. Create branch

```bash
git checkout -b <branch-name>
```

Branch naming comes from Stage 03 plan. See `references/branch-naming.md`.

### 2. Implement the fix

Follow `CLAUDE.md` architecture principles. Key rules:
- **Minimal, focused changes** -- fix the bug, nothing more
- Keep functions small with clear separation of concerns
- Use types from `shared/` for type safety
- No `StyleSheet.create` in mobile code (use NativeWind `className`)
- No `db:push` -- always `prisma migrate dev` for schema changes

### 3. Write tests (TDD when possible)

Write tests **covering the fix** -- not just that it works, but that the original bug is prevented. See `references/test-patterns.md` for jest mock patterns (backend) and jest-expo patterns (mobile).

### 4. Commit changes

Write a descriptive commit message:
```
fix(<area>): <what was fixed>

<why it was broken and what the fix does>

Related to #<issue-number>
```

**Note**: Always use `Related to #<issue-number>` (never `Fixes #N`) in both the commit message and the PR body — all issues stay open for human verification.

## Output

- Code changes committed on the feature branch
- Tests written covering the fix
- Ready for verification in Stage 05

## Completion

Proceed to `stages/05-verify/` to run tests and type checks.
