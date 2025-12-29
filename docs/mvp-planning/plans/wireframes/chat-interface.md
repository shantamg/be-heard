# Chat Interface

The primary conversation interface where users interact with the AI.

## Core Chat Layout

```mermaid
flowchart TB
    subgraph ChatScreen[Chat Interface]
        subgraph Header[Chat Header]
            StageTitle[Stage 1: The Witness]
            StageDesc[Share your perspective]
            ProgressDots[Progress indicators]
        end

        subgraph Messages[Message Area - Scrollable]
            AI1[AI: Welcome message]
            User1[User: Response]
            AI2[AI: Reflection]
            User2[User: More detail]
            AI3[AI: Deeper reflection]
            Typing[AI is composing...]
        end

        subgraph Input[Input Area - Fixed]
            EmotionCheck[Feeling: 5/10]
            TextField[Type your thoughts...]
            SendButton[Send]
        end
    end
```

## Message Bubbles

### AI Message

```mermaid
flowchart TB
    subgraph AIBubble[AI Message]
        Avatar[AI Avatar]
        Content[Message content with
        warm supportive tone
        and reflection]
        Time[2:34 PM]
    end
```

Characteristics:
- Left-aligned
- Subtle background color
- AI avatar/icon
- No typing indicator shown during composition

### User Message

```mermaid
flowchart TB
    subgraph UserBubble[User Message]
        UserContent[User message content
        can be multiple lines
        and as long as needed]
        UserTime[2:35 PM]
        Status[Sent]
    end
```

Characteristics:
- Right-aligned
- User-colored background
- Timestamp
- Sent/read status

## Stage-Specific Variations

### Stage 0: Onboarding Chat

```mermaid
flowchart TB
    subgraph OnboardingChat[Onboarding View]
        Header0[Welcome to Meet Without Fear]

        subgraph Content0[Compact Presentation]
            Intro[Process explanation]
            Diagram[Stage overview diagram]
            Compact[Curiosity Compact text]
        end

        subgraph Actions0[Action Buttons]
            Questions[I have questions]
            Sign[Sign and Begin]
        end
    end
```

### Stage 1: The Witness Chat

```mermaid
flowchart TB
    subgraph WitnessChat[The Witness View]
        Header1[Stage 1: The Witness]

        subgraph Chat1[Open Conversation]
            AI11[Take your time. What would you like to share?]
            User11[User shares perspective]
            AI12[So what I hear is... Is that right?]
        end

        subgraph Completion1[Completion Check - Appears Later]
            HeardQ[Do you feel fully heard?]
            NotYet[Not yet - tell me more]
            YesHeard[Yes I feel heard]
        end
    end
```

### Stage 2: Perspective Stretch Chat

```mermaid
flowchart TB
    subgraph StretchChat[Perspective Stretch View]
        Header2[Stage 2: Understanding Their View]

        subgraph OtherPerspective[Partner Perspective Panel]
            PTitle[What your partner shared]
            PSummary[Curated summary of key points and needs]
        end

        subgraph Chat2[Reflection Conversation]
            AI21[How does hearing this land for you?]
            User21[User response]
            AI22[AI reflection or intervention]
        end
    end
```

### Stage 3: Need Mapping Chat

```mermaid
flowchart TB
    subgraph NeedChat[Need Mapping View]
        Header3[Stage 3: Finding Common Ground]

        subgraph NeedPanels[Need Panels]
            subgraph YourNeeds[Your Needs]
                YN1[Safety]
                YN2[Recognition]
            end
            subgraph TheirNeeds[Their Needs]
                TN1[Connection]
                TN2[Safety]
            end
        end

        subgraph CommonPanel[Common Ground]
            Common[Both need: Safety]
        end

        subgraph Chat3[Exploration]
            AI31[AI explores needs]
        end
    end
```

### Stage 4: Repair Chat

```mermaid
flowchart TB
    subgraph RepairChat[Strategic Repair View]
        Header4[Stage 4: Moving Forward]

        subgraph ProposalArea[Proposals]
            YourProp[Your proposal: Daily check-in]
            TheirProp[Their proposal: Weekly date]
            PropStatus[Awaiting response]
        end

        subgraph AgreedArea[Agreements]
            Agreed1[Agreed: 10-min daily conversation]
        end

        subgraph Chat4[Negotiation]
            AI41[AI facilitates discussion]
        end
    end
```

## Empty States

### Waiting for Partner

```mermaid
flowchart TB
    subgraph WaitingState[Waiting State]
        WaitIcon[Hourglass or calm illustration]
        WaitTitle[Waiting for partner]
        WaitMessage[Your partner has not completed
        this stage yet. You can
        review your progress or
        take a break.]
        WaitActions[Review my sharing - Take a break]
    end
```

### Session Not Started

```mermaid
flowchart TB
    subgraph NotStarted[Session Not Started]
        NSIcon[Envelope illustration]
        NSTitle[Invitation sent]
        NSMessage[Your partner has not
        accepted the invitation yet.
        We will notify you when
        they join.]
        NSActions[Resend invitation - Edit message]
    end
```

## Input Area Details

```mermaid
flowchart TB
    subgraph InputDetailed[Input Area Detail]
        subgraph EmotionMini[Emotion Indicator]
            EmoLabel[Feeling:]
            EmoValue[5]
            EmoSlider[Small slider or tap to expand]
        end

        subgraph TextInput[Text Input]
            Placeholder[Share your thoughts...]
            TextArea[Expandable text area]
            CharCount[Optional character count]
        end

        subgraph Actions[Actions]
            Attach[Attach file]
            Send[Send arrow]
        end
    end
```

## Attachment Support

```mermaid
flowchart TB
    subgraph AttachmentFlow[Document Attachment]
        AttachBtn[Attach button] --> FileSelect[File picker]
        FileSelect --> Preview[Attachment preview]
        Preview --> Confirm[Add to message]
        Confirm --> Uploaded[Attached: document.pdf]
    end
```

Supported types:
- Images (screenshots of texts, etc.)
- PDFs (documents, emails)
- Text files

:::tip See it in action
<a href="/demo/features/attachments.html" target="_blank" rel="noreferrer">Try the Attachment Support demo →</a> - See how screenshots and documents are shared for context.
:::

---

## Related Documents

- [Core Layout](./core-layout.md)
- [Stage Controls](./stage-controls.md)
- [Emotional Barometer UI](./emotional-barometer-ui.md)

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
