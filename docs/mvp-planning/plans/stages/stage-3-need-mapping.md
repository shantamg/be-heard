# Stage 3: Need Mapping

## Purpose

Transition from surface-level stories and complaints to identifying universal human needs that both parties share.

## AI Goal

- Synthesize underlying needs from each users sharing
- Translate complaints and positions into needs language
- Identify at least one common-ground need
- Reframe accusations into I-statements and needs

## Visual Design: Gentle and Soft

Stage 3 uses **softer colors** to create a gentle, calming feel that supports the reflective nature of this work:

- Soft blues and teals for need cards
- Gentle greens for common ground elements
- Rounded corners and generous padding
- **Side-by-side layout is key** - users see both sets of needs simultaneously

The visual juxtaposition of both parties' needs creates the insight moment where users recognize shared humanity.

## Flow

```mermaid
flowchart TD
    Enter[Enter Stage 3] --> Intro[AI introduces needs work]
    Intro --> Review[Review what has been shared]

    subgraph Translation[Complaint to Need Translation]
        C1[Surface complaint] --> E1[Underlying emotion]
        E1 --> N1[Core need]
    end

    Review --> Translation
    Translation --> Present[Present needs map to user]

    Present --> Validate{User validates?}
    Validate -->|Adjustments| Refine[Refine understanding]
    Refine --> Present
    Validate -->|Confirmed| Compare[Compare both maps]

    Compare --> Search[Search for overlap]
    Search --> Found{Common need?}

    Found -->|Yes| Highlight[Highlight shared need]
    Found -->|Not obvious| Deeper[Dig to deeper needs]
    Deeper --> Search

    Highlight --> Confirm{Both confirm?}
    Confirm -->|Yes| Complete[Stage 3 complete]
    Confirm -->|Disagreement| Explore[Explore the difference]
    Explore --> Search

    Complete --> Advance[Advance to Stage 4]
```

## From Stories to Needs

```mermaid
flowchart LR
    subgraph Stories[Surface Level]
        S1[They never listen to me]
        S2[They always criticize]
        S3[They work too much]
    end

    subgraph Emotions[Emotional Layer]
        E1[Feeling unimportant]
        E2[Feeling inadequate]
        E3[Feeling lonely]
    end

    subgraph Needs[Universal Needs]
        N1[Need for recognition]
        N2[Need for acceptance]
        N3[Need for connection]
    end

    S1 --> E1 --> N1
    S2 --> E2 --> N2
    S3 --> E3 --> N3
```

## Universal Needs Framework

The AI maps to universal human needs:

| Category | Example Needs |
|----------|---------------|
| **Safety** | Security, stability, predictability, protection |
| **Connection** | Belonging, intimacy, closeness, understanding |
| **Autonomy** | Freedom, choice, independence, self-determination |
| **Recognition** | Appreciation, acknowledgment, respect, being seen |
| **Meaning** | Purpose, contribution, growth, significance |
| **Fairness** | Justice, equality, reciprocity, balance |

## Accusation Reframing

The AI transforms accusatory language:

| Original Statement | Reframed to Needs |
|--------------------|-------------------|
| "You never help around the house" | "I have a need for partnership and shared responsibility" |
| "You always take their side" | "I need to feel like you are on my team" |
| "You care more about work than me" | "I need quality time and to feel prioritized" |

## Wireframe: Need Mapping Interface

```mermaid
flowchart TB
    subgraph Screen[Need Mapping Screen]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 3: Need Mapping]
            Status[Finding common ground]
        end

        subgraph YourNeeds[Your Identified Needs]
            Title1[What you need most]
            Need1[Safety - feeling secure in the relationship]
            Need2[Recognition - being seen for your efforts]
            Edit[Adjust these?]
        end

        subgraph CommonGround[Common Ground]
            Title2[Shared Needs Discovered]
            Shared1[Both need: Safety]
            Shared2[Both need: Connection]
            Insight[You both want to feel secure together]
        end

        subgraph Chat[Exploration Chat]
            AI1[AI explores and refines needs]
            User1[User clarifies]
        end

        subgraph Confirm[Confirmation]
            Question[Does this capture what you need?]
            Yes[Yes this is right]
            Adjust[I want to adjust]
        end
    end
```

## Success Criteria

At least one common-ground need is identified and confirmed by both parties.

## Common Ground Discovery

```mermaid
flowchart TD
    subgraph UserA[User A Needs]
        A1[Safety]
        A2[Recognition]
        A3[Autonomy]
    end

    subgraph UserB[User B Needs]
        B1[Connection]
        B2[Safety]
        B3[Fairness]
    end

    A1 --- Common{Common: Safety}
    B2 --- Common

    Common --> Highlight[Both need Safety]
    Highlight --> Build[Build on this foundation]
```

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| No obvious overlap | Dig deeper - surface needs often share deeper roots |
| User rejects need synthesis | Refine and re-present; ask clarifying questions |
| Accusatory language persists | Apply reframing; return to Stage 2 if needed |
| One user dominates narrative | Balance attention; ensure both needs are mapped |

## Data Captured

- Identified needs for each user
- Common ground discovered
- Reframing transformations applied
- Confirmation of accuracy

---

## Related Documents

- [Previous: Stage 2 - Perspective Stretch](./stage-2-perspective-stretch.md)
- [Next: Stage 4 - Strategic Repair](./stage-4-strategic-repair.md)
- [System Guardrails](../mechanisms/guardrails.md)

### Backend Implementation

- [Stage 3 API](../backend/api/stage-3.md) - Need synthesis and common ground endpoints
- [Stage 3 Prompt](../backend/prompts/stage-3-needs.md) - Need mapping prompt template
- [Need Extraction Prompt](../backend/prompts/need-extraction.md) - AI need synthesis
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md#stage-3-need-mapping)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
