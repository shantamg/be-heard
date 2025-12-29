---
slug: /backend/state-machine/retrieval-contracts
sidebar_position: 1
---

# Retrieval Contracts

**This is the most critical document for maintaining trust in Meet Without Fear.**

Every stage has a hard retrieval contract that defines exactly what data can and cannot be accessed. These are not guidelines - they are enforced constraints.

## Core Rules

> If something can affect trust, it must not rely on similarity search alone.

> Vector search results are candidates, not facts. All results must still pass stage + consent + vessel validation.

> AI Synthesis objects may influence retrieval planning but may never be injected directly into the generation context.

> Retrieval planning output must compile into a finite set of contract-typed queries; any query not representable in the contract schema is rejected.

> Retrieval scope is fixed per turn. Retrieval planning occurs once; generation may not trigger additional retrieval.

> Small Model schema enforcement: The retrieval planner (Haiku) outputs structured JSON that is validated before execution. Invalid queries fail fast with fallback to minimal context.

## Contract Structure

Each contract specifies:

- **ALLOWED**: Data that CAN be retrieved
- **FORBIDDEN**: Data that MUST NEVER be accessed
- **REQUIRES**: Conditions that must be true before retrieval
- **VECTOR SCOPE**: What semantic search can access (if any)

## Contract Schema

All retrieval queries must be representable in this schema. Queries that don't fit are rejected.

```typescript
type VesselScope = 'user' | 'shared' | 'global';
type QuerySource = 'structured' | 'vector' | 'metadata';

type RetrievalQuery =
  // Metadata queries (Stage 0+)
  | { type: 'session_metadata'; source: 'metadata' }
  | { type: 'relationship_metadata'; source: 'metadata' }
  | { type: 'session_outcomes'; source: 'structured' }

  // User Vessel queries (Stage 1+)
  | { type: 'user_event'; vessel: 'user'; source: QuerySource; userId: string }
  | { type: 'emotional_reading'; vessel: 'user'; source: QuerySource; userId: string }
  | { type: 'need'; vessel: 'user'; source: QuerySource; userId: string }
  | { type: 'boundary'; vessel: 'user'; source: 'structured'; userId: string }

  // Shared Vessel queries (Stage 2+)
  | { type: 'consented_content'; vessel: 'shared'; source: 'structured'; consentActive: true }
  | { type: 'common_ground'; vessel: 'shared'; source: 'structured' }
  | { type: 'agreement'; vessel: 'shared'; source: 'structured' }
  | { type: 'micro_experiment'; vessel: 'shared'; source: 'structured' }

  // Global queries (Stage 4 only)
  | { type: 'experiment_suggestion'; vessel: 'global'; source: 'vector' };

// Validation: query must match schema AND pass stage contract
function isValidQuery(query: RetrievalQuery, stage: number): boolean {
  const matchesSchema = isRetrievalQuery(query);  // Type guard
  const passesContract = validateStageContract(query, stage);
  return matchesSchema && passesContract;
}
```

### Small Model Schema Enforcement

The retrieval planner (Claude 3.5 Haiku) outputs JSON that must conform to `RetrievalQuery[]`. This is enforced through:

**1. Structured Output Prompting**

```
Output a JSON array of retrieval queries. Each query MUST match one of these exact shapes:
- { "type": "session_metadata", "source": "metadata" }
- { "type": "user_event", "vessel": "user", "source": "structured"|"vector", "userId": "<current_user_id>" }
...

Do NOT invent new query types. If uncertain, output an empty array [].
```

**2. Runtime Validation with Zod**

```typescript
import { z } from 'zod';

const RetrievalQuerySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session_metadata'), source: z.literal('metadata') }),
  z.object({ type: z.literal('user_event'), vessel: z.literal('user'), source: z.enum(['structured', 'vector', 'metadata']), userId: z.string() }),
  // ... all other valid query shapes
]);

function parseRetrievalPlan(rawOutput: string): RetrievalQuery[] {
  try {
    const parsed = JSON.parse(rawOutput);
    return z.array(RetrievalQuerySchema).parse(parsed);
  } catch (e) {
    // Schema validation failed - log for monitoring, use fallback
    logger.warn('Retrieval plan schema violation', { rawOutput, error: e });
    return []; // Empty retrieval = minimal context bundle
  }
}
```

**3. Fallback Strategy**

When the small model outputs invalid queries:

| Failure Mode | Detection | Fallback |
|--------------|-----------|----------|
| Malformed JSON | JSON.parse throws | Empty retrieval (minimal context) |
| Unknown query type | Zod discriminatedUnion fails | Filter out invalid, keep valid |
| Wrong userId | Stage contract validation | Reject that query, keep others |
| All queries invalid | Empty valid set | Minimal context bundle (current message only) |

**4. Monitoring and Tuning**

Schema violations are logged with full context for prompt tuning:

```typescript
if (validQueries.length < attemptedQueries.length) {
  metrics.increment('retrieval.schema_violations', {
    stage,
    rejected: attemptedQueries.length - validQueries.length,
    total: attemptedQueries.length
  });
}
```

**Target**: < 1% schema violation rate. If exceeded, the Haiku prompt needs adjustment.

## Context Bundles (What the Model Sees)

All prompts receive pre-assembled, stage-scoped bundles. Every field must be tagged with:
- **source** (`user|shared|global`)
- **provenance** (object type + id, createdAt)
- **consent_state** (active/revoked/not_applicable)
- **stage_scope** (which stage produced it)

| Stage | Bundle Fields (required shape) |
|-------|--------------------------------|
| Stage 0 | `session_metadata`, `relationship_metadata`, `session_outcomes` (structured, no vectors) |
| Stage 1 | `messages` (current session, user-only), `emotional_readings` (user-only), `prior_themes` (optional: user-only, same relationship, ≤3 bullets, summarizer = deterministic), `conversation_context` (recent turn buffer, user-only) |
| Stage 2 | Stage 1 bundle **plus** `shared_partner_content[]` (each item: type TRANSFORMED_NEED or CONSENTED_STATEMENT, content, consentActive true, transformed true, sourceUserId - no raw partner venting), `empathy_draft` (user-authored), `phase` |
| Stage 3 | Confirmed `user_needs[]`, `synthesized_needs[]` (derived only from user content; marked `model_generated: true`), `clarification_needed[]`, optional `partner_needs[]` (from shared vessel, consentActive true), `common_ground[]` (derived) |
| Stage 4 | `common_ground[]`, `strategies[]` (unattributed pool), `user_rankings` (private until both submit), `partner_rankings` (unlock after both submit), `agreements[]`, `micro_experiments[]` (structured only), `global_suggestions[]` (vector-derived, must be labeled `source: global_library`) |
| Emotional Support (any stage) | `intensity`, `trend`, `recent_message` (user-only). **No recall contexts injected** when `MemoryIntent=avoid_recall`. |

**Assembler Rules**
- Reject any field lacking provenance or consent metadata.
- Strip AI Synthesis artifacts; only their user-confirmed outputs may appear.
- Enforce per-stage bundle composition; cross-stage fields must not bleed between stages.
- Log the final injected bundle for audit.

### Shared Vessel Consent Semantics

**Invariant**: All objects stored in Shared Vessel are either:
- **(a) Directly consented** (`ConsentedContent`) - requires `consentActive: true` check at query time
- **(b) Derived from consented inputs** (`Agreement`, `CommonGround`) - safe to retrieve without additional consent checks because they are only created after consent gates are satisfied

This explains why `agreement` and `common_ground` queries don't have `consentActive` fields - they are inherently safe by construction.

---

## Stage 0: Onboarding

**Purpose**: Establish trust and commitment to the process.

### Retrieval Contract

| Category | Access |
|----------|--------|
| **ALLOWED** | User's own previous session metadata (counts, dates, completion status) |
| **ALLOWED** | User's own previous session outcomes (agreed artifacts, not raw content) |
| **ALLOWED** | Relationship metadata (when created, session count) |
| **FORBIDDEN** | Partner's data of any kind |
| **FORBIDDEN** | Any User Vessel raw content (events, emotions, needs) |
| **REQUIRES** | Active session with both users |
| **VECTOR SCOPE** | None |

### Rationale

Stage 0 is about consent and commitment. Only metadata and outcomes from prior sessions are allowed - never raw content from any User Vessel.

```typescript
// Stage 0 retrieval validation
function validateStage0Retrieval(query: RetrievalQuery): boolean {
  return query.type === 'session_metadata'
      || query.type === 'relationship_metadata'
      || query.type === 'session_outcomes';  // Agreed artifacts only, not raw content
}
```

---

## Stage 1: The Witness

**Purpose**: Deep reflection and feeling heard. See [Stage 1 Documentation](../../stages/stage-1-witness.md).

### Retrieval Contract

| Category | Access |
|----------|--------|
| **ALLOWED** | Current user's own raw input (this session) |
| **ALLOWED** | Current user's emotional readings |
| **ALLOWED** | Current user's own User Vessel content from prior sessions (same relationship only) |
| **FORBIDDEN** | Partner's data of any kind |
| **FORBIDDEN** | Shared Vessel content |
| **FORBIDDEN** | AI Synthesis Map |
| **REQUIRES** | User is the data owner |
| **VECTOR SCOPE** | User's own content only (for continuity) |

### Rationale

Stage 1 is about being witnessed. The AI can only see what the current user shares. Partner isolation is absolute.

**Prior sessions scope**: Limited to the current user's own User Vessel content within the same relationship. This explicitly excludes:
- Any partner data from prior sessions
- Any Shared Vessel content from prior sessions
- Any AI Synthesis from prior sessions

```typescript
// Stage 1 retrieval validation
function validateStage1Retrieval(
  query: RetrievalQuery,
  currentUserId: string
): boolean {
  // Must be user's own data (guard for queries that have userId)
  if ('userId' in query && query.userId !== currentUserId) return false;

  // No shared vessel access
  if ('vessel' in query && query.vessel === 'shared') return false;

  // Note: AI Synthesis is already unrepresentable by schema (no 'ai_synthesis' source type)

  return true;
}
```

### Vector Search Rules

```sql
-- ALLOWED: Find similar moments in user's own history (this relationship)
-- Key by (relationshipId, userId) so prior sessions are available
SELECT ue.*
FROM "UserEvent" ue
JOIN "UserVessel" uv ON ue."vesselId" = uv.id
JOIN "Session" s ON uv."sessionId" = s.id
WHERE uv."userId" = current_setting('app.actor_id', true)
  AND s."relationshipId" = (SELECT "relationshipId" FROM "Session" WHERE id = current_setting('app.current_session_id', true))
  AND ue.embedding <=> $queryEmbedding < 0.3;

-- FORBIDDEN: Any query touching partner's data
-- RLS policy will return zero rows even if attempted
```

---

## Stage 2: Perspective Stretch

**Purpose**: Build empathy for partner's perspective. See [Stage 2 Documentation](../../stages/stage-2-perspective-stretch.md).

### Retrieval Contract

| Category | Access |
|----------|--------|
| **ALLOWED** | Current user's own data (all) |
| **ALLOWED** | Shared Vessel - consented content only |
| **ALLOWED** | Partner's consented reflections addressed to current user (Shared Vessel only) |
| **FORBIDDEN** | Partner's raw venting (User Vessel) |
| **FORBIDDEN** | AI Synthesis Map directly |
| **FORBIDDEN** | Non-consented partner data |
| **REQUIRES** | Content in Shared Vessel has active consent |
| **VECTOR SCOPE** | User's own + Shared Vessel |

### Rationale

Stage 2 introduces partner awareness through the Consensual Bridge. Only content the partner has explicitly consented to share can be accessed.

```typescript
// Stage 2 retrieval validation
function validateStage2Retrieval(
  query: RetrievalQuery,
  currentUserId: string
): boolean {
  // User Vessel queries: must be current user's own data
  if ('vessel' in query && query.vessel === 'user') {
    return 'userId' in query && query.userId === currentUserId;
  }

  // Shared Vessel queries: allowed if consented content or derived objects
  if ('vessel' in query && query.vessel === 'shared') {
    // consented_content requires consentActive check
    if (query.type === 'consented_content') {
      return 'consentActive' in query && query.consentActive === true;
    }
    // common_ground, agreement are derived from consented inputs - safe
    return true;
  }

  // Metadata queries allowed
  if (query.type === 'session_metadata' || query.type === 'relationship_metadata') {
    return true;
  }

  return false;
}
```

**Note**: Partner data is accessed via Shared Vessel queries (e.g., `consented_content`), not via User Vessel queries with partner's userId. The schema does not allow querying another user's User Vessel.

### Consent Verification

```sql
-- Before retrieving any partner-related content
SELECT cc.id, cc."transformedContent"
FROM "ConsentedContent" cc
JOIN "ConsentRecord" cr ON cc."consentRecordId" = cr.id
WHERE cc."sharedVesselId" = $sharedVesselId
  AND cc."sourceUserId" = $partnerId
  AND cr.decision = 'GRANTED'
  AND cr."revokedAt" IS NULL
  AND cc."consentActive" = true;
```

---

## Stage 3: Need Mapping

**Purpose**: Identify universal needs and find common ground. See [Stage 3 Documentation](../../stages/stage-3-need-mapping.md).

### Retrieval Contract

| Category | Access |
|----------|--------|
| **ALLOWED** | Current user's identified needs |
| **ALLOWED** | Shared Vessel content (consented needs) |
| **ALLOWED** | Common ground candidates |
| **FORBIDDEN** | Partner's raw events |
| **FORBIDDEN** | Non-consented partner needs |
| **REQUIRES** | Needs must be confirmed by user |
| **VECTOR SCOPE** | Needs only (not events) |

### Rationale

Stage 3 works with abstracted needs, not raw events. This protects privacy while enabling common ground discovery.

```typescript
// Stage 3 retrieval validation
function validateStage3Retrieval(
  query: RetrievalQuery,
  currentUserId: string
): boolean {
  // User Vessel need queries: must be current user's own
  if (query.type === 'need' && 'vessel' in query && query.vessel === 'user') {
    return 'userId' in query && query.userId === currentUserId;
  }

  // Shared Vessel queries: common_ground and consented_content allowed
  if ('vessel' in query && query.vessel === 'shared') {
    if (query.type === 'common_ground') return true;  // Derived from consented inputs
    if (query.type === 'consented_content') {
      return 'consentActive' in query && query.consentActive === true;
    }
  }

  // Note: "Partner needs" are accessed via consented_content (need-shaped entries),
  // not via need queries with partner userId. The need type is always vessel: 'user'.

  return false;
}
```

---

## Stage 4: Strategic Repair

**Purpose**: Design and commit to micro-experiments. See [Stage 4 Documentation](../../stages/stage-4-strategic-repair.md).

### Retrieval Contract

| Category | Access |
|----------|--------|
| **ALLOWED** | All Shared Vessel content |
| **ALLOWED** | Confirmed common ground |
| **ALLOWED** | Past agreements (this relationship) |
| **ALLOWED** | Past micro-experiments and outcomes |
| **ALLOWED** | Global Micro-Experiments Library (anonymized suggestions) |
| **FORBIDDEN** | User Vessel raw content (either party) |
| **REQUIRES** | Use structured records for decisions, NOT vector search |
| **VECTOR SCOPE: User Memory** | Forbidden |
| **VECTOR SCOPE: Global Knowledge** | Allowed (for suggestions only) |

### Rationale

Stage 4 is about action, not exploration. Decisions must be based on structured, auditable records.

**Two types of vector search access:**
- **User Memory**: Forbidden - cannot search user's past content to inform agreements
- **Global Knowledge**: Allowed - can search anonymized "Micro-Experiments Library" to suggest ideas when users are stuck

### Global Library Invariants

The Micro-Experiments Library must satisfy these invariants:

1. **No user content without explicit opt-in**: User-authored experiments only enter this library if the user explicitly consents to anonymized contribution
2. **No user embeddings in global index**: Embeddings generated from user content are NEVER mixed into the global library index - only curated/admin-authored content or explicitly contributed anonymized content

```typescript
// Stage 4 retrieval validation
function validateStage4Retrieval(
  query: RetrievalQuery
): boolean {
  // Shared Vessel structured queries
  if ('vessel' in query && query.vessel === 'shared') {
    // Agreements, common ground, consented content
    if (query.type === 'agreement' || query.type === 'common_ground') {
      return true;
    }
    if (query.type === 'consented_content') {
      return 'consentActive' in query && query.consentActive === true;
    }
    // Past experiments from structured Agreement records only (NOT vector search)
    if (query.type === 'micro_experiment') {
      return query.source === 'structured'; // maps to Agreement.type = MICRO_EXPERIMENT with optional proposalId
    }
  }

  // Global Library: vector search for suggestions allowed
  if (query.type === 'experiment_suggestion') {
    return 'vessel' in query
        && query.vessel === 'global'
        && query.source === 'vector';
  }

  return false;
}
```

### Agreement Retrieval (Deterministic Only)

```sql
-- CORRECT: Structured query for agreements
SELECT a.id, a.description, a.status, a."agreedAt"
FROM "Agreement" a
WHERE a."sharedVesselId" = $sharedVesselId
  AND a."agreedByA" = true
  AND a."agreedByB" = true
ORDER BY a."agreedAt" DESC;

-- FORBIDDEN: Vector search for agreement content
-- Never use embedding similarity to find "what was agreed"
```

---

## Cross-Stage Rules

### Universal Constraints

These rules apply to ALL stages:

| Rule | Enforcement |
|------|-------------|
| No partner User Vessel access | Validated at retrieval layer |
| Consent must be active | Checked on every query |
| Revoked content is inaccessible | Filtered by `revokedAt IS NULL` |
| AI Synthesis is internal only | Never exposed in retrieval results |

### Memory Intent Layer

Before any retrieval, determine the intent:

```typescript
type MemoryIntent =
  | 'emotional_validation'  // Stay present, minimal recall
  | 'stage_enforcement'     // No recall, enforce rules
  | 'recall_commitment'     // Full structured retrieval
  | 'offer_continuity'      // Light summary of last session
  | 'avoid_recall';         // Safety mode, no retrieval

function determineMemoryIntent(
  stage: number,
  emotionalIntensity: number,
  userMessage: string
): MemoryIntent {
  // High emotional intensity = avoid deep recall
  if (emotionalIntensity >= 8) return 'avoid_recall';

  // Stage 1 = mostly stay present
  if (stage === 1) return 'emotional_validation';

  // Explicit reference to past agreement
  if (userMessage.includes('we agreed')) return 'recall_commitment';

  // Default by stage
  return getDefaultIntentForStage(stage);
}
```

---

## Implementation Checklist

### Retrieval Layer Must

- [ ] Validate stage before any query
- [ ] Check user ownership for User Vessel queries
- [ ] Verify consent status for Shared Vessel queries
- [ ] Log all retrieval attempts for audit
- [ ] Reject any query that doesn't match contract

### Database Layer Must

- [ ] Index by `vesselId` for fast ownership checks
- [ ] Index by `consentActive` for consent filtering
- [ ] Support `revokedAt IS NULL` filtering efficiently
- [ ] Separate User Vessel and Shared Vessel queries

### AI Layer Must

- [ ] Receive pre-filtered context only
- [ ] Never issue raw database queries
- [ ] Not decide what to retrieve
- [ ] Ground responses in provided context only

---

## Related Documentation

- [Stage 1: The Witness](../../stages/stage-1-witness.md)
- [Stage 2: Perspective Stretch](../../stages/stage-2-perspective-stretch.md)
- [Stage 3: Need Mapping](../../stages/stage-3-need-mapping.md)
- [Stage 4: Strategic Repair](../../stages/stage-4-strategic-repair.md)
- [Vessel Model](../../privacy/vessel-model.md)
- [Consensual Bridge](../../mechanisms/consensual-bridge.md)

[Back to State Machine](./index.md) | [Back to Backend](../index.md)
