---
slug: /backend/api/consent
sidebar_position: 9
---

# Consent API

Endpoints for the Consensual Bridge mechanism - controlling what data is shared with partner.

## Core Principle

> Nothing moves from UserVessel to SharedVessel without explicit consent.

See [Consensual Bridge Mechanism](../../mechanisms/consensual-bridge.md) for the full design.

---

## Get Pending Consent Requests

Get consent requests awaiting user decision.

```
GET /api/v1/sessions/:id/consent/pending
```

### Response

```typescript
interface GetPendingConsentsResponse {
  pendingRequests: ConsentRequestDTO[];
}

interface ConsentRequestDTO {
  id: string;
  contentType: ConsentContentType;
  contentDescription: string;

  // Preview of what partner would see
  transformedPreview: string;

  // Reference to original content
  originalContentId: string;
  originalContentSummary: string;
}

enum ConsentContentType {
  IDENTIFIED_NEED = 'IDENTIFIED_NEED',
  EVENT_SUMMARY = 'EVENT_SUMMARY',
  EMOTIONAL_PATTERN = 'EMOTIONAL_PATTERN',
  BOUNDARY = 'BOUNDARY',
  EMPATHY_DRAFT = 'EMPATHY_DRAFT',
  EMPATHY_ATTEMPT = 'EMPATHY_ATTEMPT',
  STRATEGY_PROPOSAL = 'STRATEGY_PROPOSAL'
}
```

### Example Response

```json
{
  "success": true,
  "data": {
    "pendingRequests": [
      {
        "id": "consent_req_001",
        "contentType": "IDENTIFIED_NEED",
        "contentDescription": "Your need for recognition in household tasks",
        "transformedPreview": "Partner has identified a need to feel recognized for their contributions at home.",
        "originalContentId": "need_123",
        "originalContentSummary": "I need to feel like my efforts at home are seen and appreciated..."
      }
    ]
  }
}
```

---

## Decide on Consent Request

Grant or deny a consent request.

```
POST /api/v1/sessions/:id/consent/decide
```

### Request Body

```typescript
interface DecideConsentRequest {
  consentRequestId: string;
  decision: 'GRANTED' | 'DENIED';

  // Optional: edit transformed content before sharing
  editedContent?: string;
}
```

### Response

```typescript
interface DecideConsentResponse {
  recorded: boolean;
  consentRecord: ConsentRecordDTO;

  // If granted, the shared content
  sharedContent?: ConsentedContentDTO;
}
```

### Example: Granting with Edit

```bash
curl -X POST /api/v1/sessions/sess_abc123/consent/decide \
  -H "Authorization: Bearer <token>" \
  -d '{
    "consentRequestId": "consent_req_001",
    "decision": "GRANTED",
    "editedContent": "I have a need to feel recognized for my contributions at home."
  }'
```

```json
{
  "success": true,
  "data": {
    "recorded": true,
    "consentRecord": {
      "id": "consent_rec_001",
      "contentType": "IDENTIFIED_NEED",
      "decision": "GRANTED",
      "decidedAt": "2024-01-16T17:30:00Z",
      "revokedAt": null,
      "contentDescription": "Your need for recognition in household tasks"
    },
    "sharedContent": {
      "id": "shared_001",
      "sourceUserId": "user_456",
      "transformedContent": "I have a need to feel recognized for my contributions at home.",
      "consentedAt": "2024-01-16T17:30:00Z",
      "consentActive": true
    }
  }
}
```

### Transformation

Content is **always transformed** before sharing:

| Original (Private) | Transformed (Shared) |
|--------------------|----------------------|
| "They never help with anything!" | Need for support with household tasks |
| "I'm so angry when they ignore me" | Need to feel heard and acknowledged |
| Raw emotional venting | Abstracted need statement |

The AI generates the transformation. Users can edit before sharing.

---

## Revoke Consent

Revoke previously granted consent.

```
POST /api/v1/sessions/:id/consent/revoke
```

### Request Body

```typescript
interface RevokeConsentRequest {
  consentRecordId: string;
}
```

### Response

```typescript
interface RevokeConsentResponse {
  revoked: boolean;
  revokedAt: string;
}
```

### Side Effects

1. `ConsentRecord.revokedAt` set to current timestamp
2. `ConsentedContent.consentActive` set to false
3. Partner can no longer access this content
4. Content is **not deleted** - just marked inactive
5. Derived objects become stale (see Stale Data Handling below)

### Important Notes

- Revocation is **immediate** - partner loses access on next request
- Content already seen by partner cannot be "unseen"
- Revocation is recorded in audit trail

---

## Stale Data Handling

When consent is revoked, derived objects (CommonGround, Agreements) may reference now-inaccessible content. Meet Without Fear uses a **check-on-read** pattern, not background recomputation.

### Why Check-on-Read (Not Background Jobs)

| Approach | Pros | Cons |
|----------|------|------|
| **Background recomputation** | Data always fresh | Complex job infrastructure, race conditions, delayed consistency |
| **Check-on-read** | Simple, immediate, deterministic | Slight read-time overhead |

For Meet Without Fear, **deterministic retrieval** is critical (per [Retrieval Contracts](../state-machine/retrieval-contracts.md)). Check-on-read guarantees:
- Every read reflects current consent state
- No stale data window between revocation and job completion
- Simpler debugging and audit

### Implementation Pattern

**CommonGround Retrieval:**

```typescript
async function getCommonGround(sessionId: string): Promise<CommonGroundItem[]> {
  // Fetch all common ground candidates
  const candidates = await db.commonGround.findMany({
    where: { sessionId },
    include: {
      sourceNeedA: { include: { consentRecord: true } },
      sourceNeedB: { include: { consentRecord: true } },
    },
  });

  // Filter out items where underlying consent was revoked
  return candidates.filter(cg => {
    const aActive = cg.sourceNeedA?.consentRecord?.revokedAt === null;
    const bActive = cg.sourceNeedB?.consentRecord?.revokedAt === null;
    return aActive && bActive;
  });
}
```

**Agreement Stale Flag:**

Agreements are not filtered out (they represent historical decisions) but are flagged:

```typescript
interface AgreementDTO {
  id: string;
  description: string;
  agreedAt: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

  // Stale flag - computed on read
  hasStaleInputs: boolean;
  staleReason?: string;  // "Source strategy consent revoked"
}

async function getAgreement(agreementId: string): Promise<AgreementDTO> {
  const agreement = await db.agreement.findUnique({
    where: { id: agreementId },
    include: { sourceProposal: { include: { consentRecord: true } } },
  });

  const hasStaleInputs = agreement.sourceProposal?.consentRecord?.revokedAt !== null;

  return {
    ...agreement,
    hasStaleInputs,
    staleReason: hasStaleInputs ? 'Source strategy consent revoked' : undefined,
  };
}
```

### UI Treatment of Stale Data

| Object Type | Stale Behavior |
|-------------|----------------|
| **CommonGround** | Hidden from partner; excluded from Stage 4 inputs |
| **Agreement** | Shown with visual indicator; "(based on content no longer shared)" |
| **EmpathyAttempt** | Hidden from partner immediately |
| **StrategyProposal** | Hidden from pool; existing rankings preserved but flagged |

### Performance Consideration

The check-on-read pattern adds a JOIN per query. This is acceptable because:
- Session queries are low-volume (not high-traffic API)
- Consent tables are small (dozens of rows per session, not millions)
- Database indexes on `consentRecordId` and `revokedAt` make checks efficient

```sql
-- Ensure efficient consent checks
CREATE INDEX idx_consent_record_revoked ON "ConsentRecord" ("id", "revokedAt");
CREATE INDEX idx_consented_content_active ON "ConsentedContent" ("consentRecordId", "consentActive");
```

---

## Get Consent History

Get all consent decisions for a session.

```
GET /api/v1/sessions/:id/consent/history
```

### Response

```typescript
interface GetConsentHistoryResponse {
  records: ConsentRecordDTO[];
}
```

---

## When Consent is Required

Consent is requested when the AI determines content should be shared:

| Stage | Trigger | Content Type |
|-------|---------|--------------|
| Stage 2 | Building empathy attempt | EVENT_SUMMARY |
| Stage 2 | Sharing empathy attempt | (handled by empathy endpoints) |
| Stage 3 | Sharing identified needs | IDENTIFIED_NEED |
| Stage 3 | Sharing boundaries | BOUNDARY |

---

## Consent Flow Diagram

```mermaid
flowchart TD
    AI[AI identifies shareable content] --> Request[Create consent request]
    Request --> Pending[Show in pending requests]
    Pending --> UserSees[User sees preview + original]
    UserSees --> Decision{Grant or Deny?}

    Decision -->|Grant| Edit{Edit content?}
    Edit -->|Yes| Transform[User edits transformation]
    Edit -->|No| UseDefault[Use AI transformation]
    Transform --> Store[Store in SharedVessel]
    UseDefault --> Store
    Store --> Notify[Partner can now access]

    Decision -->|Deny| Record[Record denial]
    Record --> Private[Content stays private]

    Store --> Later{Later revoke?}
    Later -->|Yes| Revoke[Revoke consent]
    Revoke --> Inactive[Mark inactive]
    Inactive --> NoAccess[Partner loses access]
```

---

## Retrieval with Consent

When retrieving partner content, consent is verified:

```sql
SELECT cc."transformedContent"
FROM "ConsentedContent" cc
JOIN "ConsentRecord" cr ON cc."consentRecordId" = cr.id
WHERE cc."sharedVesselId" = $sharedVesselId
  AND cc."sourceUserId" = $partnerId
  AND cr.decision = 'GRANTED'
  AND cr."revokedAt" IS NULL
  AND cc."consentActive" = true;
```

See [Retrieval Contracts](../state-machine/retrieval-contracts.md#consent-verification).

---

## Related Documentation

- [Consensual Bridge Mechanism](../../mechanisms/consensual-bridge.md)
- [Stage 2 API](./stage-2.md) - Empathy exchange consent
- [Retrieval Contracts](../state-machine/retrieval-contracts.md)
- [Privacy Model](../../privacy/vessel-model.md)

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
