# Stage: Gather Data

## Input

- Time window: last 12h (twice-daily cadence), or custom from arguments
- Channel ID for #most-important-thing from `.claude/config/services.json`

## Process

Run 10 parallel sub-agents to collect all data needed for the strategy briefing. Sub-agent 0 checks responses to the previous briefing. Sub-agents 1-5 gather retrospective data; sub-agents 6-9 run proactive opportunity scanners.

### Sub-agent 0: Previous Briefing Response Checker
Fetch the most recent bot message in #most-important-thing and check its thread for team responses:

1. **Find the last briefing** — List recent messages in #most-important-thing, find the most recent one posted by the bot
2. **Check thread replies** — Fetch thread replies on that message
3. **Classify each reply:**
   - *Agreement* — Team member says "yes", "agree", "go for it", "approved", thumbs-up emoji, or similar → item is greenlit
   - *Deferral with reason* — Team member says "not now", "later", "defer", "let's wait" + explains why → extract the item reference and deferral reason
   - *Question* — Team member asks a follow-up question → item needs more context before proceeding
   - *No reply* — No thread responses at all → all presented items carry forward as unanswered
4. **Build response summary:**
   ```
   {
     previous_briefing_ts: string,       // Slack ts of the last briefing
     greenlit_items: [{issue_number, title}],
     deferred_items: [{issue_number, title, reason, deferred_by}],
     questions: [{issue_number, question_text, asked_by}],
     unanswered_items: [{issue_number, title}]  // Items presented but not responded to
   }
   ```

If no previous briefing is found (first run), return an empty response summary and continue.

### Sub-agent 1: Slack Agent
- List all channels, fetch messages from last 12h, skip bot messages
- Summarize per active channel: who posted, key topics, decisions, action items
- Flag any messages where a human answered a bot question (human-unblocked work)

### Sub-agent 2: GitHub Activity Agent
- PRs opened/merged/closed in last 12h
- Issues opened/closed in last 12h
- Recent commits on main
- Use `gh` CLI with date filtering

### Sub-agent 3: Unblocked Work Agent
Scan for issues where humans responded to bot questions (work that was waiting and is now ready):
```bash
# Issues labeled bot:needs-info where a human commented in last 12h
gh issue list --repo shantamg/meet-without-fear --label "bot:needs-info" --state open --json number,title,comments,updatedAt --limit 50
```
For each, check if the latest comment is from a human (not the bot). If so, this issue is now unblocked.

Also check for issues where `blocked` label was removed in last 12h:
```bash
gh issue list --repo shantamg/meet-without-fear --state open --json number,title,labels,updatedAt --limit 100
```

### Sub-agent 4: Pipeline State Agent
Count issues in each pipeline stage:
```bash
# Count by bot:* labels to understand pipeline state
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:investigate" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:pr" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:needs-info" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:spec-builder" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:research" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:verify" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:expert-review" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "blocked" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:in-progress" --json number --jq length
gh issue list --repo shantamg/meet-without-fear --state open --label "bot:needs-human-review" --json number --jq length
```
Produce a summary: N in research, N in spec, N in implementation, N in review, N in verification, N awaiting human review, N blocked, N needs info.

### Sub-agent 5: Slack + GitHub Cross-reference Agent
- Check for Slack messages that reference GitHub issues/PRs without action
- Check for GitHub issues that mention Slack conversations needing follow-up
- Detect stale threads (bot asked question >12h ago with no human reply)

### Sub-agent 6: Sentry Pattern Scanner
Load `shared/scanners/sentry-patterns.md` and execute. Detects:
- Recurring errors (3+ in 12h)
- New error types (first seen in last 12h)
- Error spikes correlated with recent deploys
Returns structured findings with autonomy tier classification.

### Sub-agent 7: Mixpanel Friction Scanner
Load `shared/scanners/mixpanel-friction.md` and execute. Detects:
- Session funnel drop-offs (Session Created → stages 0–4 → Session Resolved)
- Feature abandonment patterns (inner-work and share flows)
- Usage anomalies (significant drops from 7-day average)
Returns structured findings with user impact ranking.

### Sub-agent 8: Idle Issue Scanner
Load `shared/scanners/idle-issues.md` and execute. Detects:
- High-priority issues idle >3 days
- Issues with all blockers resolved but not picked up
- High-interest community issues
Returns ranked list with autonomy tier classification.

### Sub-agent 9: Code Health Scanner
Load `shared/scanners/code-health.md` and execute. Detects:
- New source files without tests
- FIXME/TODO in recently modified code
- Dependency vulnerabilities
- High-churn file hotspots
Returns technical debt items ranked by risk.

## Output

Collected data from all sub-agents, ready for the strategize stage. Each sub-agent returns its findings as structured text. If a sub-agent fails, note which source failed and continue with available data.

The response summary from Sub-agent 0 is critical input for Stage 2 — it determines which items carry forward, which are greenlit, and which deferrals need to be recorded on GitHub issues.

## Completion

Proceed to `stages/2-strategize/` with all gathered data.
