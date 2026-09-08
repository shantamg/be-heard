# Stage: Rebase

## State file — read from this, do not re-fetch

Stage 01 has already run `gh pr list --json ...` ONCE per cron cycle and written the full state of every open PR to:

**`/tmp/slam-bot/pr-reviewer-state.json`**

You **MUST** read PR metadata from this file. You **MUST NOT** run `gh pr view`, `gh pr list`, or `gh api repos/.../pulls/N` for any of the following fields, because they are already in the state file:

- `number`, `title`, `baseRefName`, `headRefName`, `author_login`
- `mergeable`, `mergeStateStatus`, `reviewDecision`
- `labels` (array of strings)
- `statusCheckRollup` (CI state per check)
- `updatedAt`

Re-fetching these via `gh` is a **strict violation** of the bot's GitHub API budget policy and is the primary cause of the rate-limit exhaustion incidents tracked in #1649. Do not do it.

At the very start of this stage, source the helper and verify the state file is present and fresh:

```bash
source /opt/slam-bot/scripts/lib/pr-reviewer-state.sh
pr_reviewer_state_assert_fresh || exit 1

# Pull the fields this stage needs out of the state file, ONCE.
BASE_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" baseRefName)
HEAD_BRANCH=$(pr_reviewer_state_field "$PR_NUMBER" headRefName)
MERGEABLE=$(pr_reviewer_state_field "$PR_NUMBER" mergeable)

# Sanity: this stage should only be invoked for CONFLICTING PRs.
if [ "$MERGEABLE" != "CONFLICTING" ]; then
  echo "WARN: stage 02 invoked for PR #$PR_NUMBER with mergeable=$MERGEABLE (expected CONFLICTING) — skipping"
  exit 0
fi
```

The only `gh` calls allowed in this stage are the ones explicitly shown in the steps below:

- `gh pr edit ... --add-label / --remove-label` (the batched label edit at step 8)
- `gh pr comment` (only on rebase failure, step 7)

Any other `gh` call indicates a bug.

## Input

- PR number from scan work queue (already classified as `CONFLICTING` via the state file)

## Process

### 1. Record the stage-start label intent

Instead of issuing a separate `gh pr edit` call for every label change, accumulate intent in shell variables and flush it **once** at the end of the stage. Start by marking that we want `bot:in-progress` added:

```bash
LABELS_TO_ADD="bot:in-progress"
LABELS_TO_REMOVE=""
```

If the state file shows `bot:in-progress` is already present, another agent is working on this PR — skip it without any API calls:

```bash
if pr_reviewer_state_has_label "$PR_NUMBER" bot:in-progress; then
  echo "PR #$PR_NUMBER already has bot:in-progress — another agent owns it, skipping"
  exit 0
fi
```

### 2. Apply the claim (the only early `gh pr edit` in this stage)

The claim needs to land *before* the rebase work begins, so that a concurrent pr-reviewer tick sees it and skips. This is the ONE exception to the "batch label edits at stage end" rule — claims have to be visible immediately:

```bash
gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear --add-label "bot:in-progress"
# Note: we still need to REMOVE bot:in-progress at stage end, so defer that
LABELS_TO_ADD=""                   # already applied above
LABELS_TO_REMOVE="bot:in-progress"  # flush at stage exit
```

### 3. Checkout in a worktree and rebase

`BASE_BRANCH` and `HEAD_BRANCH` were pulled from the state file in the header — **do not re-fetch them via `gh pr view`**:

```bash
git fetch origin
git worktree add "../rebase-pr-$PR_NUMBER" "origin/$HEAD_BRANCH"
cd "../rebase-pr-$PR_NUMBER"
git rebase "origin/$BASE_BRANCH"
```

### 4. Resolve conflicts

See `references/rebase-guide.md`. Default rules:

- `label-registry.json`, root `CLAUDE.md`: prefer target branch (shared config)
- `package-lock.json`: accept target, then re-install
- All other files: prefer the PR branch changes (the feature)

### 5. Force push the rebased branch

```bash
git push --force-with-lease "origin" "$HEAD_BRANCH"
```

### 6. Clean up worktree

```bash
cd -
git worktree remove "../rebase-pr-$PR_NUMBER"
```

### 7. On rebase failure after 2 attempts

- Post a comment requesting human help (`gh pr comment "$PR_NUMBER" --repo shantamg/meet-without-fear --body "..."`)
- Keep `LABELS_TO_REMOVE="bot:in-progress"` so the claim is released
- Move to next PR in queue

### 8. Flush label changes — batched single edit

**This is the rule.** All label adds and removes from this stage flush in **one** `gh pr edit` call at the very end. Never split add and remove into two calls.

```bash
if [ -n "$LABELS_TO_ADD" ] || [ -n "$LABELS_TO_REMOVE" ]; then
  gh pr edit "$PR_NUMBER" --repo shantamg/meet-without-fear \
    ${LABELS_TO_ADD:+--add-label "$LABELS_TO_ADD"} \
    ${LABELS_TO_REMOVE:+--remove-label "$LABELS_TO_REMOVE"}
fi
```

Splitting add and remove into two calls doubles the GitHub API cost for no benefit. If you find yourself writing two `gh pr edit` calls in this stage, stop and consolidate.

## Output

- Rebased and force-pushed branch, `bot:in-progress` removed
- OR: comment requesting help + `bot:in-progress` removed

## Completion

Return to scan loop to process next PR in work queue. The state file still reflects the PRE-rebase `mergeable` state; it will be refreshed on the NEXT cron tick when Stage 01 runs again.
