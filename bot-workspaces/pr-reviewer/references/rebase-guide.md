# Rebase Guide

Common conflict resolution patterns for bot PRs (Stage 02).

## General Rules

1. Always use `--force-with-lease` (not `--force`) to avoid overwriting others' work
2. Rebase onto the PR's target branch, not always `main`
3. If rebase produces more than 10 conflict files, flag for human

## Conflict Resolution by File Type

### Shared config files
Files: `label-registry.json`, `bot-workspaces/CLAUDE.md`, `package.json`
Strategy: **Accept target branch**, then re-apply bot's additions (new entries only)

### Lock files
Files: `package-lock.json`
Strategy: **Accept target branch**, then run `npm install` to regenerate

### Workspace files (bot-workspaces/)
Strategy: **Accept PR branch** — the PR is adding new content

### Source code (repo root )
Strategy: **Accept PR branch** for new files. For modified files, manually merge — keep both sets of changes where possible.

### Documentation (docs/)
Strategy: **Accept target branch** for index/routing files. Accept PR branch for new doc files.

## When to Give Up

- Rebase fails after 2 attempts with different strategies
- Conflicts span more than 10 files
- Conflicts in database migrations (never auto-resolve these)
- Conflicts in CI/CD config files (`.github/workflows/`)

Post a comment: `"Rebase failed — conflicts too complex for automated resolution. Requesting human help. @shantamg"`
