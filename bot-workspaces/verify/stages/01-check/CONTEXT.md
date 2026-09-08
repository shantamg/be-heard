# Stage 01: Check

## Input

- GitHub issue number with `bot:verify` label
- Global state file (`$GITHUB_STATE_FILE`, default `/opt/slam-bot/state/github-state.json`)

## Global State File

Source the helper library and verify freshness before any GitHub reads:
```bash
source /opt/slam-bot/scripts/lib/github-state.sh
github_state_assert_fresh || exit 1
```

Use the state file for issue/PR metadata (title, labels, state, headRefName). You **MUST NOT** call `gh issue view --json labels`, `gh issue list`, or `gh pr list` for fields already in the state file. Re-fetching them via `gh` is a **strict violation** of the bot's GitHub API budget policy (#1649).

```bash
# Get issue title and confirm label from state file
TITLE=$(github_state_issue_field "$ISSUE_NUMBER" title)
github_state_issue_has_label "$ISSUE_NUMBER" "bot:verify" || exit 0
```

### Allowed `gh` calls (escape hatches)

These are the **only** `gh` read calls this stage may make — they fetch data NOT in the state file:
- `gh issue view <number> --repo shantamg/meet-without-fear` — to read issue **body** and **comments** (not in state file)
- `gh api repos/shantamg/meet-without-fear/issues/<number>/timeline` — to find cross-referenced PRs (not in state file)
- `gh pr view <pr-number> --repo shantamg/meet-without-fear --json files,additions,deletions` — PR file list (not in state file)
- `gh pr diff <pr-number> --repo shantamg/meet-without-fear` — full diff (not in state file)

Any other `gh` read call indicates a bug.

## Process

### 1. Read the issue

```bash
# Title and labels from state file (already loaded above)
# Body and comments need gh (escape hatch):
gh issue view <number> --repo shantamg/meet-without-fear
```

Extract:
- Issue title (from state file) and description (from `gh issue view`)
- Any spec comment (look for `## Spec` or `## Specification` headings in comments)
- Referenced requirements or acceptance criteria

### 2. Find the linked PR

```bash
# Use state file to scan open PRs for one whose branch references this issue.
# headRefName is in the state file — iterate PR numbers:
for PR_NUM in $(github_state_pr_numbers); do
  HEAD=$(github_state_pr_field "$PR_NUM" headRefName)
  # Check if HEAD contains the issue number (e.g., fix/desc-1234)
done
```

Also check issue timeline for cross-referenced PRs (not in state file — escape hatch):
```bash
gh api repos/shantamg/meet-without-fear/issues/<number>/timeline --paginate | jq '[.[] | select(.event == "cross-referenced") | .source.issue.pull_request // empty]'
```

If no linked PR is found, post a comment on the issue explaining that verification cannot proceed without a PR, and exit.

### 3. Analyze the PR changes

```bash
# headRefName from state file; files/additions/deletions need gh (escape hatch):
gh pr view <pr-number> --repo shantamg/meet-without-fear --json files,additions,deletions
gh pr diff <pr-number> --repo shantamg/meet-without-fear
```

From the diff, determine:

| Question | How to determine |
|---|---|
| Which packages are affected? | File paths (`backend/`, `mobile/`, `shared/`, `website/`) |
| Are there tests? | Look for `*.test.ts`, `*.spec.ts` files in the diff |
| Are there new API endpoints? | Route files in `backend/src/routes/` |
| Are there UI changes? | Files in `website/`, `mobile/` |
| Are there schema changes? | `backend/prisma/schema.prisma` in the diff |
| Is there a migration? | Files in `backend/prisma/migrations/` |

### 4. Build verification strategy

Based on the analysis, build a checklist of what to verify:

**Always run:**
- `npm run test` (scoped to affected packages if possible)
- `npm run check` (TypeScript type checking)

**Conditionally run:**
- `npm run build:mobile` / `npm run website:build` for affected apps (if build-related changes)
- Staging endpoint checks (if API changes and deployment detected)
- Sentry error check (if recently deployed)

**Flag for manual review:**
- UI changes (screenshots, visual inspection)
- Mobile-specific changes (device testing)
- Schema migrations (data integrity)

## Output

- Issue context summary (title, requirements, acceptance criteria)
- Linked PR number and branch name
- Affected packages list
- Verification strategy checklist (automated vs. manual items)

## Exit Criteria

- Linked PR found and analyzed
- Verification strategy determined
- Ready to check out PR branch and run checks

## Completion

Proceed to `stages/02-verify/`.
