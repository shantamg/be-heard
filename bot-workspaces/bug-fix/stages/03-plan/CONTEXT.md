# Stage 03: Plan Fix

## Input

- Root cause analysis from Stage 02 (summary, affected files, evidence, severity)
- Issue number, title, and labels

## Process

### 1. Read affected source files

Read each file identified in the root cause analysis. Understand:
- Current implementation and its intent
- Existing test coverage
- Related files that might need coordinated changes

### 2. Read architecture docs for affected area

Check `CLAUDE.md` docs routing table. Load only the docs relevant to the fix area. This provides:
- Coding conventions and patterns
- Architecture constraints
- Test patterns for the area

### 3. Design the fix

- Identify **minimal, focused changes** -- avoid scope creep
- List specific files to modify with the nature of each change
- Note test files that need updates or creation
- Consider edge cases and regression risks
- Determine if database migration is needed (if so, use `prisma migrate dev`, NEVER `db:push`)

### 4. Determine branch name

| Issue label | Branch format |
|---|---|
| `bug` | `fix/<short-description>-<issue-number>` |
| `security` | `fix/security-<short-description>-<issue-number>` |
| `bot-pr` | `feat/<short-description>-<issue-number>` |

### 5. Check WIP registry

Check `[ACTIVE WORK-IN-PROGRESS]` for overlapping work. Skip if another agent is already working on the same issue or the same files.

### 6. Complexity check

| Complexity | Criteria | Action |
|---|---|---|
| Simple | 1-2 files, <30 lines changed | Proceed |
| Moderate | 3-5 files, <100 lines changed | Proceed with care |
| Complex | >5 files or >100 lines or schema change | Consider escalating; proceed only if confident |

## Output

Fix plan (passed to Stage 04):
- **Files to modify**: Path and description of change for each
- **New files to create**: Test files, migration files
- **Branch name**: Following the naming convention above
- **Complexity**: Simple / moderate / complex
- **Test strategy**: What to test, which test framework (jest (backend) vs jest-expo (mobile))

## Exit Criteria

- Clear, actionable plan with specific files and changes identified
- Escalate if: fix is ambiguous, touches too many areas, or requires architectural decisions

## Completion

Proceed to `stages/04-implement/` with the fix plan.
