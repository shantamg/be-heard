# Check Database Utility

Query the PostgreSQL database for diagnostics, data inspection, or debugging.

## Credentials

Load `READONLY_DATABASE_URL` (preferred) or `PRODUCTION_DATABASE_URL` (fallback) per `shared/references/credentials.md`.

## Running Queries

```bash
psql "$PRODUCTION_DATABASE_URL" -c "SELECT ..." --no-psqlrc -P pager=off
```

Fallback: `cd && DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run db:query 'SELECT ...'`

## Default Health Check

1. Table row counts (User, Relationship, Session, Message, InnerWorkSession, Invitation)
2. Recent sessions (last 24h) with status, type, and message count
3. Conversation/turn health via `check-pipeline-health.md`
4. Migration status (last 5 migrations)

Recent sessions query:

```sql
SELECT s.id, s.status, s.type, s."createdAt",
       (SELECT COUNT(*) FROM "Message" m WHERE m."sessionId" = s.id) AS messages
FROM "Session" s
WHERE s."createdAt" > now() - interval '24 hours'
ORDER BY s."createdAt" DESC;
```

## Key Tables

| Table | Purpose |
|---|---|
| `User` | Auth users (Clerk) |
| `Relationship` / `RelationshipMember` | The two-party relationship and its members |
| `Session` | A conflict-resolution conversation (`SessionStatus`: CREATED→INVITED→ACTIVE→WAITING/PAUSED→RESOLVED/ABANDONED/ARCHIVED) |
| `Message` | Conversation messages (`MessageRole`: USER/AI/SYSTEM/empathy variants; `stage` 0–4) |
| `StageProgress` | Per-user stage status (`StageStatus`: NOT_STARTED/IN_PROGRESS/GATE_PENDING/COMPLETED) |
| `Invitation` | Partner invitations |
| `InnerWorkSession` / `InnerWorkMessage` | Solo self-reflection sessions |
| `UserVessel` / `SharedVessel` | Private vs. shared data (Vessel privacy model) |
| `EmpathyAttempt` / `EmpathyValidation` | Empathy / reconciler flow |
| `StrategyProposal` / `Stage4*` | Stage 4 resolution building |
| `Agreement` | Finalized agreements |
| `TendingEntry` / `TendingCheckin` | Post-resolution tending / re-engagement |
| `Person` | People referenced within relationships |

## Security

- SELECT-only via `slam_bot_readonly` role
- NEVER print full connection strings
