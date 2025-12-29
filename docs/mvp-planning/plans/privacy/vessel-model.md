# Vessel Architecture

## The Three Vessels

Meet Without Fear separates data into three distinct containers with different access rules.

```mermaid
flowchart TB
    subgraph Private[Private - User Vessels]
        direction TB
        UV[User Vessel]
        UV1[Only the user sees this]
        UV2[AI reads but does not share]
    end

    subgraph Internal[Internal - AI Synthesis]
        direction TB
        AS[AI Synthesis Map]
        AS1[AI-only access]
        AS2[Powers facilitation]
    end

    subgraph Consensual[Consensual - Shared Vessel]
        direction TB
        SV[Shared Vessel]
        SV1[Both users can see]
        SV2[Requires explicit consent]
    end

    Private -->|AI processes| Internal
    Internal -->|With consent| Consensual
```

## User Vessel (Private)

Each user has their own private vessel containing:

| Content | Description |
|---------|-------------|
| Raw input | Everything the user types or shares |
| Emotions | Barometer readings over time |
| Documents | Uploaded files and references |
| Events | Described situations and history |
| Interpretations | How user views events |
| Boundaries | What user will/wont accept |

### Access Rules

- **User**: Full read access
- **AI**: Full read access (for facilitation)
- **Other party**: No access whatsoever
- **System**: Encrypted storage

### Data Flow In

```mermaid
flowchart LR
    User[User input] --> Process[AI processes]
    Process --> Store[Store in User Vessel]
    Store --> Analyze[AI analyzes internally]
```

## AI Synthesis Map (Internal)

The AI maintains an internal working model:

| Content | Purpose |
|---------|---------|
| Need mapping | Identified needs for each user |
| Conflict patterns | Recurring dynamics |
| Common ground | Potential shared needs |
| Progress tracking | Where each user is in process |

### Access Rules

- **User**: No direct access
- **AI**: Full access
- **Other party**: No access
- **System**: Ephemeral (can be regenerated)

### How It Works

```mermaid
flowchart TD
    UV1[User A Vessel] --> AI[AI Synthesis]
    UV2[User B Vessel] --> AI

    AI --> Patterns[Identify patterns]
    AI --> Needs[Map needs]
    AI --> Common[Find common ground]

    Patterns --> Facilitation[Power facilitation]
    Needs --> Facilitation
    Common --> Facilitation
```

## Shared Vessel (Consensual)

Content visible to both parties, but only with consent.

| Content | How It Gets Here |
|---------|-----------------|
| Identified needs | User consents to share |
| Key concerns | User approves sharing |
| Common ground | Both confirm |
| Agreements | Mutual acceptance |
| Micro-experiments | Joint commitments |

### Access Rules

- **User A**: Full read access
- **User B**: Full read access
- **AI**: Full read/write access
- **System**: Permanent record

### Consent Flow

```mermaid
flowchart TD
    Identify[AI identifies sharable content] --> Transform[Transform for sharing]
    Transform --> Ask[Ask user consent]

    Ask --> Response{User response}
    Response -->|Consent| Add[Add to Shared Vessel]
    Response -->|Deny| Private[Remains private]

    Add --> Visible[Visible to both]
    Add --> Record[Record consent]
```

## Memory Object Structure

### User Memory Object

```
UserMemoryObject {
  user_id: string

  events: [
    {
      id: string
      description: string
      attributed_to: "self" | "other"
      emotions: [string]
      timestamp: datetime
    }
  ]

  emotions: [
    {
      timestamp: datetime
      intensity: 1-10
      context: string
    }
  ]

  needs: [
    {
      need: string
      evidence: [string]
      confirmed: boolean
    }
  ]

  values: [
    {
      value: string
      priority: number
    }
  ]

  documents: [
    {
      id: string
      type: string
      ai_interpretation: string
    }
  ]

  boundaries: [
    {
      boundary: string
      non_negotiable: boolean
    }
  ]

  micro_experiments: [
    {
      id: string
      description: string
      status: "proposed" | "agreed" | "completed"
    }
  ]
}
```

### Shared Memory Object

```
SharedMemoryObject {
  conflict_id: string
  participants: [user_id, user_id]

  consented_content: [
    {
      source_user: user_id
      original_id: string
      transformed_content: string
      consent_timestamp: datetime
      consent_active: boolean
    }
  ]

  common_ground: [
    {
      need: string
      confirmed_by: [user_id, user_id]
      timestamp: datetime
    }
  ]

  agreements: [
    {
      id: string
      description: string
      agreed_by: [user_id, user_id]
      status: string
      follow_up: datetime | null
    }
  ]

  stage_progress: {
    user_a: number
    user_b: number
    current_active: number
  }
}
```

## Data Lifecycle

```mermaid
flowchart TD
    subgraph Creation
        Input[User input] --> Store[Store privately]
    end

    subgraph Processing
        Store --> Analyze[AI analysis]
        Analyze --> Synthesize[Build synthesis]
    end

    subgraph Sharing
        Synthesize --> Identify[Identify sharable]
        Identify --> Consent[Request consent]
        Consent --> Share[Add to shared]
    end

    subgraph Resolution
        Share --> Complete[Session complete]
        Complete --> Archive[Archive or delete]
    end
```

## Privacy Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| No auto-sharing | Every share requires explicit consent |
| Transformation | Raw content is never shared directly |
| Revocability | Users can withdraw consent |
| Transparency | Users can view all shared content |
| Encryption | Data encrypted at rest |
| Attribution | Clear source tracking |

## Viewing What Has Been Shared

Users can review their sharing:

```mermaid
flowchart TB
    subgraph ReviewScreen[My Shared Content]
        Title[What I have shared with Partner]

        Item1[Need: Feeling prioritized - SHARED]
        Item2[Need: Trust - SHARED]
        Item3[Concern: Communication - SHARED]

        Actions[Revoke any item]
    end
```

---

## Related Documents

- [Consensual Bridge](../mechanisms/consensual-bridge.md)
- [System Guardrails](../mechanisms/guardrails.md)
- [User Journey](../overview/user-journey.md)

## Backend Implementation

- [Prisma Schema](../backend/data-model/prisma-schema.md) - Database implementation of the vessel architecture
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md) - Per-stage data access enforcement

---

[Back to Privacy](./index.md) | [Back to Plans](../index.md)
