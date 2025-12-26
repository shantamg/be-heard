# Stage 2: Perspective Stretch

## Purpose

Build genuine empathy by helping each user understand the other persons perspective, needs, and experience.

## AI Goal

- **Demonstrate skilled listening** - give space to share, do not limit options or steer
- Allow venting - residual frustration from Stage 1 is normal, and being heard soothes
- Do not tell users what they are thinking or feeling unless reflecting what they just said
- Guide toward building their best empathy guess about their partner
- Facilitate mutual exchange of empathy attempts (with consent)
- Help refine understanding until both parties feel accurately understood by each other
- Monitor for judgment, attacks, or dismissiveness
- Use Mirror Intervention when needed

## Key Design Principle: Mutual Empathy Exchange

Stage 2 does **not** share partner content automatically. The AI holds partner information confidential until explicit consent is given. This is intentional:

- Immediately sharing the partner's words can trigger defensiveness
- People are more likely to accept perspectives they arrive at themselves
- The goal is for each person to feel understood **by the other person**, not just by the AI
- Venting may still occur - Stage 1 does not always exhaust all frustration

### The Listening Philosophy

When someone wants to be heard, give them space:
- Do not limit their options or steer their responses
- Do not tell them what they are thinking or feeling
- Only reflect back what they just said
- Let them get all the anger out - this serves dual purposes:
  1. Gathering information about their experience
  2. Soothing frustration by being genuinely heard

The AI demonstrates what skilled listening looks like. Focus on listening rather than rushing to answers or the next stage.

## Flow

### Phase 1: Building the Empathy Guess

Each user works independently with the AI to build their best guess at what their partner is experiencing.

```mermaid
flowchart TD
    Enter[Enter Stage 2] --> Space[AI gives space to share]
    Space --> Response{User response}

    Response -->|Venting| Listen[AI listens and reflects]
    Listen --> MoreVent{More to express?}
    MoreVent -->|Yes| Listen
    MoreVent -->|No| Transition[Gently transition to empathy]

    Response -->|Ready for empathy| Imagine[What might partner be feeling?]
    Transition --> Imagine

    Imagine --> Attempt[User builds empathy guess]
    Attempt --> Refine{AI helps refine}
    Refine -->|Judgment detected| Mirror[Mirror Intervention]
    Mirror --> Attempt
    Refine -->|Curious| Deepen[Explore further]
    Deepen --> Attempt
    Refine -->|Solid attempt| Ready[User feels ready to share]

    Ready --> Consent1{Consent to share attempt?}
    Consent1 -->|No| MoreTime[More time to refine]
    MoreTime --> Attempt
    Consent1 -->|Yes| WaitExchange[Wait for partner]
```

### Phase 2: Mutual Exchange

Both parties consent to exchange their empathy attempts.

```mermaid
flowchart TD
    BothReady[Both ready to exchange] --> Exchange[Exchange empathy attempts]

    Exchange --> ReceiveAttempt[User sees partners attempt to understand them]
    ReceiveAttempt --> Feedback{How accurate is this?}

    Feedback -->|Accurate| Validated[Feel understood by partner]
    Feedback -->|Partially| Clarify[Provide feedback to AI]
    Feedback -->|Way off| Clarify

    Clarify --> Consent2{Consent to share feedback?}
    Consent2 -->|Yes| SendFeedback[AI takes feedback to partner]
    Consent2 -->|No| Private[Keep feedback private]

    SendFeedback --> PartnerRevises[Partner revises their attempt]
    PartnerRevises --> ReceiveAttempt

    Validated --> BothValidated{Both feel understood?}
    BothValidated -->|Yes| Complete[Stage 2 complete]
    BothValidated -->|No| WaitPartner[Wait for partner validation]
    WaitPartner --> BothValidated
```

### Optional: AI-Assisted Hints

If a user is stuck or their attempt is significantly off, the AI may offer (with consent) to share a helpful quotation or sentiment from the partner. Details of when this triggers are TBD during implementation.

## Mirror Intervention

When judgment or attack patterns are detected, the AI uses reflection to redirect:

```mermaid
flowchart TD
    Detect[Detect judgment/attack] --> Pause[Pause response]
    Pause --> Reflect[Reflect the feeling back]

    subgraph Example[Example Exchange]
        User[User: They are just happy I am miserable]
        AI[AI: That sounds like a thought born of your own hurt. If you look past your pain for a moment what fear might be driving their behavior?]
    end

    Reflect --> Example
    Example --> Reframe[User reconsiders]
    Reframe --> Continue[Continue with curiosity]
```

See [Mirror Intervention](../mechanisms/mirror-intervention.md) for details.

## What Gets Shared

Nothing is shared without explicit consent. The AI holds all partner information confidential.

| Shared (with consent) | Never shared automatically |
|----------------------|---------------------------|
| User's empathy attempt | Partner's raw words |
| Feedback on accuracy | Venting or accusations |
| Revised attempts | Any content without consent |

The [Consensual Bridge](../mechanisms/consensual-bridge.md) mechanism controls this.

## The Empathy Attempt

Each user builds their best guess at what their partner is experiencing:

```
AI: [After listening] "What do you imagine [Partner] might be
    feeling about this situation?"

User: [Builds their attempt - open-ended, not steered]

AI: [Reflects, helps refine without telling them what to think]
```

**Readiness criteria:**
- User feels they have put together their best guess
- Attempt shows genuine curiosity (not just going through motions)
- User consents to share this attempt with partner

## Receiving Partner's Attempt

Each user sees the other's attempt to understand them - not AI-curated content, but the partner's own words trying to empathize.

### Validation Loop

```mermaid
flowchart TD
    Receive[See partners empathy attempt] --> Check{Does this feel accurate?}
    Check -->|Yes| Validated[Feel understood by partner]
    Check -->|Partially/No| Feedback[Provide feedback]
    Feedback --> Consent{Share feedback with partner?}
    Consent -->|Yes| Send[AI takes feedback to partner]
    Consent -->|No| Private[Keep private]
    Send --> Revise[Partner revises attempt]
    Revise --> Receive
```

The loop continues until:
- The user confirms they feel accurately understood by their partner
- Or the user chooses to proceed

### Why This Matters

This exchange:
- Both parties end up feeling understood **by each other**, not just by the AI
- Creates genuine mutual understanding through iterative effort
- The partner's attempt to understand (even if imperfect) demonstrates care
- Builds foundation for genuine repair in later stages

## Wireframe: Perspective Stretch Interface

### Phase 1: Building Empathy Guess

```mermaid
flowchart TB
    subgraph Screen[Building Your Understanding]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 2: Perspective Stretch]
            Status[Building empathy]
        end

        subgraph Chat[Open Conversation]
            AI1[AI listens and reflects]
            User1[Open text input - full space to share]
            AI2[AI helps build empathy guess]
        end

        subgraph Input[Input Area]
            TextField[Large open text field]
            Send[Send]
        end
    end
```

### Phase 2: Viewing Partner Attempt

```mermaid
flowchart TB
    subgraph Screen[Partners Understanding of You]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 2: Perspective Stretch]
            Status[Reviewing attempt]
        end

        subgraph Attempt[Partner Attempt Card]
            Title[Partners attempt to understand you]
            Content[Their empathy guess in their own words]
        end

        subgraph Response[Your Response]
            TextField[Open text field for feedback]
            Send[Send]
        end
    end
```

## Success Criteria

1. User has built their best empathy guess about partner
2. User has consented to share their attempt
3. User has seen partner's attempt to understand them
4. User feels accurately understood by partner (or chooses to proceed)

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| Repeated judgment in empathy attempt | Persistent Mirror Intervention; explore source of judgment |
| Cannot imagine partner perspective | Give more space; offer (with consent) helpful hint from partner |
| Emotional escalation | Barometer triggers cooling period |
| User tries to skip | Explain gate requirement; offer support |
| Partner attempt feels way off | Facilitate feedback loop; help partner revise |
| Refuses to share empathy attempt | Explore hesitation; acknowledge vulnerability; allow time |

## Data Captured

- Venting content (private, for AI understanding only)
- User's empathy attempt drafts
- Consent decisions
- Feedback on partner's attempt
- Mirror interventions used
- Revision iterations until validation

---

## Related Documents

- [Previous: Stage 1 - The Witness](./stage-1-witness.md)
- [Next: Stage 3 - Need Mapping](./stage-3-need-mapping.md)
- [Mirror Intervention](../mechanisms/mirror-intervention.md)
- [Consensual Bridge](../mechanisms/consensual-bridge.md)

### Backend Implementation

- [Stage 2 API](../backend/api/stage-2.md) - Empathy exchange endpoints
- [Stage 2 Prompt](../backend/prompts/stage-2-perspective.md) - Perspective prompt template
- [Mirror Intervention Prompt](../backend/prompts/mirror-intervention.md)
- [Consent API](../backend/api/consent.md)
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md#stage-2-perspective-stretch)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
