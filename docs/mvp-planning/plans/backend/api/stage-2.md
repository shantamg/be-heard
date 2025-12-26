---
slug: /backend/api/stage-2
sidebar_position: 7
---

# Stage 2 API: Perspective Stretch

Endpoints for building and exchanging empathy attempts.

## Overview

Stage 2 has two phases:

1. **Phase 1: Building** - User works with AI to build their empathy guess about partner
2. **Phase 2: Exchange** - Users exchange empathy attempts and validate each other

---

## Phase 1: Building Empathy

### Save Empathy Draft

Save or update the user's empathy attempt draft.

```
POST /api/v1/sessions/:id/empathy/draft
```

### Request Body

```typescript
interface SaveEmpathyDraftRequest {
  content: string;  // The empathy attempt text
}
```

### Response

```typescript
interface SaveEmpathyDraftResponse {
  draft: EmpathyDraftDTO;
  readyToShare: boolean;  // AI assessment if draft shows genuine curiosity
}

interface EmpathyDraftDTO {
  id: string;
  content: string;
  updatedAt: string;
  version: number;
}
```

### Example

```bash
curl -X POST /api/v1/sessions/sess_abc123/empathy/draft \
  -H "Authorization: Bearer <token>" \
  -d '{
    "content": "I think they might be feeling overwhelmed and scared that our relationship is falling apart. Maybe they feel like nothing they do is good enough."
  }'
```

```json
{
  "success": true,
  "data": {
    "draft": {
      "id": "draft_001",
      "content": "I think they might be feeling overwhelmed and scared...",
      "updatedAt": "2024-01-16T17:00:00Z",
      "version": 1
    },
    "readyToShare": true
  }
}
```

---

### Get Empathy Draft

Get the current empathy draft.

```
GET /api/v1/sessions/:id/empathy/draft
```

### Response

```typescript
interface GetEmpathyDraftResponse {
  draft: EmpathyDraftDTO | null;
  canConsent: boolean;
  alreadyConsented: boolean;
}
```

---

### Consent to Share Empathy

Consent to share the empathy attempt with partner.

```
POST /api/v1/sessions/:id/empathy/consent
```

### Request Body

```typescript
interface ConsentToShareEmpathyRequest {
  draftId: string;
  // Optional: user can edit before sharing
  finalContent?: string;
}
```

### Response

```typescript
interface ConsentToShareEmpathyResponse {
  consented: boolean;
  consentedAt: string;
  waitingForPartner: boolean;

  // If partner already consented, their attempt is returned
  partnerAttempt?: EmpathyAttemptDTO;
}
```

### Side Effects

1. Draft becomes immutable (no more edits)
2. ConsentRecord created
3. Content moved to SharedVessel (as ConsentedContent)
4. If partner already consented, both receive each other's attempts
5. Partner notified via Ably

---

## Phase 2: Exchange

### Get Partner's Empathy Attempt

Get the partner's empathy attempt (after both have consented).

```
GET /api/v1/sessions/:id/empathy/partner
```

### Response

```typescript
interface GetPartnerEmpathyResponse {
  // Null if partner hasn't consented yet
  attempt: EmpathyAttemptDTO | null;
  waitingForPartner: boolean;

  // If validated, show validation status
  validated: boolean;
  validatedAt: string | null;
}

interface EmpathyAttemptDTO {
  id: string;
  sourceUserId: string;
  content: string;  // Partner's attempt to understand you
  sharedAt: string;
}
```

### Errors

| Code | When |
|------|------|
| `CONSENT_REQUIRED` | Current user hasn't consented to share yet |
| `PARTNER_NOT_READY` | Partner hasn't consented to share yet |

---

### Validate Partner's Attempt

Provide feedback on how accurate partner's attempt is.

```
POST /api/v1/sessions/:id/empathy/validate
```

### Request Body

```typescript
interface ValidateEmpathyRequest {
  validated: boolean;  // true = "feels accurate", false = "needs refinement"
  feedback?: string;   // If not validated, what's missing
  consentToShareFeedback?: boolean;  // Allow feedback to be shared with partner
}
```

### Response

```typescript
interface ValidateEmpathyResponse {
  validated: boolean;
  validatedAt: string | null;

  // If feedback shared, partner can revise
  feedbackShared: boolean;
  awaitingRevision: boolean;

  // Gate status
  canAdvance: boolean;
  partnerValidated: boolean;
}
```

### Example: Validation with Feedback

```bash
curl -X POST /api/v1/sessions/sess_abc123/empathy/validate \
  -H "Authorization: Bearer <token>" \
  -d '{
    "validated": false,
    "feedback": "Close, but it is not so much fear as exhaustion. I feel like I have been carrying everything alone.",
    "consentToShareFeedback": true
  }'
```

```json
{
  "success": true,
  "data": {
    "validated": false,
    "validatedAt": null,
    "feedbackShared": true,
    "awaitingRevision": true,
    "canAdvance": false,
    "partnerValidated": false
  }
}
```

### Revision Loop

If feedback is shared:
1. Partner receives notification with feedback
2. Partner can revise their empathy attempt
3. User receives revised attempt
4. User can validate again

---

## Stage 2 Gate Requirements

To advance from Stage 2 to Stage 3:

| Gate | Requirement |
|------|-------------|
| `empathyAttemptCreated` | User has created an empathy attempt |
| `empathyAttemptConsentedToShare` | User consented to share it |
| `receivedPartnerAttempt` | Partner has shared their attempt |
| `validatedPartnerAttempt` | User validated partner's attempt as accurate |

**Note**: Both users must complete validation for either to advance.

---

## Stage 2 Flow

```mermaid
flowchart TD
    subgraph Phase1[Phase 1: Building]
        Enter[Enter Stage 2] --> Chat[Chat with AI]
        Chat --> Draft[Save empathy draft]
        Draft --> Refine{Ready to share?}
        Refine -->|No| Chat
        Refine -->|Yes| Consent[Consent to share]
    end

    subgraph Phase2[Phase 2: Exchange]
        Consent --> Wait{Partner ready?}
        Wait -->|No| WaitState[Waiting state]
        WaitState --> Wait
        Wait -->|Yes| Receive[Receive partner attempt]
        Receive --> Validate{Accurate?}
        Validate -->|No| Feedback[Share feedback]
        Feedback --> AwaitRevision[Await revision]
        AwaitRevision --> Receive
        Validate -->|Yes| Confirmed[Mark validated]
    end

    Confirmed --> PartnerValidated{Partner validated?}
    PartnerValidated -->|No| WaitValidation[Wait for partner]
    PartnerValidated -->|Yes| Advance[Advance to Stage 3]
```

---

## Retrieval Contract

In Stage 2, the API enforces these retrieval rules:

| Allowed | Forbidden |
|---------|-----------|
| User's own data (all) | Partner's raw venting (User Vessel) |
| Shared Vessel (consented content only) | AI Synthesis Map directly |
| Partner's consented reflections | Non-consented partner data |

See [Retrieval Contracts: Stage 2](../state-machine/retrieval-contracts.md#stage-2-perspective-stretch).

---

## Related Documentation

- [Stage 2: Perspective Stretch](../../stages/stage-2-perspective-stretch.md) - Full stage documentation
- [Consensual Bridge](../../mechanisms/consensual-bridge.md) - Consent mechanism
- [Mirror Intervention](../../mechanisms/mirror-intervention.md) - Handling judgment
- [Consent API](./consent.md) - General consent endpoints

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
