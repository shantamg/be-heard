# Session Dashboard

The preparation space users see before entering stage work. Provides context, AI support, and emotional check-in.

## Purpose

After time away from a session, users need context before diving back in. The session dashboard:
- Reminds users where they left off
- Previews what comes next
- Offers AI support for questions or preparation
- Checks emotional readiness
- Creates intentional transition into the work

## Layout Structure

```mermaid
flowchart TD
    subgraph Header
        Back[Back Button]
        Title[Session with Name]
    end

    subgraph Progress[Progress Section]
        StageLabel[Current Stage Name]
        ProgressBar[Stage Progress Bar]
    end

    subgraph Context[Context Section]
        LeftOff[Where You Left Off]
        WhatsNext[Whats Next]
    end

    subgraph AI[AI Support Section]
        AITitle[Ask the AI]
        Prompt1[Quick Prompt 1]
        Prompt2[Quick Prompt 2]
        Prompt3[Quick Prompt 3]
    end

    subgraph Emotion[Emotional Check]
        EmotionLabel[How are you feeling]
        EmotionSlider[Emotion Slider]
    end

    subgraph Action[Primary Action]
        ContinueBtn[Ready to Continue]
    end

    Header --> Progress
    Progress --> Context
    Context --> AI
    AI --> Emotion
    Emotion --> Action
```

## Screen Layout

```mermaid
flowchart TD
    subgraph SessionDash[Session Dashboard Screen]
        subgraph TopBar[Header]
            BackBtn[Back Arrow]
            SessionTitle[Session with Alex]
        end

        subgraph StageProgress[Stage Progress]
            StageName[Stage 2: Perspective Stretch]
            ProgBar[0 -- 1 -- 2 current -- 3 -- 4]
        end

        subgraph ContextCards[Context]
            subgraph LeftOffCard[Where You Left Off]
                LeftOffText[You completed Stage 1 and shared your perspective]
            end
            subgraph NextCard[Whats Next]
                NextText[Explore Alexs point of view and build understanding]
            end
        end

        subgraph AISection[Ask the AI]
            Q1[What should I focus on]
            Q2[Remind me what Alex shared]
            Q3[Im feeling anxious]
        end

        subgraph EmotionCheck[Emotional Check]
            Label[How are you feeling right now]
            Slider[1 2 3 4 5 6 7 8 9 10]
        end

        subgraph CTAArea[Action]
            ReadyBtn[Ready to Continue]
        end
    end
```

## Progress Section

### Stage Progress Bar

Visual representation of progress through all 5 stages.

| Stage State | Appearance |
|-------------|------------|
| Completed | Filled with checkmark |
| Current | Highlighted and labeled |
| Locked | Grayed out |

```mermaid
flowchart LR
    S0[Stage 0 Complete]
    S1[Stage 1 Complete]
    S2[Stage 2 Current]
    S3[Stage 3 Locked]
    S4[Stage 4 Locked]

    S0 --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
```

## Context Section

### Where You Left Off

Brief summary of what the user accomplished in their last interaction:
- "You completed Stage 1 and shared your perspective"
- "You and Alex both agreed to the Curiosity Compact"
- "You reflected on Alexs needs and found common ground"

### Whats Next

Preview of what the current stage involves:
- "Explore Alexs point of view and build understanding"
- "Together design a small experiment to try"
- "Share what you heard and confirm understanding"

Content adapts to current stage. See stage documentation for stage-specific messaging.

## AI Support Section

Quick prompts for common preparation needs. Tapping opens AI chat.

### Default Prompts

| Prompt | Purpose |
|--------|---------|
| What should I focus on | Stage-specific guidance |
| Remind me what was shared | Review previous content |
| Im feeling anxious | Emotional support and regulation |

### AI Chat Overlay

When a prompt is tapped, an AI chat opens as an overlay:

```mermaid
flowchart TD
    subgraph AIChat[AI Chat Overlay]
        ChatHeader[AI Assistant]
        Messages[Conversation Area]
        Input[Message Input]
        CloseBtn[Close or Minimize]
    end
```

The AI can:
- Answer questions about the process
- Summarize what has been shared (respecting privacy vessels)
- Provide emotional regulation support
- Offer stage-specific guidance

## Emotional Check-in

### Emotion Slider

Simple 1-10 scale for current emotional intensity.

| Range | Meaning |
|-------|---------|
| 1-3 | Calm and ready |
| 4-6 | Some activation but manageable |
| 7-8 | Elevated - proceed with awareness |
| 9-10 | Consider cooling period first |

### High Emotion Response

If user selects 9-10:

```mermaid
flowchart TD
    HighEmotion[User selects 9 or 10]
    Prompt[Suggestion appears]
    Options[Take a moment first OR Continue anyway]

    HighEmotion --> Prompt
    Prompt --> Options
```

Links to cooling period options if user wants support.

## Primary Action

### Ready to Continue Button

Large primary button that transitions into the stage work.

| State | Button |
|-------|--------|
| Ready | Ready to Continue - enabled |
| High emotion | Continue Anyway - secondary style |
| Waiting on partner | Waiting for Alex - disabled |

## Waiting States

When waiting for partner:

```mermaid
flowchart TD
    subgraph WaitingDash[Waiting for Partner]
        WaitProgress[Stage Progress]
        WaitContext[Context - what you completed]
        WaitStatus[Alex is working on their part]
        WaitMessage[We will notify you when ready]
        WaitInnerWork[Work on something else while you wait]
    end
```

## Actions

| Action | Result |
|--------|--------|
| Tap Back | Return to Person Detail |
| Tap AI Prompt | Open AI chat overlay |
| Adjust Emotion Slider | Record current state |
| Tap Ready to Continue | Enter Stage View |

---

[Back to Wireframes](./index.md) | [Person Detail](./person-detail.md) | [New Session Flow](./new-session-flow.md)
