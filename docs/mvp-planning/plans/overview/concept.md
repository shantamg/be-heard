# Core Concept

## The Problem

Conflict escalates because humans try to solve problems while under **physiological and emotional threat**. When triggered:

- The prefrontal cortex (rational thinking) goes offline
- Fight/flight/freeze responses dominate
- Memory becomes distorted and selective
- Listening capacity diminishes
- Solutions feel impossible

## The Solution

Meet Without Fear acts as an **External Prefrontal Cortex** that:

| Function | How Meet Without Fear Provides It |
|----------|---------------------------|
| Regulation | Emotional Barometer monitors intensity; enforces cooling periods |
| Memory | Accurate, attributed records of what each person shared |
| Pacing | Stage gates prevent rushing; advancement requires readiness |
| Teaching | Builds skills in listening, reflection, and needs identification |

## Architectural Pillars

### 1. Asynchronous Processing

```mermaid
flowchart TD
    subgraph Asynchronous Model
        UA[User A] --> AI1[AI Session]
        UB[User B] --> AI2[AI Session]
        AI1 -.->|Synthesized insights| AI2
        AI2 -.->|Synthesized insights| AI1
    end
```

Users interact with the AI independently, not with each other directly. This:
- Reduces escalation triggers
- Allows each person to process at their own pace
- Prevents reactive, heated exchanges

#### The Airlock Analogy

Think of the app as a **safety airlock between two pressurized rooms**. Instead of opening the door and letting the pressure cause an explosion, the airlock (the AI) slowly regulates the environment in each room separately until it is safe for both parties to step into a shared space.

```mermaid
flowchart LR
    subgraph RoomA[Room A - User A]
        PA[High pressure emotions]
    end

    subgraph Airlock[AI Airlock]
        Regulate[Regulates pressure]
        Pace[Controls pace]
        Filter[Filters content]
    end

    subgraph RoomB[Room B - User B]
        PB[High pressure emotions]
    end

    subgraph SharedSpace[Shared Space]
        Safe[Safe interaction]
    end

    RoomA --> Airlock
    RoomB --> Airlock
    Airlock --> SharedSpace
```

### 2. Vessel Privacy Model

Three distinct containers protect user data:

```mermaid
flowchart TB
    subgraph UserVessel[User Vessel - Private]
        Raw[Raw venting]
        Docs[Documents]
        Emotions[Emotion ratings]
    end

    subgraph AISynthesis[AI Synthesis - Internal Only]
        Needs[Mapped needs]
        Values[Identified values]
        Patterns[Conflict patterns]
    end

    subgraph SharedVessel[Shared Vessel - Consensual]
        Consented[Explicitly shared content]
        CommonGround[Identified common ground]
    end

    UserVessel -->|AI processes| AISynthesis
    AISynthesis -->|With consent| SharedVessel
```

See [Privacy Model](../privacy/index.md) for details.

### 3. Non-Linear Pacing

The AI can enforce cooling periods based on emotional intensity:

```mermaid
flowchart TD
    Check[User interacts] --> Barometer{Emotional rating}
    Barometer -->|1-7| Continue[Continue session]
    Barometer -->|8-10| Pause[Suggest cooling period]
    Pause --> Disable[Disable advancement]
    Pause --> Message[Supportive message]
    Message --> Later[User returns when ready]
    Later --> Check
```

See [Emotional Barometer](../mechanisms/emotional-barometer.md) for details.

## MVP Scope: Two-Person Conflicts

The initial version focuses on conflicts between two people:
- Couples
- Family members
- Coworkers
- Friends

Multi-party conflicts are a future enhancement.

---

## Related Documents

- [User Journey](./user-journey.md) - Complete flow through the system
- [Stages Overview](../stages/index.md) - The five-stage process
- [Privacy Model](../privacy/index.md) - Vessel architecture

---

[Back to Overview](./index.md) | [Back to Plans](../index.md)
