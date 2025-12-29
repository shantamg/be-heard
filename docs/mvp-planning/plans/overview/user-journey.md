# User Journey

Complete flow through Meet Without Fear from first contact to resolution.

## High-Level Journey

```mermaid
flowchart TD
    Entry[User discovers Meet Without Fear] --> Invite{How did they arrive?}
    Invite -->|Self-initiated| Create[Create conflict session]
    Invite -->|Invited by other| Accept[Accept invitation]

    Create --> InviteOther[Invite other party]
    InviteOther --> WaitAccept{Other accepts?}
    WaitAccept -->|No| Remind[Send reminders]
    WaitAccept -->|Yes| Stage0
    Remind --> WaitAccept

    Accept --> Stage0[Stage 0: Onboarding]

    Stage0 --> Stage1[Stage 1: The Witness]
    Stage1 --> Stage2[Stage 2: Perspective Stretch]
    Stage2 --> Stage3[Stage 3: Need Mapping]
    Stage3 --> Stage4[Stage 4: Strategic Repair]
    Stage4 --> Resolution[Resolution achieved]

    Resolution --> Followup{Future check-in?}
    Followup -->|Yes| CheckIn[Scheduled follow-up]
    Followup -->|No| Complete[Session complete]
```

## Detailed Stage Flow with Success/Failure Loops

### Stage 0: Onboarding

```mermaid
flowchart TD
    Start[Enter Stage 0] --> Explain[AI explains process]
    Explain --> Guardian[Establish Process Guardian role]
    Guardian --> Compact[Present Curiosity Compact]

    Compact --> Sign{User signs compact?}
    Sign -->|Yes| CheckOther{Other user signed?}
    Sign -->|Hesitant| Clarify[AI clarifies concerns]
    Sign -->|Refuses| Exit[Cannot proceed - exit]

    Clarify --> Sign

    CheckOther -->|Yes| ToStage1[Advance to Stage 1]
    CheckOther -->|No| Wait[Wait for other party]
    Wait --> Notify[Notify when other signs]
    Notify --> ToStage1
```

**Success criteria:** Both users sign Curiosity Compact

**Failure paths:**
- User refuses compact - Session cannot proceed
- Other party never accepts invitation - Timeout with option to resend

---

### Stage 1: The Witness

```mermaid
flowchart TD
    Enter[Enter Stage 1] --> Parallel[Users work in parallel]

    subgraph UserA[User A Session]
        A1[Share perspective] --> A2[AI reflects back]
        A2 --> A3[Deeper exploration]
        A3 --> A4{Feel fully heard?}
        A4 -->|Not yet| A1
        A4 -->|Yes| A5[Confirm completion]
    end

    subgraph UserB[User B Session]
        B1[Share perspective] --> B2[AI reflects back]
        B2 --> B3[Deeper exploration]
        B3 --> B4{Feel fully heard?}
        B4 -->|Not yet| B1
        B4 -->|Yes| B5[Confirm completion]
    end

    Parallel --> UserA
    Parallel --> UserB

    A5 --> BothDone{Both complete?}
    B5 --> BothDone
    BothDone -->|Yes| ToStage2[Advance to Stage 2]
    BothDone -->|No| Wait2[Wait for other]
    Wait2 --> BothDone
```

**Success criteria:** Both users confirm "I feel fully heard by the AI"

**Failure paths:**
- Emotional intensity too high - Cooling period triggered
- User abandons session - Partner notified; can resume later
- User stuck in loop - AI offers alternative reflection approaches

---

### Stage 2: Perspective Stretch

```mermaid
flowchart TD
    Enter[Enter Stage 2] --> Present[AI presents other perspective]
    Present --> Curated[Curated from shared content only]

    Curated --> Reflect[User reflects on other view]
    Reflect --> Check{Can state other needs accurately?}

    Check -->|Judgment detected| Mirror[Mirror Intervention]
    Mirror --> Reframe[AI helps reframe]
    Reframe --> Reflect

    Check -->|Inaccurate| Gentle[Gentle correction]
    Gentle --> MoreContext[AI provides more context]
    MoreContext --> Reflect

    Check -->|Accurate and neutral| Success[Stage 2 complete]
    Success --> ToStage3[Advance to Stage 3]
```

**Success criteria:** User can accurately state the other persons needs without judgment

**Failure paths:**
- Repeated judgmental statements - Mirror intervention loop
- Emotional escalation - Barometer triggers cooling period
- User refuses to engage - Session paused; AI explains importance

---

### Stage 3: Need Mapping

```mermaid
flowchart TD
    Enter[Enter Stage 3] --> Synthesize[AI synthesizes needs]

    subgraph NeedMapping[Need Identification]
        N1[Surface-level complaints] --> N2[Underlying emotions]
        N2 --> N3[Core universal needs]
    end

    Synthesize --> NeedMapping
    NeedMapping --> Present[Present to user]

    Present --> Validate{User validates needs?}
    Validate -->|Adjustments needed| Refine[Refine understanding]
    Refine --> Present
    Validate -->|Confirmed| SearchCommon[Search for common ground]

    SearchCommon --> Found{Common need found?}
    Found -->|Yes| Highlight[Highlight shared need]
    Found -->|Not obvious| Dig[AI digs deeper]
    Dig --> Found

    Highlight --> Confirm{Both confirm common ground?}
    Confirm -->|Yes| ToStage4[Advance to Stage 4]
    Confirm -->|No| Revisit[Revisit need mapping]
    Revisit --> NeedMapping
```

**Success criteria:** At least one common-ground need identified (e.g., Safety, Respect, Connection)

**Failure paths:**
- No common ground apparent - AI explores deeper needs
- User rejects synthesis - Refinement loop
- Accusatory language - AI reframes to I/Needs statements

---

### Stage 4: Strategic Repair

```mermaid
flowchart TD
    Enter[Enter Stage 4] --> Propose[Users propose actions]

    subgraph MicroExperiment[Micro-Experiment Design]
        M1[Small action] --> M2[Reversible]
        M2 --> M3[Time-bounded]
        M3 --> M4[Measurable]
    end

    Propose --> MicroExperiment
    MicroExperiment --> Review[AI reviews proposal]

    Review --> Viable{Meets criteria?}
    Viable -->|Too big| Smaller[Suggest smaller scope]
    Smaller --> Propose
    Viable -->|Not reversible| Adjust[Suggest reversible version]
    Adjust --> Propose
    Viable -->|Good| Present[Present to other party]

    Present --> Accept{Other accepts?}
    Accept -->|Counter-proposal| Negotiate[AI facilitates negotiation]
    Negotiate --> Present
    Accept -->|Yes| Agree[Mutual agreement reached]

    Agree --> Document[Document micro-experiment]
    Document --> Schedule[Schedule check-in]
    Schedule --> Complete[Stage 4 complete]
```

**Success criteria:** Mutual agreement on at least one micro-experiment

**Failure paths:**
- No acceptable proposals - AI suggests options based on identified needs
- Repeated rejection - Return to need mapping for alignment
- Scope creep - AI enforces small, reversible constraint

---

## Cross-Cutting: Emotional Barometer

This mechanism operates across all stages:

```mermaid
flowchart TD
    Any[Any stage activity] --> Periodic[Periodic emotion check]
    Periodic --> Rate[User rates 1-10]

    Rate --> Level{Intensity level}
    Level -->|1-4 Calm| Continue[Continue normally]
    Level -->|5-7 Elevated| Monitor[AI monitors closely]
    Level -->|8-10 High| Pause[Trigger cooling period]

    Pause --> Disable[Disable advancement]
    Disable --> Support[Supportive message]
    Support --> Later[Return when ready]
    Later --> Rate

    Monitor --> Trending{Trend direction}
    Trending -->|Decreasing| Continue
    Trending -->|Increasing| Pause
```

See [Emotional Barometer](../mechanisms/emotional-barometer.md) for details.

---

## Session Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Created: User creates session
    Created --> Invited: Invite sent
    Invited --> Active: Both joined
    Invited --> Expired: Invitation timeout

    Active --> Paused: Cooling period
    Active --> Waiting: One user ahead
    Paused --> Active: User returns
    Waiting --> Active: Both aligned

    Active --> Stage0
    Stage0 --> Stage1
    Stage1 --> Stage2
    Stage2 --> Stage3
    Stage3 --> Stage4
    Stage4 --> Resolved

    Resolved --> FollowUp: Check-in scheduled
    FollowUp --> [*]: Complete
    Resolved --> [*]: No follow-up

    Active --> Abandoned: User exits
    Paused --> Abandoned: Timeout
    Abandoned --> [*]
```

---

## Related Documents

- [Stage 0: Onboarding](../stages/stage-0-onboarding.md)
- [Stage 1: The Witness](../stages/stage-1-witness.md)
- [Stage 2: Perspective Stretch](../stages/stage-2-perspective-stretch.md)
- [Stage 3: Need Mapping](../stages/stage-3-need-mapping.md)
- [Stage 4: Strategic Repair](../stages/stage-4-strategic-repair.md)
- [Emotional Barometer](../mechanisms/emotional-barometer.md)

---

[Back to Overview](./index.md) | [Back to Plans](../index.md)
