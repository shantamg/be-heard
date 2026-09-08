# Mixpanel User Friction Scanner

Detect user friction patterns from Mixpanel data that warrant investigation or improvement.

## Prerequisites

- Load `shared/references/credentials.md` for Mixpanel API access (`MIXPANEL_USERNAME`,
  `MIXPANEL_SECRET`, `MIXPANEL_PROJECT_ID`)
- Load `shared/diagnostics/check-mixpanel.md` for query patterns

> **Scope guard — read before flagging anything.** This scanner must reason
> ONLY about events that the MWF app actually emits (see the list below). MWF is
> a **text-based, staged conversation app — there is no audio/recording/upload
> flow.** Never infer an "outage" or "funnel break" from the absence of an event
> name that isn't in the emitted set, and never flag a drop unless the 7-day
> baseline for that metric is itself non-zero (a zero baseline means we never had
> that data, not that it disappeared). Events go **client→Mixpanel directly**;
> there is no MWF backend in the path, so "backend routing" is never a cause.

### Events MWF actually emits

Source of truth: `mobile/src/services/analytics.ts` (typed wrapper) plus a handful
emitted directly via `track()` in `MixpanelInitializer.tsx` / `useOTAUpdate.ts`.

**Lifecycle / auth (direct track):** `App Launch`, `Sign Up Completed`,
`Sign In Completed`, `Logout`, `OTA Update Checked` / `Downloaded` / `Applied` /
`Dismissed`. (`App Launch` fires on every prod launch — broadest usage heartbeat.)

**Session journey:** `Person Selected`, `Session Created`, `Invitation Sent`,
`Compact Signed`, `Stage Started` / `Stage Completed` (carry `stage_name`),
`Message Sent`, `Felt Heard Response`, `Session Resolved`.

**Share flow:** `Share Topic Shown` / `Accepted` / `Declined` / `Dismissed`,
`Share Draft Sent`.

**Inner work / KB:** `Inner Work Hub Opened`, `Inner Thoughts Created` / `Linked`,
`Meditation Started` / `Completed`, `Gratitude Started` / `Completed`,
`Needs Assessment Started` / `Completed`.

**Errors:** `Error` (with `error_type`, `error_code`, `context`).

> **Known-dead events — DO NOT flag their absence as an outage.** These are
> defined in `analytics.ts` but **never called** (verified June 2026):
> `Common Ground Found`, `Strategic Repair Started`, `Strategic Repair Completed`.
> Zero volume is expected until they're wired up. Also note `Felt Heard Response`
> is currently hardcoded to `response = 'yes'` (the `'no'` path is unreachable), so
> a 100%-yes distribution is a known instrumentation gap, not a signal.

## Process

### 1. Export recent events

```bash
# Export last 24h of events
curl -s --user "$MIXPANEL_USERNAME:$MIXPANEL_SECRET" \
  "https://data.mixpanel.com/api/2.0/export?project_id=$MIXPANEL_PROJECT_ID&from_date=$(date -d '1 day ago' +%Y-%m-%d)&to_date=$(date +%Y-%m-%d)"
```

Also export the prior 7 days to compute rolling baselines for the anomaly checks.

### 2. Analyze the core session funnel

The canonical healthy-session journey (use the actual event names, in this order):

`App Launch` → `Sign In Completed`/`Sign Up Completed` → `Person Selected` →
`Session Created` → `Invitation Sent` → `Compact Signed` → `Stage Started` →
`Message Sent` → `Stage Completed` (progressing through stages 0–4 via the
`stage_name` prop) → `Session Resolved`

- Calculate conversion rate between each adjacent step.
- For the staged middle, use the `stage_name` property to track `Stage Started` →
  `Stage Completed` per stage (0→1→2→3→4) and find the stage where users drop.
- `Invitation Sent` is the multi-party branch (solo sessions skip it) — report its
  send→`Compact Signed` acceptance rate, but do NOT treat a low invitation count
  as a funnel break on its own.
- Compare each conversion to its 7-day rolling average; flag steps with a
  >20% drop from average as friction points.

### 3. Detect feature abandonment

Started-but-not-completed pairs (only the **emitted** pairs — `Strategic Repair`
is known-dead, skip it):
- Inner work: `Meditation`, `Gratitude`, `Needs Assessment` — compare
  `* Started` vs `* Completed`.
- Share flow: `Share Topic Shown` → `Share Topic Accepted` → `Share Draft Sent`
  (high `Declined`/`Dismissed` or low draft-sent rate = friction).
- Engagement signals within a session: low `Felt Heard Response` relative to
  active sessions (note: currently yes-only, so treat as a volume signal, not a
  satisfaction ratio).
- `Error` events: cluster by `error_type` / `error_code`; a spike indicates a bug
  or confusing UX.

### 4. Detect usage anomalies (the real "tracking down" / outage check)

Compare today's metrics to the 7-day average (only when the baseline is non-zero):
- **Total events** (flag if <50% of average)
- **`App Launch` volume** — broadest usage heartbeat, fires every prod launch
  (flag if <50% of average)
- **Active users** — distinct `distinct_id` count (flag if <50% of average)
- **`Message Sent` volume** — the engagement heartbeat (flag if <50% of average)
- **`Session Created` volume** (flag if <50% of average)
- Any individual key event (from the emitted set) dropping >30% vs average

A genuine tracking/SDK outage looks like **all** of `App Launch`, total events,
`Message Sent`, and `Session Created` collapsing to ~0 together against a healthy
baseline — not a single funnel step being empty.

### 5. Rank by user impact

| Impact Level | Criteria | Autonomy Tier |
|---|---|---|
| Critical | `App Launch`, `Message Sent`, AND `Session Created` all ~0 in 24h while 7-day avg > 0 (app-wide tracking/usage outage) | `proceed` |
| High | >50% drop vs avg in `App Launch`, `Message Sent`, active users, or a core funnel step (`Session Created`→`Stage Started`, `Stage Completed(4)`→`Session Resolved`) | `proceed` |
| Medium | Feature abandonment >30% (inner-work or share flow), or any single event >30% below avg | `suggestion` |
| Low | Minor usage anomaly | `suggestion` |

## Output Format

```
## Mixpanel Friction Findings

**Status:** [clean | issues-found]
**Items found:** N

### Funnel Health
- Person Selected -> Session Created:    N% conversion (avg: N%)
- Session Created -> Compact Signed:     N% conversion (avg: N%)
- Compact Signed  -> Stage Started:      N% conversion (avg: N%)
- Stage Started   -> Stage Completed:    N% conversion (avg: N%)  [per stage 0-4]
- Stage Completed -> Session Resolved:   N% conversion (avg: N%)

### Usage Heartbeat
- App Launch: N (7-day avg: N)
- Total events: N (7-day avg: N)
- Active users: N (7-day avg: N)
- Message Sent: N (7-day avg: N)
- Session Created: N (7-day avg: N)

### Items
1. **[Friction point description]** — [severity: critical/high/medium/low]
   - Metric: [specific numbers]
   - Baseline: [7-day average]
   - User impact: [N users affected]
   - Suggested action: [investigate UX | check client SDK | create issue]
   - Autonomy tier: [proceed | proceed | suggestion]
```
