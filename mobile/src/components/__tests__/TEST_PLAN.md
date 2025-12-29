# Test Plan: New Chat Components

This document outlines comprehensive test specifications for the new chat components being built for the Meet Without Fear mobile application. Tests follow the established patterns from existing test files such as `ChatInterface.test.tsx`, `SessionChatHeader.test.tsx`, and `CuriosityCompact.test.tsx`.

---

## 1. SimpleChatHeader Component

**Purpose**: Shows partner/person name and connection status in a minimal, chat-centric header.

### Props Interface (Expected)
```typescript
interface SimpleChatHeaderProps {
  personName?: string | null;
  isOnline?: boolean;
  isTyping?: boolean;
  connectionStatus?: ConnectionStatus;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}
```

### Test Cases

#### 1.1 Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders default name when no person provided` | Render without personName prop | Shows "Meet Without Fear" as fallback name |
| `renders person name when provided` | Render with personName="Alex" | Shows "Alex" |
| `truncates long names` | Render with very long name (50+ chars) | Name is truncated with ellipsis |
| `handles empty string name` | Render with personName="" | Shows fallback name or handles gracefully |
| `handles null name` | Render with personName={null} | Shows fallback name |

#### 1.2 Status Display
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `shows offline status by default` | Render with person but no isOnline prop | Shows "offline" status |
| `shows online status when person is online` | Render with isOnline={true} | Shows "online" status with accent color |
| `shows typing indicator when person is typing` | Render with isTyping={true} | Shows animated typing dots, hides status text |
| `shows connecting status during connection` | Render with connectionStatus=CONNECTING | Shows "connecting..." |
| `shows suspended status` | Render with connectionStatus=SUSPENDED | Shows "connecting..." |
| `shows error status on connection failure` | Render with connectionStatus=FAILED | Shows "connection lost" with error color |
| `shows AI assistant status for AI mode` | Render without personName (AI mode) | Shows "AI assistant" status |
| `prioritizes typing over connection status` | Render with both isTyping and connectionStatus | Shows typing indicator |

#### 1.3 Status Dot
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders green dot when online` | Person is online | Dot has accent/green color |
| `renders gray dot when offline` | Person is offline | Dot has muted/gray color |
| `renders yellow dot when connecting` | Connection is establishing | Dot has warning/yellow color |
| `renders red dot when connection failed` | Connection failed | Dot has error/red color |

#### 1.4 User Interactions
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `calls onPress when header is pressed` | Press the header with onPress handler | onPress callback is invoked |
| `does not render touchable when no onPress` | Render without onPress | No TouchableOpacity wrapper |
| `handles rapid successive presses` | Press header multiple times quickly | Each press invokes callback once |

#### 1.5 Accessibility
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `has accessible name element` | Check accessibility | Name text is accessible |
| `has accessible status element` | Check accessibility | Status text is accessible |
| `supports custom testID` | Render with testID="custom-header" | Uses custom testID prefix |
| `announces status changes` | Status changes from offline to online | Screen reader can announce change |

#### 1.6 Edge Cases
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `handles undefined props gracefully` | Render with minimal props | No crashes, shows defaults |
| `handles rapid status changes` | Toggle isOnline rapidly | Displays correct final state |
| `applies custom styles` | Pass style prop | Custom styles are applied to container |

---

## 2. ChatMessage Component (Updated)

**Purpose**: Displays chat messages with AI messages full-width and no timestamps.

### Props Interface (Expected)
```typescript
interface ChatMessageProps {
  message: {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: string;
    isIntervention?: boolean;
    status?: MessageDeliveryStatus;
  };
  showTimestamp?: boolean;
  testID?: string;
}
```

### Test Cases

#### 2.1 AI Message Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders AI messages full-width` | Render message with role=AI | Message bubble has full width (no maxWidth restriction) |
| `AI messages have no timestamp` | Render AI message | No timestamp displayed by default |
| `AI messages left-aligned` | Render AI message | Container aligned to flex-start |
| `AI messages have correct background` | Render AI message | Uses AI bubble background color |
| `AI messages have asymmetric border radius` | Render AI message | Different border radius on bottom-left |

#### 2.2 User Message Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders user messages right-aligned` | Render message with role=USER | Container aligned to flex-end |
| `user messages have constrained width` | Render user message | maxWidth is approximately 85% |
| `user messages show timestamp when enabled` | Render with showTimestamp=true | Timestamp is visible |
| `user messages have correct background` | Render user message | Uses user bubble background color |
| `user messages have symmetric border radius` | Render user message | Consistent 16px border radius |

#### 2.3 System Message Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders system messages centered` | Render message with role=SYSTEM | Container centered |
| `system messages have tertiary background` | Render system message | Uses bgTertiary color |
| `system messages have smaller font` | Render system message | Uses smaller font size |
| `system messages have muted text color` | Render system message | Text is textSecondary color |

#### 2.4 Intervention Message Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders intervention with warning style` | Render with isIntervention=true | Warning background with left border |
| `intervention has left border accent` | Render intervention message | 3px left border in warning color |
| `intervention messages are full-width` | Render intervention message | Full width like AI messages |

#### 2.5 Message Delivery Status
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `shows "Sending..." status` | Render with status="sending" | Italic "Sending..." text |
| `shows "Sent" status` | Render with status="sent" | "Sent" text |
| `shows "Delivered" status` | Render with status="delivered" | "Delivered" text |
| `shows "Read" status with accent` | Render with status="read" | "Read" text in accent color |
| `only shows status for user messages` | Render AI message with status | No status displayed |

#### 2.6 Content Display
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `displays message content` | Render with content="Hello" | Shows "Hello" |
| `handles special characters` | Render with emoji and symbols | Displays correctly |
| `handles very long messages` | Render 500+ character message | Text wraps, no overflow |
| `handles multi-line messages` | Render message with newlines | Preserves line breaks |
| `handles empty content` | Render with content="" | Renders empty bubble gracefully |

#### 2.7 Accessibility
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `has testID with message id` | Render message with id="123" | testID is "chat-bubble-123" |
| `message content is accessible` | Check accessibility | Content text is readable by screen readers |
| `status is accessible` | User message with status | Status text is accessible |

#### 2.8 Edge Cases
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `handles malformed timestamp` | Invalid timestamp string | Gracefully handles or shows fallback |
| `handles missing optional props` | Minimal required props only | No crashes |
| `handles rapid content updates` | Content changes quickly | Shows final content correctly |

---

## 3. EmotionSlider Component

**Purpose**: Slider component for capturing emotional intensity with callbacks.

### Props Interface (Expected)
```typescript
interface EmotionSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showIntensityLabel?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}
```

### Test Cases

#### 3.1 Slider Rendering
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders slider with current value` | Render with value=5 | Slider positioned at value 5 |
| `renders with custom min/max` | min=0, max=10 | Slider range is 0-10 |
| `renders with default range` | No min/max props | Uses sensible defaults (e.g., 1-10) |
| `shows label when provided` | Render with label="Intensity" | Label text is visible |
| `hides label when not provided` | No label prop | No label element |

#### 3.2 Intensity Labels
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `shows "Calm" for low values (1-3)` | value=2 | Shows "Calm" intensity label |
| `shows "Elevated" for medium values (4-6)` | value=5 | Shows "Elevated" intensity label |
| `shows "Intense" for high values (7-10)` | value=8 | Shows "Intense" intensity label |
| `updates intensity label on change` | Value changes from 3 to 7 | Label changes from "Calm" to "Intense" |
| `shows scale labels at ends` | Default render | "Calm" on left, "Intense" on right |

#### 3.3 User Interactions
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `calls onChange when slider moves` | Slide to value 7 | onChange called with 7 |
| `calls onChange with step values` | step=1, slide between | Only integer values passed |
| `does not call onChange when disabled` | disabled=true, attempt slide | onChange not called |
| `handles rapid value changes` | Slide quickly back and forth | Final value is correct |
| `calls onChange on touch end` | Complete a slide gesture | onChange receives final value |

#### 3.4 Visual Feedback
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `shows current value indicator` | Render with value=5 | Visual indicator shows "5" |
| `updates visual feedback on change` | Value changes | Visual indicator updates |
| `shows suggestion at high intensity` | value >= 9 | Shows breathing exercise suggestion |
| `no suggestion at moderate intensity` | value < 9 | No suggestion shown |

#### 3.5 Disabled State
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `applies disabled styling` | disabled=true | Slider appears muted/inactive |
| `prevents interaction when disabled` | disabled=true | Cannot change value |
| `maintains value when disabled` | disabled=true | Current value still displayed |

#### 3.6 Accessibility
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `has accessible slider role` | Check accessibility | Has slider role |
| `announces current value` | Focus on slider | Screen reader reads value |
| `supports adjustable trait` | iOS accessibility | Has adjustable trait |
| `supports custom testID` | testID="emotion-slider" | Element has testID |

#### 3.7 Edge Cases
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `clamps value below min` | value=-5, min=0 | Displays at minimum |
| `clamps value above max` | value=15, max=10 | Displays at maximum |
| `handles float values` | value=5.5 | Rounds appropriately |
| `handles undefined onChange gracefully` | No onChange prop | No crash on interaction |

---

## 4. InlineCompact Component

**Purpose**: Compact inline component with checkbox, sign button, and confirmation flow for Curiosity Compact.

### Props Interface (Expected)
```typescript
interface InlineCompactProps {
  sessionId: string;
  onSign: () => void;
  onCancel?: () => void;
  showQuestions?: boolean;
  onQuestions?: () => void;
  testID?: string;
}
```

### Test Cases

#### 4.1 Content Display
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `renders title "The Curiosity Compact"` | Default render | Title is visible |
| `renders subtitle/description` | Default render | Subtitle about reviewing commitments |
| `renders compact terms` | Default render | Compact terms content visible |
| `renders commitment items` | Default render | All commitment items listed |
| `renders understanding items` | Default render | All understanding items listed |

#### 4.2 Checkbox Behavior
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `checkbox unchecked by default` | Initial render | Checkbox is not checked |
| `toggles checkbox on press` | Press checkbox | Checkbox becomes checked |
| `checkbox toggles back off` | Press checked checkbox | Checkbox becomes unchecked |
| `checkbox has accessible role` | Check accessibility | Has checkbox role |
| `checkbox state accessible` | Check accessibility | State (checked/unchecked) announced |
| `checkbox label is visible` | Default render | "I agree to proceed with curiosity" text |

#### 4.3 Sign Button Behavior
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `sign button disabled when unchecked` | Checkbox unchecked | Button is disabled |
| `sign button enabled when checked` | Checkbox checked | Button is enabled |
| `sign button shows "Sign and Begin"` | Default render | Button text is correct |
| `sign button shows "Signing..." when pending` | isPending=true | Button shows loading text |
| `sign button disabled when pending` | isPending=true | Button is disabled during submission |
| `calls onSign after successful sign` | Press enabled button | onSign callback invoked |

#### 4.4 Sign Flow Integration
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `calls signCompact mutation on sign` | Complete sign flow | signCompact mutation called |
| `passes sessionId to mutation` | Sign with sessionId="123" | Mutation receives sessionId |
| `onSign called after mutation success` | Mutation succeeds | onSign callback invoked |
| `handles mutation error gracefully` | Mutation fails | Error handled, no crash |

#### 4.5 Questions Button
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `shows questions button` | Default render | "I have questions" button visible |
| `calls onQuestions when pressed` | Press questions button | onQuestions callback invoked |
| `hides questions when showQuestions=false` | showQuestions=false | Questions button not rendered |

#### 4.6 Confirmation Flow
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `requires checkbox before enabling sign` | Try to sign unchecked | Button remains disabled |
| `full flow: check -> sign -> callback` | Complete user flow | All steps work correctly |
| `prevents double submission` | Press sign twice quickly | Only one submission |

#### 4.7 Accessibility
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `checkbox has accessible role` | Check accessibility | accessibilityRole="checkbox" |
| `sign button has accessible role` | Check accessibility | accessibilityRole="button" |
| `disabled state is accessible` | Button disabled | accessibilityState.disabled=true |
| `supports custom testID` | testID="inline-compact" | Elements have testID prefix |

#### 4.8 Styling
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `applies custom style prop` | style={marginTop: 20} | Style applied to container |
| `sign button has correct enabled styling` | Checkbox checked | Button has accent background |
| `sign button has correct disabled styling` | Checkbox unchecked | Button has muted background |
| `checkbox has correct checked styling` | Checkbox checked | Accent background with checkmark |

#### 4.9 Edge Cases
| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| `handles missing onSign gracefully` | No onSign prop | No crash when signing |
| `handles rapid checkbox toggles` | Toggle many times quickly | Final state is correct |
| `handles unmount during pending` | Component unmounts during sign | No memory leak or error |

---

## Mock Setup Patterns

### Slider Mock (Required)
```typescript
jest.mock('@react-native-community/slider', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      testID,
      value,
      onValueChange,
      minimumValue,
      maximumValue,
    }: {
      testID: string;
      value: number;
      onValueChange: (value: number) => void;
      minimumValue?: number;
      maximumValue?: number;
    }) => (
      <View testID={testID}>
        <Text>{value}</Text>
      </View>
    ),
  };
});
```

### Hook Mocks (Required for InlineCompact)
```typescript
const mockSignCompact = jest.fn();
jest.mock('../../hooks/useStages', () => ({
  useSignCompact: () => ({
    mutate: mockSignCompact,
    isPending: false,
  }),
}));
```

### Icon Mocks (If needed)
```typescript
jest.mock('lucide-react-native', () => ({
  Check: 'Check',
  ChevronLeft: 'ChevronLeft',
  // Add other icons as needed
}));
```

---

## Test File Structure

Each test file should follow this structure:

```typescript
/**
 * [ComponentName] Component Tests
 *
 * Tests for [brief description of component purpose].
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ComponentName } from '../ComponentName';
// Import any types/enums needed

// ============================================================================
// Mocks
// ============================================================================

// Add necessary mocks here

// ============================================================================
// Helpers
// ============================================================================

// Add helper functions for creating mock data

// ============================================================================
// Tests
// ============================================================================

describe('ComponentName', () => {
  const defaultProps = {
    // Default props for most tests
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    // Rendering tests
  });

  describe('User Interactions', () => {
    // Interaction tests
  });

  describe('Accessibility', () => {
    // Accessibility tests
  });

  describe('Edge Cases', () => {
    // Edge case tests
  });
});
```

---

## Coverage Requirements

Per project standards:
- Statements: >80%
- Branches: >75%
- Functions: >80%
- Lines: >80%

---

## Running Tests

```bash
# Run all mobile tests
cd mobile && npm run test

# Run specific test file
npm run test -- SimpleChatHeader.test.tsx

# Run with coverage
npm run test -- --coverage

# Run in watch mode
npm run test -- --watch
```

---

## Priority Order

1. **SimpleChatHeader** - Core chat UI, builds on SessionChatHeader pattern
2. **ChatMessage (Updated)** - Core chat UI, extends existing ChatBubble
3. **InlineCompact** - Builds on CuriosityCompact pattern, critical for onboarding
4. **EmotionSlider** - Builds on EmotionalBarometer pattern

---

## Notes

- All tests should use `@testing-library/react-native` patterns
- Prefer `getByTestId` and `getByText` over implementation details
- Use `fireEvent` for user interactions
- Use `waitFor` for async operations
- Mock external dependencies (hooks, icons, native modules)
- Each test should be independent and not rely on test order
