# Implementation Plan: Session Entry Mood Check

## Overview

Add a popup modal that asks "How are you feeling right now?" when a user navigates to a chat session. This ensures the emotional barometer at the bottom of the chat interface reflects the user's current state when they start or resume a conversation.

## Problem Statement

Currently, when users return to or start a session, the emotional barometer defaults to 5 (the middle value). This may not reflect how the user is actually feeling, making the barometer inaccurate for the conversation. The user wants to be explicitly asked their current emotional state upon entering a chat, similar to how the `IntensityCheck` component works after calming exercises.

## Solution Design

### Approach: Reuse IntensityCheck Component with Session Entry Modal

Create a new `SessionEntryMoodCheck` modal component that wraps the existing `IntensityCheck` slider pattern, triggered when a user enters a session. The modal will:

1. Appear as an overlay when navigating to a session
2. Ask "How are you feeling right now?" with a 1-10 slider (same gradient as `IntensityCheck`)
3. Store the value and dismiss when user taps "Continue" button
4. Update the barometer value before chat interaction begins

### Key Design Decisions

1. **Reuse existing UI patterns**: Leverage `IntensityCheck`'s slider and color gradient for consistency
2. **Show before chat interaction**: Present as a blocking overlay similar to `CuriosityCompactOverlay`
3. **Persist across app restarts**: Store last mood check timestamp to decide when to show again
4. **Skip if recently checked**: If user just completed an exercise and set intensity, don't ask again

## Implementation Steps

### Step 1: Create SessionEntryMoodCheck Component

**File:** `mobile/src/components/SessionEntryMoodCheck.tsx`

Create a modal component that:
- Uses the same slider pattern as `IntensityCheck`
- Has title "How are you feeling right now?"
- Shows current value with color-coded label (Calm/Elevated/Intense)
- Has "Continue to chat" button
- Full-screen modal with dark overlay background

```typescript
interface SessionEntryMoodCheckProps {
  visible: boolean;
  initialValue?: number;
  onComplete: (intensity: number) => void;
}
```

### Step 2: Add State to Track Mood Check in useUnifiedSession

**File:** `mobile/src/hooks/useUnifiedSession.ts`

Add state and logic:
1. Add `showSessionEntryMoodCheck` to `UnifiedSessionState`
2. Add `needsMoodCheck` derived value based on:
   - Session just loaded (first render)
   - Not currently showing compact overlay
   - Not in an exercise overlay
   - Barometer value has not been set this session entry
3. Add `handleSessionEntryMoodComplete` action

### Step 3: Track Session Entry in UnifiedSessionScreen

**File:** `mobile/src/screens/UnifiedSessionScreen.tsx`

Add the mood check overlay:
1. Import `SessionEntryMoodCheck` component
2. Add state for showing the modal (local state, not in hook)
3. Show modal after compact is signed AND before allowing chat interaction
4. On completion, call `handleBarometerChange` with the selected value

### Step 4: Handle "Skip if Recently Set" Logic

Add logic to skip the mood check if:
- User just completed a calming exercise (intensity was just set)
- User just signed the compact (first-time entry shows mood check)
- Session was opened within the last few minutes and mood was already set

### Step 5: Integration Flow

The order of overlays when entering a session:
1. **Loading state** (if data still loading)
2. **CuriosityCompactOverlay** (if compact not yet signed)
3. **SessionEntryMoodCheck** (after compact signed, before chat)
4. **Chat interface** (after mood check completed)

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `mobile/src/components/SessionEntryMoodCheck.tsx` | Create | New mood check modal component |
| `mobile/src/hooks/useUnifiedSession.ts` | Modify | Add mood check state and handler |
| `mobile/src/screens/UnifiedSessionScreen.tsx` | Modify | Add mood check overlay rendering |

## Component Details

### SessionEntryMoodCheck Component Structure

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│                                             │
│       How are you feeling right now?        │
│                                             │
│              5 - Elevated                   │
│                                             │
│       [======●=====] Slider                 │
│       Calm    Elevated    Intense           │
│                                             │
│         [ Continue to chat ]                │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

### Integration in UnifiedSessionScreen

```jsx
{/* Session Entry Mood Check - shown after compact signed, before chat */}
{shouldShowMoodCheck && (
  <SessionEntryMoodCheck
    visible={true}
    initialValue={barometerValue}
    onComplete={(intensity) => {
      handleBarometerChange(intensity);
      setShowMoodCheck(false);
    }}
  />
)}
```

### Decision Logic for Showing Mood Check

```typescript
const shouldShowMoodCheck = useMemo(() => {
  // Don't show if:
  // 1. Still loading
  if (isLoading) return false;
  // 2. Compact not yet signed (show compact overlay first)
  if (shouldShowCompactOverlay) return false;
  // 3. Already completed mood check this session entry
  if (hasCompletedMoodCheck) return false;
  // 4. Currently in an exercise overlay
  if (activeOverlay) return false;

  // Show mood check for all session entries
  return true;
}, [isLoading, shouldShowCompactOverlay, hasCompletedMoodCheck, activeOverlay]);
```

## Testing Considerations

1. **Test mood check appears on fresh session entry**
2. **Test mood check skipped if exercise just completed**
3. **Test barometer value updates after mood check**
4. **Test overlay stacking (compact -> mood check -> chat)**
5. **Test back navigation during mood check**

## Edge Cases

1. **App backgrounded during mood check**: Should persist state and show again on return
2. **Network error during session load**: Don't show mood check until data loads
3. **Quick re-entry to same session**: Consider debounce or time-based skip logic
4. **Exercise completion followed by session re-entry**: Skip mood check if recent

## Acceptance Criteria

- [ ] When navigating to any chat session, a modal asks "How are you feeling right now?"
- [ ] The modal uses the same 1-10 slider style as post-exercise IntensityCheck
- [ ] The selected value updates the emotional barometer at bottom of chat
- [ ] Modal appears after compact signing but before chat becomes interactive
- [ ] User cannot interact with chat until mood check is completed
- [ ] If user just completed an exercise (intensity recently set), skip the prompt
