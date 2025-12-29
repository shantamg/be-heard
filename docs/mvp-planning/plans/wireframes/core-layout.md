# Core Layout

Base app structure that persists across all screens.

## Desktop Layout

```mermaid
flowchart TB
    subgraph DesktopApp[Desktop App - 1200px+]
        subgraph TopBar[Top Navigation Bar]
            Logo[Meet Without Fear]
            StageIndicator[Stage 2 of 4]
            Profile[User Menu]
        end

        subgraph MainArea[Main Content Area]
            subgraph Sidebar[Left Sidebar - 280px]
                SessionInfo[Session Info]
                PartnerStatus[Partner Status]
                MyProgress[My Progress]
                SharedContent[Shared Content Preview]
            end

            subgraph Content[Main Content - Flex]
                ChatArea[Chat or Stage Content]
            end
        end

        subgraph BottomBar[Input Area]
            EmotionMini[Emotion Quick Check]
            InputField[Message Input]
            SendBtn[Send]
        end
    end
```

## Mobile Layout

```mermaid
flowchart TB
    subgraph MobileApp[Mobile App - Under 768px]
        subgraph MobileTop[Top Bar]
            BackBtn[Back]
            MobileLogo[Meet Without Fear]
            MobileStage[S2]
            MenuBtn[Menu]
        end

        subgraph MobileContent[Content Area - Scrollable]
            MobileChat[Chat Messages]
        end

        subgraph MobileBottom[Bottom Area - Fixed]
            MobileEmotion[Emotion Check]
            MobileInput[Type message...]
            MobileSend[Send]
        end
    end
```

## Stage Indicator States

```mermaid
flowchart LR
    subgraph StageBar[Stage Progress Bar]
        S0[0]
        S1[1]
        S2[2]
        S3[3]
        S4[4]
    end

    S0 -->|Complete| S1
    S1 -->|Complete| S2
    S2 -->|Current| S3
    S3 -->|Locked| S4
```

Stage indicator styling:

| State | Visual |
|-------|--------|
| Complete | Filled circle with checkmark |
| Current | Highlighted, pulsing indicator |
| Locked | Grayed out, locked icon |
| Partner ahead | Badge showing partner completed |

## Partner Status Widget

```mermaid
flowchart TB
    subgraph PartnerWidget[Partner Status]
        Avatar[Partner Avatar/Initial]
        Name[Partner Name]
        Status[Currently in Stage 1]
        LastActive[Active 2 hours ago]
    end
```

Status messages:

| Situation | Display |
|-----------|---------|
| Both in same stage | "Working on Stage X together" |
| Partner ahead | "Completed Stage X - waiting for you" |
| User ahead | "Partner still in Stage X" |
| Partner in cooling | "Partner taking a break" |
| Partner offline | "Last active: time ago" |

## Color Palette

| Element | Purpose |
|---------|---------|
| Primary | Calm blue - trust and stability |
| Accent | Soft green - growth and progress |
| Warning | Warm amber - attention needed |
| Alert | Soft coral - cooling period |
| Background | Off-white - reduces eye strain |
| Text | Dark gray - not harsh black |

## Typography

| Element | Specification |
|---------|--------------|
| Headings | Clear, rounded sans-serif |
| Body | Readable, comfortable spacing |
| AI messages | Slightly different weight/style |
| User messages | Standard weight |

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| 1200px+ | Full desktop with sidebar |
| 768-1199px | Tablet - collapsible sidebar |
| Under 768px | Mobile - no sidebar, bottom sheet menus |

---

## Related Documents

- [Chat Interface](./chat-interface.md)
- [Stage Controls](./stage-controls.md)
- [Emotional Barometer UI](./emotional-barometer-ui.md)

---

[Back to Wireframes](./index.md) | [Back to Plans](../index.md)
