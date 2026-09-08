# Stage 02: Verify

## Input

- PR branch name (from Stage 01)
- Affected packages list (from Stage 01)
- Verification strategy checklist (from Stage 01)

## Process

### 1. Check out the PR branch

```bash
git fetch origin <branch-name>
git checkout <branch-name>
```

### 2. Install dependencies

```bash
npm install
```

If lockfile is out of date, note it as a finding but continue with `npm install`.

### 3. Run tests

```bash
npm run test
```

This runs all tests across the monorepo (jest for backend, jest-expo for mobile).

Record:
- Total test count and suite count
- Pass/fail status
- Any failure details (test name, error message, stack trace)

If tests fail:
- Capture the full failure output
- Do NOT attempt to fix -- this workspace only verifies, it does not modify code
- Record the failure for the report

### 4. Run type checks

```bash
npm run check
```

Record:
- Pass/fail status
- Any type error details (file, line, error message)

### 5. Run build check (if applicable)

Only if the verification strategy flagged build-related changes:

```bash
npm run build --workspace=backend
```

Record:
- Pass/fail status per affected app
- Any build error details

### 6. Check Sentry for new errors (if applicable)

Only if changes have been deployed to staging. Load `shared/diagnostics/check-sentry.md` and `shared/references/credentials.md`.

Query for unresolved issues created in the last 24 hours. Flag any new errors that correlate with the PR's changed files.

### 7. Check staging endpoints (if applicable)

Only if the verification strategy identified new or modified API endpoints and staging is deployed.

Load `shared/diagnostics/render-status.md` to confirm the service is running.

For each new/modified endpoint:
- Make a basic health check request
- Verify the response status code
- Note any errors

## Output

A structured results object:

| Check | Status | Details |
|---|---|---|
| Tests | PASS / FAIL | N tests, N suites; failure details if any |
| Type check | PASS / FAIL | Error details if any |
| Build | PASS / FAIL / SKIPPED | Error details if any |
| Sentry | CLEAN / NEW_ERRORS / SKIPPED | Error details if any |
| Staging endpoints | OK / ERRORS / SKIPPED | Endpoint-level results if any |

Plus a list of items flagged for manual review.

## Failure Handling

| Failure | Action |
|---|---|
| Tests fail | Record details, continue to remaining checks |
| Type check fails | Record details, continue to remaining checks |
| Build fails | Record details, continue to remaining checks |
| Sentry errors found | Record details, flag in report |
| Cannot reach staging | Mark as SKIPPED, note in report |
| Branch checkout fails | Post comment on issue, exit |

**Important:** This stage never modifies code. All failures are recorded and passed to Stage 03 for reporting.

## Exit Criteria

- All applicable checks have been executed (or marked SKIPPED with reason)
- Results structured and ready for report generation

## Completion

Proceed to `stages/03-report/`.
