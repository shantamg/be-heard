# Check Conversation Health Utility

Inspect MWF's conversation turn flow to identify sessions stuck waiting on an AI
response or stalled mid-stage.

> MWF is a **text-based, staged conversation app** — there is no audio/recording
> or media-processing pipeline. The "pipeline" here is the per-turn loop:
> a user sends a `Message` (`role = USER`) → the backend calls the LLM → an
> `AI` message is written back. A turn whose latest message is still `role = USER`
> after a few minutes means the AI reply never landed (stuck turn). This mirrors
> the mobile typing indicator (`role === USER` ⇒ waiting for AI).

## Turn Progression

```
User Message (role=USER) -> backend LLM call -> AI Message (role=AI)
```

Each turn should complete in seconds. A live session whose latest message is
`role=USER` and older than ~3 minutes is likely a stuck/failed turn.

## Core Query — stuck turns

```sql
SELECT s.id, s.status, s.type,
       last.role  AS last_role,
       last.stage AS last_stage,
       last.timestamp AS last_message_at,
       now() - last.timestamp AS waiting
FROM "Session" s
JOIN LATERAL (
  SELECT m.role, m.stage, m.timestamp
  FROM "Message" m
  WHERE m."sessionId" = s.id
  ORDER BY m.timestamp DESC
  LIMIT 1
) last ON true
WHERE s.status IN ('ACTIVE', 'WAITING')
ORDER BY last.timestamp ASC
LIMIT 20;
```

## Interpretation

| Session status | last_role | Meaning |
|---|---|---|
| `ACTIVE` / `WAITING` | `AI` (or empathy/system variant) | Healthy — ball is in the user's court |
| `ACTIVE` | `USER`, < ~3 min | Turn in progress (AI generating) |
| `ACTIVE` | `USER`, > ~3 min | **Stuck turn** — AI reply never written; check Render logs / Sentry |
| `WAITING` | any | One user ahead, waiting on partner (expected, not stuck) |
| `PAUSED` | any | Cooling period (expected) |

## Stage-stall detection

A session whose `StageProgress` for a user has sat in `IN_PROGRESS` or
`GATE_PENDING` far longer than peers may be stalled:

```sql
SELECT sp."sessionId", sp."userId", sp.stage, sp.status, sp."updatedAt"
FROM "StageProgress" sp
WHERE sp.status IN ('IN_PROGRESS', 'GATE_PENDING')
  AND sp."updatedAt" < now() - interval '24 hours'
ORDER BY sp."updatedAt" ASC
LIMIT 20;
```

`GATE_PENDING` for a long time usually means "requirements met, awaiting partner"
— normal for async sessions, not necessarily a bug. Correlate stuck turns with
Sentry errors and Render logs before flagging.
