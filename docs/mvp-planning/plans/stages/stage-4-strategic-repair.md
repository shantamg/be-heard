# Stage 4: Strategic Repair

:::tip See it in action
<a href="/demo/features/follow-up.html" onClick="window.location.href='/demo/features/follow-up.html'; return false;">Try the Follow-up Check-in demo</a> - Experience the post-agreement check-in that ensures accountability.
:::

## Purpose

Move from understanding to action by designing small, reversible experiments that address identified needs.

## AI Goal

- Invite **both users** to propose their own strategies
- Help refine proposals to be small, reversible, and time-bounded
- Collect and combine suggestions from both parties
- Present all strategies as **unlabeled options** (no attribution to source)
- Allow users to select from the combined pool
- Offer to generate additional AI suggestions if desired
- Document agreed-upon micro-experiments

## Key Design: Collaborative Strategy Generation

Unlike traditional negotiation where one person proposes and the other reacts, Stage 4 invites **both parties to contribute strategies independently**. The AI then:

1. Collects strategies from both users
2. Presents them as a single unlabeled pool (no attribution to source)
3. Asks: "Here is what we have come up with so far. Are you happy with these options, or would you like me to try and generate a few more to explore?"
4. Each person **privately ranks their top choices**
5. AI reveals where selections overlap

This approach:
- Removes defensiveness that comes with accepting another's proposal
- Creates joint ownership of solutions
- Avoids win/lose dynamics
- Encourages creativity when users can build on unlabeled ideas
- Private ranking removes pressure of visible negotiation
- Overlap emerges naturally without either person feeling like they gave in

## Flow

```mermaid
flowchart TD
    Enter[Enter Stage 4] --> Intro[AI introduces repair work]
    Intro --> InviteA[Invite User A strategy]
    InviteA --> RefineA[AI helps refine specifics]

    InviteB[Invite User B strategy] --> RefineB[AI helps refine]

    RefineA --> Collect[Collect all strategies]
    RefineB --> Collect

    Collect --> Present[Present unlabeled strategy pool]
    Present --> Question[Happy with options or want more?]

    Question -->|Want more| Generate[AI generates additional ideas]
    Generate --> Present

    Question -->|Happy| PrivateRank[Each privately ranks top choices]
    PrivateRank --> WaitBoth[Wait for both to rank]
    WaitBoth --> Reveal[AI reveals overlap]
    Reveal --> Overlap{Any overlap?}

    Overlap -->|Yes| Discuss[Discuss overlapping options]
    Overlap -->|No| Explore[Explore differences]
    Explore --> MoreOptions{Want more options?}
    MoreOptions -->|Yes| Generate
    MoreOptions -->|No| Negotiate[Work toward common ground]
    Negotiate --> Discuss

    Discuss --> Document[Document micro-experiment]

    Document --> FollowUp{Schedule check-in?}
    FollowUp -->|Yes| Schedule[Set follow-up date]
    FollowUp -->|No| Complete[Stage 4 complete]
    Schedule --> Complete

    Complete --> Resolution[Resolution achieved]
```

## Micro-Experiment Design

The AI helps users design experiments that are:

```mermaid
flowchart TB
    subgraph Good[Good Micro-Experiment]
        G1[Specific: One 15-min check-in per day]
        G2[Time-bounded: For the next week]
        G3[Reversible: Can adjust or stop]
        G4[Measurable: Did we do it? How did it feel?]
    end

    subgraph Bad[Too Big - Not a Micro-Experiment]
        B1[Vague: Communicate better]
        B2[Permanent: Always do X]
        B3[High stakes: Major life change]
        B4[Unmeasurable: Be more supportive]
    end
```

## Example Micro-Experiments

| Need Addressed | Micro-Experiment |
|----------------|------------------|
| Connection | "We will have a 10-minute phone-free conversation at dinner for 5 days" |
| Recognition | "I will say one specific thing I appreciate each morning for a week" |
| Safety | "We will use a pause signal when conversations get heated and take 5 minutes" |
| Fairness | "We will alternate who chooses weekend activities for the next month" |

## When No Overlap Exists

If private rankings reveal no overlap, the AI facilitates finding common ground:

```mermaid
flowchart TD
    NoOverlap[No overlap in rankings] --> Explore[AI explores each persons top pick]
    Explore --> Understand[Help each understand why partner chose differently]
    Understand --> Options{Path forward}

    Options -->|Generate more| NewIdeas[AI generates new options]
    NewIdeas --> ReRank[Both re-rank with new pool]

    Options -->|Discuss| Discuss[Open discussion about priorities]
    Discuss --> Compromise[Find acceptable middle ground]

    Options -->|Hybrid| Combine[Combine elements from different picks]
    Combine --> Propose[Propose hybrid option]
```

## Wireframe: Strategic Repair Interface

### Strategy Pool View

```mermaid
flowchart TB
    subgraph Screen[Strategic Repair Screen]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 4: Strategic Repair]
            Status[Building your path forward]
        end

        subgraph Foundation[Common Ground Foundation]
            Title1[Building on shared needs]
            SharedNeed[You both need: Recognition]
        end

        subgraph Strategies[Collective Strategies - Unlabeled]
            Title2[Here is what we have come up with]
            Strat1[Weekly 15-min planning session]
            Strat2[Daily appreciation message]
            Strat3[Shared task list]
            Strat4[Take turns choosing activities]
            Strat5[5-minute check-in before bed]
        end

        subgraph Actions[Options]
            Happy[These look good - rank my choices]
            More[Generate more ideas]
        end
    end
```

### Private Ranking View

```mermaid
flowchart TB
    subgraph Screen[Rank Your Top Choices]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 4: Strategic Repair]
            Status[Private ranking]
        end

        subgraph Instructions[Instructions]
            Text[Select your top choices - partner wont see your picks until you both submit]
        end

        subgraph Ranking[Your Ranking]
            Pick1[1. Daily appreciation message]
            Pick2[2. 5-minute check-in before bed]
            Pick3[3. Weekly planning session]
        end

        subgraph Submit[Submit]
            Button[Submit my ranking]
        end
    end
```

### Overlap Reveal View

```mermaid
flowchart TB
    subgraph Screen[Your Shared Priorities]
        subgraph Header[Header]
            Logo[BeHeard]
            Stage[Stage 4: Strategic Repair]
            Status[Common ground found]
        end

        subgraph Overlap[You Both Chose]
            Match1[Daily appreciation message]
            Match2[5-minute check-in before bed]
        end

        subgraph Unique[Only One of You Chose]
            Diff1[Weekly planning session]
            Diff2[Shared task list]
        end
    end
```

**Key visual elements:**
- Strategy options are presented without labels indicating who suggested them
- All buttons use soft, neutral colors (no "yours" vs "theirs" styling)
- Ranking is private until both submit
- Overlap is revealed together, celebrating common ground

## Success Criteria

Mutual agreement on at least one micro-experiment.

## Agreement Documentation

When users agree, the AI documents:

```
MICRO-EXPERIMENT AGREEMENT
--------------------------
Participants: [User A], [User B]
Date agreed: [Date]

Experiment: [Specific description]
Duration: [Time period]
Success measure: [How to know if it worked]

Check-in scheduled: [Date/time if applicable]
```

## Failure Paths

| Scenario | AI Response |
|----------|-------------|
| No proposals generated | AI suggests options based on identified needs |
| Repeated rejection | Explore what would work; may need to return to need mapping |
| Proposals too ambitious | Help scope down; emphasize "small and reversible" |
| One party uncooperative | Acknowledge difficulty; explore barriers |

## Follow-Up Support

If users schedule a check-in:

```mermaid
flowchart TD
    Experiment[Experiment period] --> CheckIn[Scheduled check-in]

    CheckIn --> Review[Review how it went]
    Review --> Result{Outcome}

    Result -->|Worked well| Celebrate[Celebrate progress]
    Celebrate --> Expand{Expand or continue?}
    Expand -->|Expand| NewExperiment[Design new experiment]
    Expand -->|Continue| Maintain[Keep current experiment]

    Result -->|Partially worked| Adjust[Discuss adjustments]
    Adjust --> Modify[Modify experiment]
    Modify --> TryAgain[Try again]

    Result -->|Did not work| Learn[Learn from it]
    Learn --> Understand[Understand barriers]
    Understand --> NewApproach[Try different approach]
    NewApproach --> NewExperiment
```

## Data Captured

- Proposals made
- Negotiation history
- Agreed experiments
- Follow-up schedules
- Check-in outcomes (if applicable)

---

## Related Documents

- [Previous: Stage 3 - Need Mapping](./stage-3-need-mapping.md)
- [User Journey](../overview/user-journey.md)
- [System Guardrails](../mechanisms/guardrails.md)

### Backend Implementation

- [Stage 4 API](../backend/api/stage-4.md) - Strategy and agreement endpoints
- [Stage 4 Prompt](../backend/prompts/stage-4-repair.md) - Strategic repair prompt template
- [Retrieval Contracts](../backend/state-machine/retrieval-contracts.md#stage-4-strategic-repair)
- [Global Library Schema](../backend/data-model/prisma-schema.md#global-library-stage-4-suggestions)

---

[Back to Stages](./index.md) | [Back to Plans](../index.md)
