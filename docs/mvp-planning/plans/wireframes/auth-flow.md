# Authentication & First-Run

Entry experiences for first open, creating an account, signing in, and recovery.

## Flows

```mermaid
flowchart TD
    Open[First open] --> Choice{Have an account?}
    Choice -->|No| Create[Create account]
    Choice -->|Yes| Login[Sign in]
    Create --> Verify[Email/OTP verification]
    Login --> Success[Session starts]
    Verify --> Success
    Success --> Landing[Home Dashboard]

    Open --> InviteLink[Opened from invitation link]
    InviteLink --> DeepLink[Deep link to app]
    DeepLink --> Choice
```

## Screens

### First Open

```mermaid
flowchart TB
    subgraph Welcome[Welcome Screen]
        Brand[Meet Without Fear logo + tagline]
        CTA[Continue]
        Secondary[Already have an account? Sign in]
        Legal[Terms / Privacy links]
    end
```

### Create Account

```mermaid
flowchart TB
    subgraph Create[Create Account]
        Back[Back]
        Title[Create your account]
        Method[Email or phone input]
        CTA2[Continue → send code]
        Alt[Sign in instead]
    end
```

### Verification (OTP)

```mermaid
flowchart TB
    subgraph Verify[Enter Code]
        Instruction[We sent a code to email/phone]
        CodeInput[6-digit code]
        Timer[Resend after 30s]
        Error[Invalid code message]
        CTA3[Verify]
    end
```

### Sign In

```mermaid
flowchart TB
    subgraph Login[Sign In]
        Back2[Back]
        Title2[Sign in]
        Method2[Email or phone input]
        CTA4[Send code]
        Recover[Cannot access this? Contact support]
    end
```

### Account Recovery

```mermaid
flowchart TB
    subgraph Recovery[Account Help]
        Options[No access to email/phone]
        Support[Contact support CTA]
        Hint[Recommend updating contact in profile once in]
    end
```

## Invitation-Aware First Run

```mermaid
flowchart TB
    InviteLink[User taps invitation link]
    StoreInvite[Store invitationId]
    LaunchApp[Launch app]
    AuthGate[Auth flow]
    PostAuth[Accept or decline invitation]

    InviteLink --> StoreInvite --> AuthGate --> PostAuth
```

UX expectations:
- Preserve the invitation through auth and land the user on the Session Dashboard for that invite.
- If the invite expires mid-flow, show a friendly expired state with a “request new invite” CTA.

## Empty / Logged-Out States

| State | Message | CTA |
|-------|---------|-----|
| Logged out | You need to sign in to continue | Sign in / Create account |
| Session expired | Your session expired | Sign in again |
| Missing invite | We could not find that invitation | Return home / Contact support |

## Navigation Targets After Auth

- If launched from invite: `Session Dashboard` for the invitation, then Stage 0 compact.
- If no invite and no sessions: `Home Dashboard` in empty state.
- If existing sessions: `Home Dashboard` with hero card prioritizing the most urgent session.

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
