# Home Dashboard

The primary landing screen when users open BeHeard. Surfaces the most important action and provides access to all relationships and inner work.

## Layout Structure

```mermaid
flowchart TD
    subgraph Header
        Logo[Logo]
        NewBtn[New Button]
        Menu[Menu]
    end

    subgraph Hero[Smart Hero Card]
        HeroContent[Priority Action or Status]
        HeroCTA[Continue Button]
    end

    subgraph People[My People Section]
        PersonCard1[Person Card]
        PersonCard2[Person Card]
        PersonCard3[Person Card]
    end

    subgraph Inner[Inner Work Section]
        InnerCard1[Inner Work Card]
        InnerCard2[Inner Work Card]
    end

    Header --> Hero
    Hero --> People
    People --> Inner
```

## Desktop Layout

```mermaid
flowchart TD
    subgraph Desktop[Desktop 1200px plus]
        subgraph TopBar[Header Bar]
            DLogo[BeHeard Logo]
            DSpacer[Spacer]
            DNew[Plus New]
            DMenu[User Menu]
        end

        subgraph MainArea[Main Content]
            subgraph HeroSection[Hero Card Area]
                HeroCard[Smart Hero Card - Full Width]
            end

            subgraph ContentGrid[Two Column Grid]
                subgraph LeftCol[My People]
                    PC1[Person Card]
                    PC2[Person Card]
                    PC3[Person Card]
                end
                subgraph RightCol[Inner Work]
                    IW1[Inner Work Card]
                    IW2[Inner Work Card]
                end
            end
        end
    end
```

## Mobile Layout

```mermaid
flowchart TD
    subgraph Mobile[Mobile under 768px]
        subgraph MHeader[Header]
            MLogo[Logo]
            MNew[Plus]
            MMenu[Menu]
        end

        MHero[Smart Hero Card]

        subgraph MPeople[My People]
            MP1[Person Card]
            MP2[Person Card]
        end

        subgraph MInner[Inner Work]
            MI1[Inner Work Card]
        end
    end

    MHeader --> MHero
    MHero --> MPeople
    MPeople --> MInner
```

## Smart Hero Card States

The hero card shows the single most important action or status.

### State 1: Partner Waiting on You

Highest priority. Partner has completed their turn and is waiting.

| Element | Content |
|---------|---------|
| Icon | Notification indicator |
| Title | Alex is waiting for you |
| Subtitle | Stage 2: Perspective Stretch |
| CTA | Continue (primary button) |

### State 2: Your Turn to Continue

You have work to do but partner is not actively waiting.

| Element | Content |
|---------|---------|
| Icon | Arrow indicator |
| Title | Ready to continue with Alex |
| Subtitle | Stage 1: The Witness |
| CTA | Continue (primary button) |

### State 3: Waiting on Partner

You have completed your turn. No action needed.

| Element | Content |
|---------|---------|
| Icon | Clock indicator |
| Title | Waiting for Alex |
| Subtitle | They are working on Stage 2 |
| CTA | None - status only |

### State 4: No Active Sessions

New user or all sessions resolved.

| Element | Content |
|---------|---------|
| Icon | Welcome or plus indicator |
| Title | Start your first session OR Ready to start something new |
| Subtitle | Invite someone to work through a conflict together |
| CTA | Invite Someone (primary button) |

### Hero Card Priority Logic

```mermaid
flowchart TD
    Start[Check Sessions] --> HasActive{Any active sessions?}
    HasActive -->|No| State4[Show Start New]
    HasActive -->|Yes| CheckWaiting{Partner waiting on you?}
    CheckWaiting -->|Yes| State1[Show Partner Waiting]
    CheckWaiting -->|No| CheckYourTurn{Your turn?}
    CheckYourTurn -->|Yes| State2[Show Your Turn]
    CheckYourTurn -->|No| State3[Show Waiting on Partner]
```

## Person Card

Each person in the My People list shows:

| Element | Description |
|---------|-------------|
| Avatar | Profile image or initials |
| Name | Person name |
| Status | Current stage OR Resolved OR Invited |
| Time | Time since last activity |
| Indicator | Dot if waiting on you |

### Person Card States

```mermaid
flowchart LR
    subgraph Card States
        Active[Stage 2 - 2h ago]
        Waiting[Waiting on you - 1d]
        Resolved[Resolved - 1w ago]
        Invited[Invited - Pending]
    end
```

## Inner Work Card

Each inner work session shows:

| Element | Description |
|---------|-------------|
| Topic | Brief description |
| Status | In progress OR Completed |
| Time | Time since last activity |

## Empty States

### No People Yet

When user has no sessions:
- Friendly illustration
- "No sessions yet"
- "Start by inviting someone to work through something together"
- Invite Someone button

### No Inner Work

When user has no inner work sessions:
- "Process something on your own"
- Start Inner Work button

## Actions

| Action | Result |
|--------|--------|
| Tap Plus New | Open New Session flow |
| Tap Hero CTA | Go to Session Dashboard |
| Tap Person Card | Go to Person Detail |
| Tap Inner Work Card | Go to Inner Work Session |
| Tap Menu | Open user menu |

---

[Back to Wireframes](./index.md) | [Person Detail](./person-detail.md) | [Information Architecture](../overview/information-architecture.md)
