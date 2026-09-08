# Stage 02: Investigate

## Input

- Issue number, title, body, and labels (from Stage 01)
- `shared/diagnostics/*` utilities
- `CLAUDE.md` docs routing table

## Process

### 1. Read relevant docs first

Check the docs routing table in `CLAUDE.md` for the area the bug touches. Load the matching doc before diving into code.

| Bug area | Doc to read |
|---|---|
| Backend / API | `docs/architecture/services.md` |
| Database | `docs/architecture/data-model.md` |
| Health scoring | `docs/architecture/health-scoring.md` |
| Mobile UI | `docs/mobile/index.md` |
| Science / coding | `docs/science/index.md` |
| Device / firmware | `docs/device/index.md` |
| Auth / Clerk | `docs/architecture/clerk-auth.md` |
| Real-time / Ably | `docs/architecture/ably-realtime.md` |
| Speech / ASR | `docs/architecture/assemblyai-asr.md` |

### 2. Fan out parallel diagnostics (for production bugs)

Launch sub-agents in parallel to gather evidence:

| Agent | Diagnostic | When to use |
|---|---|---|
| A | Sentry errors (`shared/diagnostics/check-sentry.md`) | Always for bugs |
| B | Mixpanel events (`shared/diagnostics/check-mixpanel.md`) | User-facing issues |
| C | Database anomalies (`shared/diagnostics/check-db.md`) | Data-related bugs |
| D | Gateway logs (`shared/diagnostics/render-logs.md`) | Server-side errors |
| E | Conversation health (`shared/diagnostics/check-pipeline-health.md`) | Stuck turns (AI reply missing) / stage stalls |

For `bot-pr` issues (implementation requests), skip diagnostics -- go straight to code research.

### 3. Search and read source code

- Search for relevant code using the error message, affected endpoint, or component name
- Read route handlers, service functions, and related tests
- Trace stacktraces from Sentry to source locations
- Check recent commits for regressions (`git log --oneline -20 -- <affected-path>`)

### 4. Correlate findings

- Cross-reference Sentry errors with log timestamps
- Match Mixpanel event drops with deployment times
- Check conversation/turn progression if a session seems stuck
- Look for patterns across diagnostic sources

### 5. Assess fixability

| Assessment | Action |
|---|---|
| Code-fixable with clear root cause | Proceed to Stage 03 |
| Ambiguous root cause, needs more data | Document what's known, escalate to human |
| Not code-fixable (config/credentials/infra) | Skip with explanation |

## Output

Root cause analysis (passed to Stage 03):
- **Root cause summary**: One-paragraph explanation
- **Affected files**: List of files that need changes
- **Evidence**: What diagnostic sources confirmed the root cause
- **Severity**: User impact (critical / moderate / low)
- **Approach hint**: Brief description of the fix direction

## Exit Criteria

- Root cause identified with supporting evidence, OR
- Escalated to human with documented findings and what's missing

## Completion

**If invoked as part of the full pipeline** (Stage 01 selected this issue):
Proceed to `stages/03-plan/` with the root cause analysis.

**If invoked standalone via `bot:investigate` label** (no Stage 01 context):
Post findings as a comment on the issue, then relabel based on outcome:

| Outcome | Action |
|---------|--------|
| Code-fixable with clear root cause | Remove `bot:investigate`, add `bot:pr`. Post comment with root cause + suggested fix approach. |
| Needs more info from a human | Remove `bot:investigate`, add `bot:needs-info`. Post comment explaining what's known and what questions remain. |
| Not code-fixable (config/credentials/infra) | Remove `bot:investigate`. Post comment explaining why and what manual steps are needed. |
| Ambiguous — partially investigated | Keep `bot:investigate` for retry on next cycle. Post comment with partial findings so the next attempt can build on them. |

Always post a structured comment with:
```
## Investigation Report
**Root cause**: [summary or "undetermined"]
**Evidence**: [what was checked and found]
**Recommendation**: [fix approach / questions for humans / manual steps needed]
**Next step**: [which bot:* label was applied and why]
```

### Slack follow-up (standalone only)

After posting the GitHub comment, report back to the original Slack thread so the requester has visibility without checking GitHub.

1. **Parse the issue's Provenance block** for `Channel` (e.g., `#pmf1`) and `Timestamp` (e.g., `1774227604.872589`). If either is missing, skip Slack reporting — not every issue originates from Slack.
2. **Look up the channel ID** from `repo root .claude/config/services.json` (`slack.channels.<name>`). If the channel isn't in `services.json`, skip.
3. **Adapt tone to the channel**:
   - `#pmf1` — Non-technical. No code details, no file paths. Focus on what was found and what happens next. Keep it warm and concise.
   - `#agentic-devs` — Technical. Include root cause details and fix approach.
   - Other channels — Default to non-technical.
4. **Post as a thread reply** using the Timestamp as `--thread-ts`:
   ```bash
   ${SLAM_BOT_SCRIPTS:-/opt/slam-bot/scripts}/slack-post.sh \
     --channel "$CHANNEL_ID" \
     --text "$MESSAGE" \
     --thread-ts "$THREAD_TS"
   ```
5. **Message format** (Slack mrkdwn, per `shared/references/slack-format.md`):

   **When outcome is `bot:pr` or not-code-fixable:**
   ```
   *Investigation complete* — <issue_url|Issue #N>

   • *What we found:* [one-line root cause or "still investigating"]
   • *Next step:* [e.g., "A fix PR is being created", "This needs a manual config change"]
   ```

   **When outcome is `bot:needs-info` — include the actual questions:**
   ```
   We looked into this and have a couple of questions before we can fix it — can you answer when you get a chance?

   • [Question 1 — plain language, no technical jargon for #pmf1]
   • [Question 2]
   • [Question N]

   Full details: <issue_url|Issue #N>
   ```
   The questions in the Slack message MUST be the same ones posted in the GitHub "Questions for humans" section, rephrased for the channel tone. The requester should be able to answer directly in the Slack thread without visiting GitHub. Always include a clickable link to the issue.
