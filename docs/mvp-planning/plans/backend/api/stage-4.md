---
slug: /backend/api/stage-4
sidebar_position: 11
---

# Stage 4 API: Strategic Repair

Endpoints for collaborative strategy generation, ranking, and agreement documentation.

## Overview

Stage 4 is **sequential** (unlike stages 1-3 which are parallel). Both users must complete Stage 3 before either can enter Stage 4.

Key design:
- Both users propose strategies independently
- Strategies are presented as an **unlabeled pool**
- Users **privately rank** their preferences
- Overlap is revealed together

---

## Get Strategy Pool

Get all proposed strategies (unlabeled).

```
GET /api/v1/sessions/:id/strategies
```

### Response

```typescript
interface GetStrategiesResponse {
  strategies: StrategyDTO[];
  aiSuggestionsAvailable: boolean;
  phase: StrategyPhase;
}

interface StrategyDTO {
  id: string;
  description: string;
  needsAddressed: string[];      // Which common ground needs
  duration: string | null;       // e.g., "1 week"
  measureOfSuccess: string | null;
  // Note: NO source attribution
}

enum StrategyPhase {
  COLLECTING = 'COLLECTING',     // Users still adding
  RANKING = 'RANKING',           // Both ready to rank
  REVEALING = 'REVEALING',       // Revealing overlap
  NEGOTIATING = 'NEGOTIATING',   // Working toward agreement
  AGREED = 'AGREED',             // Agreement reached
}
```

### Example Response

```json
{
  "success": true,
  "data": {
    "strategies": [
      {
        "id": "strat_001",
        "description": "Have a 10-minute phone-free conversation at dinner for 5 days",
        "needsAddressed": ["Connection"],
        "duration": "5 days",
        "measureOfSuccess": "Did we do it? How did it feel?"
      },
      {
        "id": "strat_002",
        "description": "Say one specific thing I appreciate each morning for a week",
        "needsAddressed": ["Recognition"],
        "duration": "1 week",
        "measureOfSuccess": "Did we remember? Did it feel genuine?"
      },
      {
        "id": "strat_003",
        "description": "Use a pause signal when conversations get heated",
        "needsAddressed": ["Safety"],
        "duration": "Ongoing",
        "measureOfSuccess": "Did we use it? Did it help?"
      }
    ],
    "aiSuggestionsAvailable": true,
    "phase": "COLLECTING"
  }
}
```

**Privacy note**: Strategies are never attributed to their source. Both parties see the same unlabeled list.

---

## Propose Strategy

Add a new strategy to the pool.

```
POST /api/v1/sessions/:id/strategies
```

### Request Body

```typescript
interface ProposeStrategyRequest {
  description: string;
  needsAddressed?: string[];
  duration?: string;
  measureOfSuccess?: string;
}
```

### Response

```typescript
interface ProposeStrategyResponse {
  strategy: StrategyDTO;
  totalStrategies: number;
}
```

### AI Refinement

After submission, AI may suggest refinements:

```typescript
interface StrategyRefinementSuggestion {
  original: string;
  refined: string;
  reason: string;  // e.g., "Made more specific and time-bounded"
}
```

---

## Request AI Suggestions

Request AI-generated strategy suggestions.

```
POST /api/v1/sessions/:id/strategies/suggest
```

### Request Body

```typescript
interface RequestSuggestionsRequest {
  count?: number;  // Default: 3
  focusNeeds?: string[];  // Which needs to focus on
}
```

### Response

```typescript
interface RequestSuggestionsResponse {
  suggestions: StrategyDTO[];
  source: 'AI_GENERATED';
}
```

### Source Constraints

AI suggestions are generated from:
- Common ground needs (Shared Vessel)
- Global Micro-Experiments Library (anonymized)

**Never** from user memory (Retrieval Contract enforced).

---

## Mark Ready to Rank

Indicate readiness to move to ranking phase.

```
POST /api/v1/sessions/:id/strategies/ready
```

### Response

```typescript
interface MarkReadyResponse {
  ready: boolean;
  partnerReady: boolean;
  canStartRanking: boolean;
}
```

### Side Effects

When both ready:
- Phase changes to `RANKING`
- Strategy pool is locked (no new additions)
- Partner notified

---

## Submit Ranking

Submit private ranking of strategies.

```
POST /api/v1/sessions/:id/strategies/rank
```

### Request Body

```typescript
interface SubmitRankingRequest {
  rankings: {
    strategyId: string;
    rank: number;  // 1 = top choice
  }[];
}
```

### Response

```typescript
interface SubmitRankingResponse {
  submitted: boolean;
  partnerSubmitted: boolean;
  awaitingReveal: boolean;
}
```

### Privacy

Rankings are **completely private** until both submit. Neither party can see the other's choices during ranking.

---

## Get Overlap

Get revealed overlap after both submit rankings.

```
GET /api/v1/sessions/:id/strategies/overlap
```

### Response

```typescript
interface GetOverlapResponse {
  overlap: StrategyDTO[];           // Both parties ranked highly
  myTopPicks: StrategyDTO[];        // My top 3
  partnerTopPicks: StrategyDTO[];   // Partner's top 3
  noOverlap: boolean;
}
```

### Example Response (With Overlap)

```json
{
  "success": true,
  "data": {
    "overlap": [
      {
        "id": "strat_002",
        "description": "Say one specific thing I appreciate each morning for a week",
        "needsAddressed": ["Recognition"],
        "duration": "1 week",
        "measureOfSuccess": "Did we remember? Did it feel genuine?"
      }
    ],
    "myTopPicks": [
      {"id": "strat_002", "description": "..."},
      {"id": "strat_001", "description": "..."},
      {"id": "strat_003", "description": "..."}
    ],
    "partnerTopPicks": [
      {"id": "strat_002", "description": "..."},
      {"id": "strat_003", "description": "..."},
      {"id": "strat_004", "description": "..."}
    ],
    "noOverlap": false
  }
}
```

---

## Create Agreement

Formalize agreement on a micro-experiment.

```
POST /api/v1/sessions/:id/agreements
```

### Request Body

```typescript
interface CreateAgreementRequest {
  strategyId?: string;            // From existing strategy
  customDescription?: string;     // Or custom agreement
  duration: string;
  measureOfSuccess: string;
  followUpDate?: string;          // ISO 8601
}
```

### Response

```typescript
interface CreateAgreementResponse {
  agreement: AgreementDTO;
  awaitingPartnerConfirmation: boolean;
}

interface AgreementDTO {
  id: string;
  description: string;
  duration: string;
  measureOfSuccess: string;
  status: AgreementStatus;
  agreedByMe: boolean;
  agreedByPartner: boolean;
  agreedAt: string | null;
  followUpDate: string | null;
}

enum AgreementStatus {
  PROPOSED = 'PROPOSED',
  AGREED = 'AGREED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}
```

---

## Confirm Agreement

Confirm proposed agreement (partner response).

```
POST /api/v1/sessions/:id/agreements/:agreementId/confirm
```

### Request Body

```typescript
interface ConfirmAgreementRequest {
  confirmed: boolean;
  modification?: string;  // If suggesting change
}
```

### Response

```typescript
interface ConfirmAgreementResponse {
  agreement: AgreementDTO;
  sessionCanResolve: boolean;  // True if at least one agreement confirmed
}
```

---

## Resolve Session

Mark session as resolved after successful agreement.

```
POST /api/v1/sessions/:id/resolve
```

### Response

```typescript
interface ResolveSessionResponse {
  resolved: boolean;
  resolvedAt: string;
  agreements: AgreementDTO[];
  followUpScheduled: boolean;
}
```

### Side Effects

- Session status changes to `RESOLVED`
- Both parties notified
- If follow-up scheduled, reminder queued

---

## Stage 4 Gate Requirements

To resolve session:

| Gate | Requirement |
|------|-------------|
| `proposalsCreated` | At least one strategy in pool |
| `proposalsRanked` | Both users submitted rankings |
| `agreementReached` | At least one agreement confirmed by both |
| `followUpScheduled` | Optional: follow-up date set |

---

## Stage 4 Flow

```mermaid
flowchart TD
    Enter[Enter Stage 4] --> Collect[Both propose strategies]
    Collect --> Pool[Strategies in unlabeled pool]
    Pool --> MoreIdeas{Want more ideas?}
    MoreIdeas -->|Yes| AISuggest[AI generates suggestions]
    AISuggest --> Pool
    MoreIdeas -->|No| Ready[Both mark ready]
    Ready --> Rank[Private ranking]
    Rank --> BothRanked{Both ranked?}
    BothRanked -->|No| Wait[Wait for partner]
    BothRanked -->|Yes| Reveal[Reveal overlap]
    Reveal --> HasOverlap{Overlap exists?}
    HasOverlap -->|Yes| Discuss[Discuss overlapping options]
    HasOverlap -->|No| Negotiate[Explore differences]
    Negotiate --> MoreIdeas
    Discuss --> Agree[Create agreement]
    Agree --> PartnerConfirm{Partner confirms?}
    PartnerConfirm -->|No| Modify[Modify and re-propose]
    Modify --> Agree
    PartnerConfirm -->|Yes| Resolve[Resolve session]
```

---

## Retrieval Contract

In Stage 4, the API enforces these retrieval rules:

| Allowed | Forbidden |
|---------|-----------|
| All Shared Vessel content | User Vessel raw content |
| Confirmed common ground | Vector search on user memory |
| Past agreements | Any retrieval for decision-making |
| Global Library (vector) | - |

See [Retrieval Contracts: Stage 4](../state-machine/retrieval-contracts.md#stage-4-strategic-repair).

---

## Related Documentation

- [Stage 4: Strategic Repair](../../stages/stage-4-strategic-repair.md)
- [Stage 4 Prompt](../prompts/stage-4-repair.md)
- [Global Library](../data-model/prisma-schema.md#global-library-stage-4-suggestions)

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
