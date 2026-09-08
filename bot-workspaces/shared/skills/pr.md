# PR Creation Skill

Create a pull request with pre-flight checks, documentation updates, and issue linking.

## Stages

1. **Pre-flight** — verify not on main or bot/staging, run `npm run test` and `npm run check`
2. **Docs update** — review diff, update affected docs, archive completed plans
   1. Run `git diff main...HEAD --name-only` to identify all changed files
   2. Check `docs/code-to-docs-mapping.json` — it maps code paths to their corresponding docs. For each changed file, find matching entries and read those docs. Also consult the docs routing table in `CLAUDE.md` for any areas not covered by the mapping.
   3. For each affected doc:
      - Read the doc and verify it still matches the code changes in this PR
      - Check `docs/canonical-facts.json` for values that appear across multiple docs (service count, score categories, dimension names, etc.). If this PR changes any canonical value, update the JSON file AND all docs that reference it.
      - Update any content that is now inaccurate or incomplete
      - Set the `updated` frontmatter field to today's date
   4. If a new feature was built and no living doc exists for it, create one in the appropriate `docs/` section with proper YAML frontmatter (`created`, `updated`, `status: living`)
   5. If a plan doc (in `.planning/` or elsewhere) was used and is now completed, move it to `docs/archive/` and update its `status` to `archived`
   6. Commit all doc updates on the feature branch before creating the PR
   7. The `## Docs updated` section in the PR body MUST list every doc that was created or modified, or explicitly state why no doc changes were needed (e.g., "No doc changes needed — test-only PR")
3. **Detect linked issues** — scan branch name, commit messages, and prompt context for `#<number>` references
4. **Issue linking** — always use `Related to #N` (NOT `Fixes #N`) to prevent auto-close. All issues stay open for human verification.
5. **Analyze changes** — generate 3-7 user-friendly bullet points from diff
6. **Create PR** — push branch, `gh pr create` with HEREDOC body
7. **Tag for bot review** — after PR is created, add label so the pr-reviewer picks it up:
   ```bash
   gh pr edit <number> --add-label "bot:needs-review"
   ```

## PR Body Format

```
## Changes
- Add: ...
- Fix: ...

Related to #<issue-number>

## Provenance
- **Channel:** ...
- **Requested by:** ...
- **Original message:** ...
- **Prompt(s) used:** ...

## Docs updated
- `docs/path/...` (or "No doc changes needed")
```

## Target Branch

All bot PRs target **`bot/staging`** by default (not `main`). This allows autonomous bot review and merge without blocking human workflows. Changes accumulate on `bot/staging` throughout the day and are merged to `main` in a single daily batch.

**Exceptions** (target the branch specified, not `bot/staging`):
- **Milestone PRs** — target the milestone branch (e.g., `milestone/audit-fix-dimension-scoring`)
- **PRs where the issue or prompt explicitly specifies a different base branch**

When creating the PR:
```bash
# Default (no milestone context):
gh pr create --base bot/staging ...

# Milestone context detected:
gh pr create --base milestone/{plan-name} ...
```

## Post-PR: Verification Comment

After creating a PR for any linked issue, post a verification comment on the issue:

```bash
gh issue comment {N} --repo shantamg/meet-without-fear --body "$(cat <<'COMMENT'
## Fix proposed

**PR**: #<pr-number>
**What changed**: <1-2 sentence summary>
**How to verify**: <specific steps or what to look for>

This issue will stay open until a human verifies the fix and adds the \`user-verified\` label.
COMMENT
)"
```

## Critical Rules

- **Always use `Related to #N`** (never `Fixes #N`) — all issues stay open for human verification
- Provenance section required on all PRs
- Never force-push to someone else's branch
- Always add `bot:needs-review` label after creating a PR — this triggers the pr-reviewer pipeline
- Default target is `bot/staging` — never target `main` directly unless explicitly instructed
