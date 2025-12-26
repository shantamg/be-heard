---
slug: /backend/security/rls-policies
sidebar_position: 2
---

# Row-Level Security Policies

PostgreSQL RLS policies enforcing privacy at the database level.

## Overview

Row-Level Security (RLS) ensures that even if application code has bugs, the database itself prevents unauthorized data access. Every query is filtered based on the current actor's identity and role.

## Session Variables

Before each request, the backend sets these PostgreSQL session variables:

```sql
-- Set by middleware before any queries
SET LOCAL app.actor_id = 'user_123';
SET LOCAL app.actor_role = 'user';  -- or 'ai'
SET LOCAL app.current_session_id = 'sess_abc';
SET LOCAL app.current_stage = '2';
```

## Enabling RLS

```sql
-- Enable RLS on all sensitive tables
ALTER TABLE "UserVessel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmotionalReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentifiedNeed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Boundary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentedContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageProgress" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE "UserVessel" FORCE ROW LEVEL SECURITY;
-- ... repeat for all tables
```

## UserVessel Policies

The UserVessel is completely private to its owner.

```sql
-- Users can only see their own vessels
CREATE POLICY user_vessel_select ON "UserVessel"
  FOR SELECT
  USING (
    "userId" = current_setting('app.actor_id', true)
  );

-- Users can only insert their own vessels
CREATE POLICY user_vessel_insert ON "UserVessel"
  FOR INSERT
  WITH CHECK (
    "userId" = current_setting('app.actor_id', true)
  );

-- Users can only update their own vessels
CREATE POLICY user_vessel_update ON "UserVessel"
  FOR UPDATE
  USING (
    "userId" = current_setting('app.actor_id', true)
  );

-- No delete policy - vessels are never deleted
```

## UserEvent Policies

Events are private to the vessel owner.

```sql
-- Select: Only owner can see their events
CREATE POLICY user_event_select ON "UserEvent"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "UserVessel" uv
      WHERE uv.id = "UserEvent"."vesselId"
        AND uv."userId" = current_setting('app.actor_id', true)
    )
  );

-- Insert: Only owner can add events to their vessel
CREATE POLICY user_event_insert ON "UserEvent"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "UserVessel" uv
      WHERE uv.id = "vesselId"
        AND uv."userId" = current_setting('app.actor_id', true)
    )
  );
```

## EmotionalReading Policies

Same pattern as UserEvent - private to vessel owner.

```sql
CREATE POLICY emotional_reading_select ON "EmotionalReading"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "UserVessel" uv
      WHERE uv.id = "EmotionalReading"."vesselId"
        AND uv."userId" = current_setting('app.actor_id', true)
    )
  );
```

## Message Policies

Messages are visible to session participants only.

```sql
-- Select: Session participants can see messages
CREATE POLICY message_select ON "Message"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Session" s
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" rm ON rm."relationshipId" = r.id
      WHERE s.id = "Message"."sessionId"
        AND rm."userId" = current_setting('app.actor_id', true)
    )
  );

-- Insert: Only participants can send messages
CREATE POLICY message_insert ON "Message"
  FOR INSERT
  WITH CHECK (
    -- Sender must be a participant (or null for AI)
    (
      "senderId" IS NULL  -- AI message
      OR "senderId" = current_setting('app.actor_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM "Session" s
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" rm ON rm."relationshipId" = r.id
      WHERE s.id = "sessionId"
        AND rm."userId" = current_setting('app.actor_id', true)
    )
  );
```

## ConsentedContent Policies

Shared content requires active consent verification.

```sql
-- Select: Only accessible if consent is active
CREATE POLICY consented_content_select ON "ConsentedContent"
  FOR SELECT
  USING (
    -- Must be a session participant
    EXISTS (
      SELECT 1 FROM "SharedVessel" sv
      JOIN "Session" s ON sv."sessionId" = s.id
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" rm ON rm."relationshipId" = r.id
      WHERE sv.id = "ConsentedContent"."sharedVesselId"
        AND rm."userId" = current_setting('app.actor_id', true)
    )
    -- AND consent must be active
    AND "consentActive" = true
  );
```

## StageProgress Policies

Users can see their own progress and partner's stage (not gate details).

```sql
-- Select own progress: Full access
CREATE POLICY stage_progress_own ON "StageProgress"
  FOR SELECT
  USING (
    "userId" = current_setting('app.actor_id', true)
  );

-- Select partner progress: Limited (stage and status only, enforced at app layer)
CREATE POLICY stage_progress_partner ON "StageProgress"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Session" s
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" rm ON rm."relationshipId" = r.id
      WHERE s.id = "StageProgress"."sessionId"
        AND rm."userId" = current_setting('app.actor_id', true)
    )
  );
```

## AI Actor Policies

When AI is querying, it inherits the user's context but cannot access more than the user could.

```sql
-- AI queries use actor_role = 'ai' but still scoped to actor_id
-- The AI is "acting on behalf of" a specific user

-- Example: AI can read user's vessel when serving them
CREATE POLICY user_vessel_ai ON "UserVessel"
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'ai'
    AND "userId" = current_setting('app.actor_id', true)
    AND "sessionId" = current_setting('app.current_session_id', true)
  );
```

## Stage-Based Restrictions

Some policies are stage-dependent (enforced primarily at app layer, with DB as backup).

```sql
-- Example: SharedVessel only accessible in Stage 2+
-- This is enforced at app layer via retrieval contracts
-- DB provides defense in depth

CREATE POLICY shared_content_stage_check ON "ConsentedContent"
  FOR SELECT
  USING (
    "consentActive" = true
    AND current_setting('app.current_stage', true)::int >= 2
  );
```

## Middleware Implementation

```typescript
// Express middleware to set RLS context
async function setRLSContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const sessionId = req.params.sessionId;
  const stage = await getCurrentStage(userId, sessionId);

  await prisma.$executeRaw`
    SET LOCAL app.actor_id = ${userId};
    SET LOCAL app.actor_role = 'user';
    SET LOCAL app.current_session_id = ${sessionId || ''};
    SET LOCAL app.current_stage = ${stage?.toString() || '0'};
  `;

  next();
}

// For AI queries
async function setAIContext(userId: string, sessionId: string) {
  const stage = await getCurrentStage(userId, sessionId);

  await prisma.$executeRaw`
    SET LOCAL app.actor_id = ${userId};
    SET LOCAL app.actor_role = 'ai';
    SET LOCAL app.current_session_id = ${sessionId};
    SET LOCAL app.current_stage = ${stage.toString()};
  `;
}
```

## Testing RLS

```sql
-- Test as a specific user
SET LOCAL app.actor_id = 'user_123';
SET LOCAL app.actor_role = 'user';

-- This should return only user_123's vessels
SELECT * FROM "UserVessel";

-- This should return nothing (partner's data)
SET LOCAL app.actor_id = 'user_456';
SELECT * FROM "UserVessel" WHERE "userId" = 'user_123';
-- Expected: 0 rows
```

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgetting to set context | Middleware sets it on every request |
| Bypassing RLS in migrations | Use separate admin connection |
| Leaking via JOINs | RLS applies to each table in JOIN |
| Performance impact | Create indexes on policy columns |

## Performance Indexes

```sql
-- Index for RLS lookups
CREATE INDEX idx_user_vessel_user ON "UserVessel" ("userId");
CREATE INDEX idx_user_event_vessel ON "UserEvent" ("vesselId");
CREATE INDEX idx_message_session ON "Message" ("sessionId");
CREATE INDEX idx_consented_active ON "ConsentedContent" ("sharedVesselId", "consentActive");
CREATE INDEX idx_relationship_member_user ON "RelationshipMember" ("userId");
```

## Related Documentation

- [Retrieval Contracts](../state-machine/retrieval-contracts.md) - App-layer access rules
- [Prisma Schema](../data-model/prisma-schema.md) - Data model
- [Architecture](../overview/architecture.md) - RLS middleware pattern

---

[Back to Security](./index.md) | [Back to Backend](../index.md)
