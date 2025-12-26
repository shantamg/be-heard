# Stage 1: The Witness

## Purpose

Provide each user with the experience of being deeply and fully heard by the AI, without interruption or judgment.

## AI Goal

- Create a safe space for venting and expression
- Reflect back what the user shares with accuracy and empathy
- Help users articulate feelings they may not have words for
- Continue until the user genuinely feels heard

## Open-Ended Design

Stage 1 is intentionally **open-ended with no suggested prompts or options**. This design choice:

- Allows the user to share freely without being guided toward specific responses
- Enables assessment of how well the AI listens and reframes
- Creates authentic space for natural expression
- Avoids leading questions that might shape the narrative

The AI simply invites sharing and then responds with empathetic reflection. The user types freely in an open text field.

## Flow

```mermaid
flowchart TD
    Enter[Enter Stage 1] --> Prompt[AI invites sharing]

    Prompt --> Share[User shares perspective]
    Share --> Reflect[AI reflects back]

    Reflect --> Check{Does reflection land?}
    Check -->|Not quite| Refine[AI refines understanding]
    Refine --> Share
    Check -->|Yes| Deeper{More to share?}

    Deeper -->|Yes| Continue[Continue exploration]
    Continue --> Share
    Deeper -->|No| HeardCheck{Feel fully heard?}

    HeardCheck -->|Not yet| WhyNot[Explore what is missing]
    WhyNot --> Share
    HeardCheck -->|Yes| Confirm[Confirm completion]

    Confirm --> Barometer[Final emotion check]
    Barometer --> Ready{Ready to proceed?}
    Ready -->|Intensity high| Pause[Suggest pause]
    Pause --> Later[Return when ready]
    Later --> Barometer
    Ready -->|Yes| Complete[Stage 1 complete]

    Complete --> WaitOther{Other complete?}
    WaitOther -->|Yes| Advance[Advance to Stage 2]
    WaitOther -->|No| Wait[Wait in holding]
    Wait --> WaitOther
```

## Parallel Processing

Both users work through Stage 1 simultaneously but independently:

```mermaid
flowchart LR
    subgraph UserA[User A - Own Pace]
        A1[Sharing] --> A2[Reflection]
        A2 --> A3[Deepening]
        A3 --> A4[Feels heard]
    end

    subgraph UserB[User B - Own Pace]
        B1[Sharing] --> B2[Reflection]
        B2 --> B3[Deepening]
        B3 --> B4[Feels heard]
    end

    A4 --> Gate{Both complete?}
    B4 --> Gate
    Gate --> Stage2[Stage 2]
```

## AI Reflection Techniques

The AI uses several approaches to help users feel heard:

| Technique | Example |
|-----------|---------|
| Paraphrase | "So what I hear is that when X happened, you felt Y..." |
| Emotion naming | "It sounds like there is a lot of frustration there, maybe even some hurt underneath?" |
| Validation | "That sounds really difficult. It makes sense you would feel that way." |
| Gentle probing | "When you say it felt unfair, can you tell me more about what fairness means to you here?" |
| Summarizing | "Let me see if I can capture what you have shared so far..." |

## Wireframe: Witness Chat Interface

```mermaid
flowchart TB
    subgraph Screen[The Witness Screen]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 1: The Witness]
            Progress[Your progress: In conversation]
        end

        subgraph Chat[Chat Area]
            AI1[AI: Take your time. What happened?]
            User1[User: shares story]
            AI2[AI: reflects back with empathy]
            User2[User: adds more detail]
            AI3[AI: deeper reflection]
        end

        subgraph EmotionBar[Emotional Check]
            Question[How are you feeling right now?]
            Slider[1 -------- 5 -------- 10]
            Labels[Calm ... ... Intense]
        end

        subgraph Input[Input Area]
            TextBox[Type your thoughts...]
            Send[Send]
        end

        subgraph Completion[Completion Check]
            HeardQ[Do you feel fully heard?]
            NotYet[Not yet]
            YesHeard[Yes I feel heard]
        end
    end
```

## Success Criteria

User explicitly confirms: "I feel fully heard by the AI"

This is a subjective assessment that the user must make. The AI cannot advance them without this confirmation.

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| User stuck or silent | Offer prompts; acknowledge difficulty |
| Emotional intensity spikes | Trigger cooling period via barometer |
| User wants to vent about other person | Allow initially; gently redirect to feelings and needs |
| User says "heard" but seems rushed | Gently check if they want more time |

## Data Captured

- All user input (private to User Vessel)
- AI reflections and summaries
- Emotional barometer readings over time
- Confirmation timestamp

## Privacy Note

Everything shared in Stage 1 remains in the users private Vessel. The AI synthesizes insights internally but does not share raw content with the other party.

---

## Related Documents

- [Previous: Stage 0 - Onboarding](./stage-0-onboarding.md)
- [Next: Stage 2 - Perspective Stretch](./stage-2-perspective-stretch.md)
- [Emotional Barometer](../mechanisms/emotional-barometer.md)

### Backend Implementation

- [Stage 1 API](../backend/api/stage-1.md) - Message and feel-heard endpoints
- [Stage 1 Prompt](../backend/prompts/stage-1-witnessing.md) - Witnessing prompt template
- [Emotional Barometer API](../backend/api/emotional-barometer.md)
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md#stage-1-the-witness)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
