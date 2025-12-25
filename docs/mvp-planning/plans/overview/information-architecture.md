# Information Architecture

The navigation structure for BeHeard follows a **People-first** model. Users navigate through relationships, not transactions.

## Navigation Hierarchy

```mermaid
flowchart TD
    Home[Home Dashboard]
    Person[Person Detail]
    Session[Session Dashboard]
    Stage[Stage View]
    InnerList[Inner Work List]
    InnerSession[Inner Work Session]

    Home --> Person
    Home --> InnerList
    Person --> Session
    Session --> Stage
    InnerList --> InnerSession
    InnerSession --> Stage
```

## Screen Inventory

| Screen | Purpose | Entry Points |
|--------|---------|--------------|
| Home Dashboard | Primary landing, shows all people and inner work | App launch, back navigation |
| Person Detail | Relationship view with current and past sessions | Tap person from Home |
| Session Dashboard | Preparation space before entering stage work | Tap session from Person Detail |
| Stage View | Active conversation interface | Continue from Session Dashboard |
| Inner Work List | Solo processing sessions | Tap Inner Work section on Home |
| New Session | Create session and invite someone | [+New] button, Start New Session |

## Core Principles

### Single Active Session

Each relationship can have only one active session at a time. This keeps focus on resolving one conflict before starting another. Completed sessions are archived under the person.

### People-First Navigation

```mermaid
flowchart LR
    subgraph Mental Model
        Wrong[Session 47 with Alex]
        Right[My relationship with Alex]
    end

    Wrong -.->|Not this| X[X]
    Right -->|This| Check[Yes]
```

Users think in terms of relationships, not session IDs. The app reinforces this by organizing everything under people.

### Smart Hero Card

The Home Dashboard features a prominent hero card that surfaces the most important action:

```mermaid
flowchart TD
    subgraph Hero Card Priority
        P1[1. Partner waiting on you]
        P2[2. Your turn to continue]
        P3[3. Waiting on partner]
        P4[4. No active sessions]
    end

    P1 --> Action1[Continue button]
    P2 --> Action2[Continue button]
    P3 --> Status[Status only]
    P4 --> Action4[Start session CTA]
```

### Session-First Invitations

New people enter your People list through session creation, not contact management:

```mermaid
flowchart LR
    Create[Create Session] --> Invite[Enter email/phone]
    Invite --> Send[Send Invitation]
    Send --> Pending[Person appears as Pending]
    Pending --> Accept[Partner accepts]
    Accept --> Active[Session becomes active]
```

## Navigation Patterns

### Back Navigation

Back navigation follows the hierarchy strictly:
- Stage View → Session Dashboard
- Session Dashboard → Person Detail
- Person Detail → Home Dashboard

### Deep Links

Notifications can deep link directly to relevant screens:
- "Alex is waiting" → Session Dashboard with Alex
- "Partner accepted invite" → Person Detail

### Parallel Paths

People sessions and Inner Work are parallel paths from Home:

```mermaid
flowchart TD
    Home[Home Dashboard]

    subgraph People Path
        Person[Person Detail]
        PSession[Session Dashboard]
        PStage[Stage View]
    end

    subgraph Inner Work Path
        IList[Inner Work List]
        ISession[Inner Work Session]
        IStage[Stage View]
    end

    Home --> Person
    Person --> PSession
    PSession --> PStage

    Home --> IList
    IList --> ISession
    ISession --> IStage
```

## Relationship Labels

The app uses neutral language for relationships:
- "Connected since Oct 2024" (not "Partner since")
- No relationship type labels (family, friend, etc.)
- Focus on the work, not categorizing relationships

---

[Back to Overview](./index.md) | [Home Dashboard Wireframe](../wireframes/home-dashboard.md)
