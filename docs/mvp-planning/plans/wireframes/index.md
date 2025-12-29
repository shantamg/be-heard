# Wireframes

UI concepts and screen layouts for key Meet Without Fear interfaces.

## Documents

### Navigation & Dashboard
- **[Home Dashboard](./home-dashboard.md)** - Primary landing screen with smart hero card
- **[Person Detail](./person-detail.md)** - Relationship view with session history
- **[Session Dashboard](./session-dashboard.md)** - Preparation space before stage work
- **[New Session Flow](./new-session-flow.md)** - Invitation and session creation
- **[Authentication & First-Run](./auth-flow.md)** - Signup, login, and first-open states

### Core Experience
- **[Core Layout](./core-layout.md)** - Base app structure and navigation
- **[Chat Interface](./chat-interface.md)** - The primary conversation interface
- **[Stage Controls](./stage-controls.md)** - Stage progression and status UI
- **[Emotional Barometer UI](./emotional-barometer-ui.md)** - Emotion tracking interface
- **[Notifications UX](./notifications.md)** - Push, toast, inbox, and preferences

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| Minimalist | Reduce cognitive load during emotional work |
| No typing indicators | Reduce pressure and comparison |
| Stage-controlled | UI adapts to current stage |
| Calm aesthetic | Support emotional regulation |
| Clear boundaries | Visual separation of private/shared content |

## Screen Overview

```mermaid
flowchart TB
    subgraph Entry[Entry Screens]
        Login[Login]
        Accept[Accept Invitation]
    end

    subgraph Dashboard[Dashboard Layer]
        Home[Home Dashboard]
        PersonDetail[Person Detail]
        SessionDash[Session Dashboard]
        NewSession[New Session Flow]
    end

    subgraph Onboarding[Onboarding]
        Compact[Curiosity Compact]
        Wait[Waiting Room]
    end

    subgraph Core[Core Experience]
        Chat[Chat Interface]
        Progress[Progress View]
    end

    subgraph Support[Support Screens]
        Emotion[Emotion Check]
        Cooling[Cooling Period]
        Consent[Consent Dialog]
    end

    Entry --> Home
    Home --> PersonDetail
    Home --> NewSession
    PersonDetail --> SessionDash
    SessionDash --> Onboarding
    Onboarding --> Core
    Core --> Support
    Support --> Core
```

---

[Back to Plans](../index.md)
