# Person Detail

The relationship view showing current session status and history with a specific person.

## Layout Structure

```mermaid
flowchart TD
    subgraph Header
        Back[Back Button]
        Name[Person Name]
        Options[Options Menu]
    end

    subgraph Profile[Profile Section]
        Avatar[Avatar]
        PersonName[Name]
        Connected[Connected Since Date]
    end

    subgraph Current[Current Session]
        Stage[Stage Indicator]
        Status[Status Message]
        CTA[Continue Session Button]
    end

    subgraph Past[Past Sessions]
        Session1[Resolved Session Card]
        Session2[Resolved Session Card]
    end

    subgraph NewAction[No Active Session State]
        StartNew[Start New Session Button]
    end

    Header --> Profile
    Profile --> Current
    Current --> Past
    Past --> NewAction
```

## Screen Layout

```mermaid
flowchart TD
    subgraph PersonDetail[Person Detail Screen]
        subgraph TopBar[Header]
            BackBtn[Back Arrow]
            Title[Alex]
            MoreBtn[More Options]
        end

        subgraph ProfileArea[Profile]
            AvatarLg[Large Avatar]
            NameLg[Alex]
            ConnectedDate[Connected since Oct 2024]
        end

        subgraph CurrentSession[Current Session Card]
            StageLabel[Stage 2: Perspective Stretch]
            StatusLabel[Waiting on you - 2h ago]
            ContinueBtn[Continue Session]
        end

        subgraph History[Past Sessions]
            HistoryTitle[Past Sessions]
            Sess1[Dec 15 - Household responsibilities]
            Sess2[Nov 28 - Holiday planning]
        end
    end
```

## Profile Section

| Element | Description |
|---------|-------------|
| Avatar | Large profile image or initials |
| Name | Person name prominently displayed |
| Connection | Connected since date in neutral language |

Uses neutral language - "Connected since Oct 2024" rather than "Partner since" to avoid relationship assumptions.

## Current Session Card

Shows when an active session exists with this person.

### Active Session Elements

| Element | Description |
|---------|-------------|
| Stage | Current stage name and number |
| Status | Who is waiting and for how long |
| CTA | Continue Session button |

### Status Variations

| State | Status Text |
|-------|-------------|
| Waiting on you | Waiting on you - 2h ago |
| Your turn | Ready to continue |
| Waiting on them | Waiting for Alex - 1d ago |
| Both in stage | Both working on Stage 3 |

### No Active Session

When no active session exists, show Start New Session button instead of current session card.

## Past Sessions List

Shows completed sessions in reverse chronological order.

### Past Session Card

| Element | Description |
|---------|-------------|
| Date | Resolution date |
| Topic | Brief topic from initial description |
| Status | Resolved indicator |

Tapping a past session opens a read-only review of the journey.

### Past Session Review

```mermaid
flowchart TD
    subgraph Review[Session Review - Read Only]
        ReviewHeader[Resolved Dec 15]
        Topic[Household responsibilities]
        Timeline[Journey Timeline]
        Stage0[Stage 0 Summary]
        Stage1[Stage 1 Summary]
        Stage2[Stage 2 Summary]
        Stage3[Stage 3 Summary]
        Stage4[Stage 4 Resolution]
        Outcome[Agreed Actions]
    end
```

## States

### State 1: Active Session

```mermaid
flowchart TD
    subgraph Active[Has Active Session]
        Profile1[Profile Section]
        CurrentCard[Current Session Card with CTA]
        PastList[Past Sessions if any]
    end
```

### State 2: No Active Session

```mermaid
flowchart TD
    subgraph NoActive[No Active Session]
        Profile2[Profile Section]
        StartBtn[Start New Session Button]
        PastList2[Past Sessions List]
    end
```

### State 3: Invited - Pending

```mermaid
flowchart TD
    subgraph Pending[Invitation Pending]
        Profile3[Profile Section]
        PendingCard[Invitation Sent - Waiting for response]
        ResendBtn[Resend Invitation Option]
    end
```

### State 4: New Person - No History

```mermaid
flowchart TD
    subgraph NewPerson[First Session]
        Profile4[Profile Section]
        FirstSession[Current Session Card]
        EmptyHistory[No past sessions yet message]
    end
```

## Actions

| Action | Result |
|--------|--------|
| Tap Back | Return to Home Dashboard |
| Tap Continue Session | Go to Session Dashboard |
| Tap Start New Session | Go to New Session flow |
| Tap Past Session | Open read-only review |
| Tap More Options | Show options menu |

## Options Menu

| Option | Description |
|--------|-------------|
| View Full History | See all sessions with this person |
| Remove Person | Remove from people list (if no active session) |

---

[Back to Wireframes](./index.md) | [Home Dashboard](./home-dashboard.md) | [Session Dashboard](./session-dashboard.md)
