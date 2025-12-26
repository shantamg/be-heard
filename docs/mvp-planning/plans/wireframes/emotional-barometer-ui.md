# Emotional Barometer UI

Interface components for tracking and responding to emotional intensity.

## Inline Check (Always Visible)

A minimal, always-present indicator in the input area:

```mermaid
flowchart TB
    subgraph InlineCheck[Inline Emotion Check]
        subgraph Compact[Compact View]
            Label[Feeling:]
            Value[5]
            Indicator[Small visual indicator]
            Expand[Tap to adjust]
        end
    end
```

This appears in the input bar and can be tapped to expand.

## Expanded Slider

```mermaid
flowchart TB
    subgraph ExpandedSlider[Expanded Emotion Slider]
        Question[How are you feeling right now?]

        subgraph SliderArea[Slider]
            LeftLabel[1 Calm]
            SliderTrack[----------O----------]
            RightLabel[10 Intense]
        end

        subgraph Descriptions[Zone Descriptions]
            ZoneDesc[Currently: Moderately elevated]
        end

        Confirm[Done]
    end
```

## Zone Styling

| Range | Color | Description |
|-------|-------|-------------|
| 1-4 | Calm blue/green | Calm and regulated |
| 5-7 | Warm yellow | Elevated but manageable |
| 8-10 | Soft coral | High intensity |

## Periodic Prompt

The AI occasionally prompts for an emotion check:

```mermaid
flowchart TB
    subgraph PeriodicPrompt[Emotion Check Prompt]
        subgraph AIMessage[AI Message]
            PromptText[Before we continue - how are you
            feeling right now?]
        end

        subgraph QuickSelect[Quick Selection]
            Low[1-3 Calm]
            Mid[4-6 Mixed]
            High[7-10 Intense]
        end

        subgraph OrSlider[Or use slider]
            FullSlider[Detailed slider]
        end
    end
```

## Support Options (Conversational)

When intensity is high, the AI offers options within the chat—no modal or separate screen:

```mermaid
flowchart TB
    subgraph ChatFlow[In Chat Conversation]
        AIMessage[AI: I can feel how intense this is.
        A few paths from here...]

        subgraph Options[Inline Options]
            Opt1[Keep sharing]
            Opt2[Try breathing exercise]
            Opt3[Take a break]
        end

        UserChoice[User taps choice]
    end
```

If user chooses an exercise, it navigates to a dedicated exercise screen with a "Back to chat" option.

### Exercise Screen

When user chooses an exercise, the chat is saved and the exercise appears:

```mermaid
flowchart TB
    subgraph ExerciseScreen[Exercise Screen]
        BackBtn[Back to chat]
        subgraph ExerciseContent[Exercise Content]
            Circle[Animated breathing circle]
            Instruction[Breathe in... 4 seconds]
            Progress[Round 2 of 4]
        end
    end
```

Animation sequence:
1. Circle expands: "Breathe in" (4 seconds)
2. Circle holds: "Hold" (7 seconds)
3. Circle contracts: "Breathe out" (8 seconds)
4. Repeat 4 times

### Post-Exercise Check-in

After the exercise, check in and offer choice (still in overlay):

```mermaid
flowchart TB
    subgraph PostExercise[After Exercise]
        Question[How are you feeling now?]
        Slider[1 -------- 5 -------- 10]
        ChoicePrompt[What would you like to do?]

        subgraph Choices[User Chooses]
            KeepGoing[Keep going]
            TakeBreak[Take a break]
        end
    end
```

No gatekeeping—user chooses their next step regardless of intensity rating. Overlay disappears when they choose, returning them to the chat.

## Trend Visualization (Optional)

For multi-session users, show emotional trends:

```mermaid
flowchart TB
    subgraph TrendView[Emotion Trend]
        TrendTitle[Your emotional journey]

        subgraph Graph[Session Graph]
            S1[Session 1: Avg 7]
            S2[Session 2: Avg 6]
            S3[Session 3: Avg 5]
            S4[Session 4: Avg 4]
            TrendLine[Downward trend line]
        end

        TrendInsight[Your intensity has been
        decreasing over time]
    end
```

## Continuing to Share (No Separate Journal)

The "keep sharing" option means the user continues in the existing chat conversation. This serves the same cathartic purpose as private journaling—they're already writing in a private space with the AI.

If they choose to keep sharing:
- Overlay never appears
- AI continues witnessing and reflecting
- No interruption to their flow
- AI may gently check in on intensity later

## Mobile Adaptations

### Compact Mobile Emotion Check

```mermaid
flowchart LR
    subgraph MobileCompact[Mobile Compact]
        MEmoIcon[Emotion icon]
        MValue[5]
        MTap[Tap]
    end
```

### Mobile Exercise Screen

On mobile, the exercise screen includes a back button for easy return:

```mermaid
flowchart TB
    subgraph MobileExercise[Mobile Exercise Screen]
        MBackBtn[Back to chat]
        MCIcon[Calming illustration]
        MCTitle[Taking a moment]
        MCExercise[Exercise content]
    end
```

## Accessibility Considerations

| Feature | Implementation |
|---------|---------------|
| Color-blind friendly | Icons and labels, not just color |
| Screen reader | Descriptive labels for all states |
| Keyboard navigation | Full keyboard control of slider |
| Reduced motion | Option to disable animations |
| High contrast | Sufficient contrast in all states |

---

## Related Documents

- [Emotional Barometer Mechanism](../mechanisms/emotional-barometer.md)
- [Chat Interface](./chat-interface.md)
- [Core Layout](./core-layout.md)

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
