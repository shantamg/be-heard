# New Session Flow

The flow for creating a new session and inviting someone to work through a conflict together.

## Entry Points

Users can start a new session from:
- **Home Dashboard** - Tap [+New] button in header
- **Person Detail** - Tap Start New Session (when no active session)
- **Hero Card** - Tap Invite Someone (when no sessions exist)

## Flow Overview

```mermaid
flowchart TD
    Start[User taps New]
    SelectPerson[Select Person Screen]
    EnterContact[Enter Email or Phone]
    ExistingPerson[Choose Existing Person]
    TopicInput[Describe Topic Screen]
    Send[Send Invitation]
    Waiting[Waiting for Response]
    Accepted[Partner Accepts]
    SessionBegins[Session Dashboard]

    Start --> SelectPerson
    SelectPerson --> EnterContact
    SelectPerson --> ExistingPerson
    EnterContact --> TopicInput
    ExistingPerson --> TopicInput
    TopicInput --> Send
    Send --> Waiting
    Waiting --> Accepted
    Accepted --> SessionBegins
```

## Screen 1: Select Person

```mermaid
flowchart TD
    subgraph SelectScreen[Who would you like to work with]
        subgraph Header
            Cancel[Cancel]
            Title[New Session]
        end

        subgraph InviteNew[Invite Someone New]
            EmailInput[Enter email or phone]
        end

        subgraph OrDivider[Or choose someone you know]
            Divider[Divider Line]
        end

        subgraph ExistingList[Existing People]
            Person1[Alex - No active session]
            Person2[Jordan - No active session]
        end

        subgraph InnerOption[Just need to process alone]
            InnerBtn[Start Inner Work instead]
        end
    end
```

### Elements

| Element | Description |
|---------|-------------|
| Cancel | Returns to previous screen |
| Email/Phone Input | For inviting new people |
| Existing People | Only shows people without active sessions |
| Inner Work Option | Escape hatch for solo processing |

### Existing Person Filter

Only people without an active session appear in the list. People with active sessions are excluded since each relationship can only have one active session.

## Screen 2: Topic Input

```mermaid
flowchart TD
    subgraph TopicScreen[Whats on your mind]
        subgraph Header2
            Back[Back]
            Title2[New Session]
        end

        subgraph PersonPreview[Session with]
            Avatar[Avatar]
            Name[Alex or new email]
        end

        subgraph TopicArea[Topic]
            Prompt[Briefly whats on your mind]
            TopicInput2[Text input area]
            Hint[e.g. How we split household tasks]
        end

        subgraph Explanation[Helper Text]
            ExplainText[This helps frame the session. You can explore deeper once you begin.]
        end

        subgraph SendArea[Action]
            SendBtn[Send Invitation]
        end
    end
```

### Topic Input Guidelines

| Guideline | Rationale |
|-----------|-----------|
| Keep it brief | Just enough to frame the session |
| No blame language | Sets constructive tone |
| Topic not resolution | Describe the situation not the solution |

### Helper Text

"This helps frame the session. You can explore deeper once you begin."

Reassures users they do not need to explain everything upfront.

## Screen 3: Invitation Sent

```mermaid
flowchart TD
    subgraph SentScreen[Invitation Sent]
        subgraph Header3
            Done[Done]
        end

        subgraph Confirmation[Confirmation]
            CheckIcon[Success Icon]
            SentTo[Invitation sent to Alex]
            WaitMsg[We will notify you when they respond]
        end

        subgraph NextSteps[While You Wait]
            Tip1[You can continue using the app]
            Tip2[The session will appear in your People list]
            Tip3[Start with Inner Work if you want to prepare]
        end

        subgraph ActionArea[Action]
            DoneBtn[Done]
        end
    end
```

## Waiting State

After invitation is sent, the person appears in the People list with status:

| Element | Value |
|---------|-------|
| Status | Invited |
| Subtitle | Waiting for response |
| Time | Sent 2h ago |

### Person Detail While Waiting

```mermaid
flowchart TD
    subgraph WaitingDetail[Person Detail - Invitation Pending]
        Profile[Profile Section]

        subgraph PendingCard[Invitation Status]
            StatusLabel[Invitation sent]
            TimeLabel[2 hours ago]
            ResendOption[Resend invitation]
        end

        subgraph Actions[Actions]
            CancelInvite[Cancel invitation]
        end
    end
```

## Partner Accepts

When partner accepts the invitation:

1. User receives notification
2. Person card updates to show "Stage 0 - Ready to begin"
3. Hero card surfaces the session
4. Tapping leads to Session Dashboard then Stage 0

```mermaid
flowchart TD
    Notification[Alex accepted your invitation]
    HomeUpdate[Hero card shows Alex ready]
    TapHero[User taps Continue]
    SessionDash[Session Dashboard]
    Stage0[Stage 0 - Curiosity Compact]

    Notification --> HomeUpdate
    HomeUpdate --> TapHero
    TapHero --> SessionDash
    SessionDash --> Stage0
```

## Inner Work Escape Hatch

From the Select Person screen, users can choose Inner Work instead:

```mermaid
flowchart TD
    SelectPerson2[Select Person Screen]
    TapInner[Tap Start Inner Work]
    InnerTopic[Describe what you want to process]
    InnerSession[Inner Work Session Begins]

    SelectPerson2 --> TapInner
    TapInner --> InnerTopic
    InnerTopic --> InnerSession
```

## Validation

### Email/Phone Validation

| State | Behavior |
|-------|----------|
| Empty | Send button disabled |
| Invalid format | Error message appears |
| Valid | Send button enabled |
| Already connected | Suggest selecting from list |

### Topic Validation

| State | Behavior |
|-------|----------|
| Empty | Send button disabled |
| Under 10 characters | Warning but allowed |
| Valid | Send button enabled |

## Actions Summary

| Action | Result |
|--------|--------|
| Tap Cancel | Return to previous screen |
| Enter contact | Validate and enable next step |
| Select existing person | Proceed to topic input |
| Tap Inner Work | Switch to inner work flow |
| Enter topic | Enable send button |
| Tap Send Invitation | Send invite and show confirmation |
| Tap Done | Return to Home Dashboard |

---

[Back to Wireframes](./index.md) | [Session Dashboard](./session-dashboard.md) | [Home Dashboard](./home-dashboard.md)
