# Bug Fix -- Workspace Context

## Purpose

End-to-end bug fixing: from issue selection through investigation, implementation, verification, to PR creation. Handles `bug`, `security`, and `bot-pr` labeled GitHub issues.

## Stage Pointers

- `stages/01-select/CONTEXT.md` -- Issue selection, filtering, and sub-agent orchestration
- `stages/02-investigate/CONTEXT.md` -- Parallel diagnostics and root cause analysis
- `stages/03-plan/CONTEXT.md` -- Fix design, file identification, branch naming
- `stages/04-implement/CONTEXT.md` -- Code changes and tests in worktree
- `stages/05-verify/CONTEXT.md` -- Test execution, type checking, branch push
- `stages/06-pr/CONTEXT.md` -- PR creation, label management, WIP cleanup

## Workspace References

- `references/branch-naming.md` -- Branch and PR title conventions by issue label
- `references/test-patterns.md` -- Backend (jest) and mobile (jest-expo) test patterns
- `references/pr-conventions.md` -- PR body format, reviewer requirements, issue linking

## Shared Resources Used

- `shared/references/credentials.md` -- DB/API access for investigation
- `shared/diagnostics/*` -- Sentry, DB, Mixpanel, Render logs, pipeline health
- `shared/skills/pr.md` -- PR creation workflow
- `shared/references/github-ops.md` -- Issue/PR patterns, duplicate checks

## Key Conventions

- Each fix runs in an isolated worktree (`isolation: "worktree"`)
- Max 3 concurrent sub-agents per batch
- WIP registry: register in Stage 04, deregister in Stage 06
- Stage 01 is the orchestrator; Stages 02-06 run per issue in sub-agents
- All PRs require human review from `shantamg`
- Issue linking in PR body is mandatory: always use `Related to #N` (never `Fixes #N`) — all issues stay open for human verification

## Shell Script Integration

`scripts/ec2-bot/scripts/fix-bugs.sh` pre-filters issues before invoking Claude:
1. Fetches `bug` + `security` + `bot-pr` issues, deduplicates
2. Checks each for activity (comments, linked PRs)
3. Only passes untouched issue numbers to the agent
4. Post-session: removes `bot-pr` label from issues that now have linked PRs
