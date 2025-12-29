# Inline UI Trigger System Specification

## Overview

This specification defines a system for rendering interactive UI components inline within the chat message flow. The system enables AI messages to trigger contextual UI elements (confirmation buttons, signing prompts, emotional support options, partner status cards) that users can interact with directly in the chat interface.

## Design Goals

1. **Declarative**: AI messages specify what UI to show through a type field
2. **Composable**: Multiple trigger types can be combined or sequenced
3. **Reactive**: Triggers emit events back to parent for state management
4. **FlatList Compatible**: Works seamlessly within React Native FlatList

## Architecture

```
                                    +-------------------+
                                    |  Parent Screen    |
                                    |  (Session/Chat)   |
                                    +---------+---------+
                                              |
                                              | onTriggerAction(triggerId, action, payload)
                                              |
                                    +---------v---------+
                                    |  ChatInterface    |
                                    |  (FlatList)       |
                                    +---------+---------+
                                              |
                                              | renderItem
                                              |
                              +---------------+---------------+
                              |               |               |
                    +---------v----+  +-------v------+  +----v----------+
                    | ChatBubble   |  | TriggerItem  |  | TypingIndicator|
                    | (text only)  |  | (UI trigger) |  |               |
                    +--------------+  +------+-------+  +---------------+
                                             |
                          +------------------+------------------+
                          |          |           |              |
                   +------v---+ +----v----+ +----v-----+ +------v------+
                   |Compact   | |FeelHeard| |Emotion   | |Partner      |
                   |Signing   | |Confirm  | |Support   | |Status       |
                   +----------+ +---------+ +----------+ +-------------+
```

## Type Definitions

### Trigger Types Enum

```typescript
// shared/src/enums.ts

/**
 * Types of inline UI triggers that can appear in the chat
 */
export enum TriggerType {
  // Stage 0 - Onboarding
  CURIOSITY_COMPACT = 'CURIOSITY_COMPACT',

  // Stage 1 - The Witness
  FEEL_HEARD_CONFIRMATION = 'FEEL_HEARD_CONFIRMATION',

  // Emotional Support (any stage)
  EMOTION_SUPPORT_OPTIONS = 'EMOTION_SUPPORT_OPTIONS',
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  GROUNDING_EXERCISE = 'GROUNDING_EXERCISE',
  BODY_SCAN = 'BODY_SCAN',
  PAUSE_SESSION = 'PAUSE_SESSION',

  // Stage 2 - Perspective Stretch
  ACCURACY_FEEDBACK = 'ACCURACY_FEEDBACK',
  EMPATHY_ATTEMPT_CARD = 'EMPATHY_ATTEMPT_CARD',

  // Stage 3 - Need Mapping
  NEEDS_SECTION = 'NEEDS_SECTION',
  COMMON_GROUND_CARD = 'COMMON_GROUND_CARD',

  // Stage 4 - Strategic Repair
  STRATEGY_RANKING = 'STRATEGY_RANKING',
  OVERLAP_REVEAL = 'OVERLAP_REVEAL',
  AGREEMENT_CARD = 'AGREEMENT_CARD',

  // Cross-stage
  PARTNER_STATUS = 'PARTNER_STATUS',
  WAITING_STATUS = 'WAITING_STATUS',
  CONSENT_PROMPT = 'CONSENT_PROMPT',
}
```

### Trigger State Enum

```typescript
// shared/src/enums.ts

/**
 * State of a trigger's lifecycle
 */
export enum TriggerState {
  PENDING = 'PENDING',     // Awaiting user interaction
  COMPLETED = 'COMPLETED', // User has interacted
  DISMISSED = 'DISMISSED', // User dismissed without completing
  EXPIRED = 'EXPIRED',     // No longer valid
}
```

### Message With Trigger Interface

```typescript
// shared/src/dto/message.ts

/**
 * Payload types for each trigger type
 */
export interface CuriosityCompactPayload {
  terms: string[];
  sessionId: string;
}

export interface FeelHeardPayload {
  question?: string;       // Override default question
  continueLabel?: string;  // Override "Not yet" button
  confirmLabel?: string;   // Override "Yes, I feel heard" button
}

export interface EmotionSupportPayload {
  options: EmotionalSupportType[];
  intensityBefore: number;
  suggestedOption?: EmotionalSupportType;
}

export interface BreathingExercisePayload {
  intensityBefore: number;
  cycles?: number;
  phaseDuration?: number;
}

export interface AccuracyFeedbackPayload {
  perspectiveSummary: string;
  feedbackId: string;
}

export interface NeedsSectionPayload {
  userNeeds: NeedDTO[];
  partnerNeeds: NeedDTO[];
}

export interface CommonGroundPayload {
  sharedNeed: NeedDTO;
  insight: string;
}

export interface StrategyRankingPayload {
  strategies: StrategyDTO[];
  maxSelections?: number;
  partnerName?: string;
}

export interface OverlapRevealPayload {
  userSelections: StrategyDTO[];
  partnerSelections: StrategyDTO[];
  overlaps: StrategyDTO[];
}

export interface AgreementCardPayload {
  agreement: AgreementDTO;
  checkInDate?: string;
}

export interface PartnerStatusPayload {
  partnerName: string;
  partnerInitial?: string;
  statusMessage: string;
  currentStage?: number;
  progress?: number;
}

export interface WaitingStatusPayload {
  partnerName: string;
  message: string;
  currentStage?: number;
  totalStages?: number;
}

export interface ConsentPromptPayload {
  contentType: ConsentContentType;
  contentPreview: string;
  consentId: string;
}

/**
 * Union type of all trigger payloads
 */
export type TriggerPayload =
  | CuriosityCompactPayload
  | FeelHeardPayload
  | EmotionSupportPayload
  | BreathingExercisePayload
  | AccuracyFeedbackPayload
  | NeedsSectionPayload
  | CommonGroundPayload
  | StrategyRankingPayload
  | OverlapRevealPayload
  | AgreementCardPayload
  | PartnerStatusPayload
  | WaitingStatusPayload
  | ConsentPromptPayload;

/**
 * Inline UI trigger attached to a message
 */
export interface InlineTrigger {
  /** Unique identifier for this trigger instance */
  id: string;

  /** Type of UI component to render */
  type: TriggerType;

  /** Current state of the trigger */
  state: TriggerState;

  /** Type-specific configuration */
  payload: TriggerPayload;

  /** Timestamp when trigger was created */
  createdAt: string;

  /** Timestamp when trigger was completed/dismissed */
  resolvedAt?: string;
}

/**
 * Extended message type with optional inline trigger
 */
export interface MessageWithTrigger extends MessageDTO {
  /** Optional inline UI trigger to render after the message */
  trigger?: InlineTrigger;
}
```

### Trigger Action Types

```typescript
// shared/src/dto/message.ts

/**
 * Actions that can be emitted from triggers
 */
export enum TriggerAction {
  // Compact
  COMPACT_SIGNED = 'COMPACT_SIGNED',
  COMPACT_QUESTIONS = 'COMPACT_QUESTIONS',

  // Feel Heard
  FEEL_HEARD_CONFIRMED = 'FEEL_HEARD_CONFIRMED',
  FEEL_HEARD_CONTINUE = 'FEEL_HEARD_CONTINUE',

  // Emotion Support
  EMOTION_SUPPORT_SELECTED = 'EMOTION_SUPPORT_SELECTED',
  EMOTION_SUPPORT_SKIPPED = 'EMOTION_SUPPORT_SKIPPED',
  EXERCISE_COMPLETED = 'EXERCISE_COMPLETED',
  EXERCISE_SKIPPED = 'EXERCISE_SKIPPED',

  // Accuracy
  ACCURACY_CONFIRMED = 'ACCURACY_CONFIRMED',
  ACCURACY_PARTIAL = 'ACCURACY_PARTIAL',
  ACCURACY_REJECTED = 'ACCURACY_REJECTED',

  // Strategy
  STRATEGY_RANKING_SUBMITTED = 'STRATEGY_RANKING_SUBMITTED',

  // Agreement
  AGREEMENT_CONFIRMED = 'AGREEMENT_CONFIRMED',
  AGREEMENT_MODIFIED = 'AGREEMENT_MODIFIED',

  // Consent
  CONSENT_GRANTED = 'CONSENT_GRANTED',
  CONSENT_DENIED = 'CONSENT_DENIED',

  // Generic
  TRIGGER_DISMISSED = 'TRIGGER_DISMISSED',
}

/**
 * Payload sent with trigger actions
 */
export interface TriggerActionPayload {
  triggerId: string;
  action: TriggerAction;

  /** Action-specific data */
  data?: {
    // For exercise completion
    intensityAfter?: number;
    exerciseType?: EmotionalSupportType;

    // For strategy ranking
    selectedStrategies?: string[];

    // For accuracy feedback
    accuracyLevel?: 'accurate' | 'partial' | 'inaccurate';

    // For consent
    consentId?: string;

    // Generic
    [key: string]: unknown;
  };
}
```

## Component Design

### ChatInterface Modifications

```typescript
// mobile/src/components/ChatInterface.tsx

import { TriggerActionPayload } from '@be-heard/shared';
import { InlineTriggerRenderer } from './InlineTriggerRenderer';

interface ChatInterfaceProps {
  messages: MessageWithTrigger[];
  onSendMessage: (content: string) => void;
  onTriggerAction: (payload: TriggerActionPayload) => void;
  isLoading?: boolean;
  disabled?: boolean;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onTriggerAction,
  // ...
}: ChatInterfaceProps) {

  const renderMessage: ListRenderItem<MessageWithTrigger> = useCallback(({ item }) => {
    return (
      <View>
        {/* Render the message bubble */}
        <ChatBubble message={item} />

        {/* Render the inline trigger if present */}
        {item.trigger && (
          <InlineTriggerRenderer
            trigger={item.trigger}
            onAction={onTriggerAction}
          />
        )}
      </View>
    );
  }, [onTriggerAction]);

  // ...
}
```

### InlineTriggerRenderer Component

```typescript
// mobile/src/components/InlineTriggerRenderer.tsx

import { InlineTrigger, TriggerType, TriggerState, TriggerActionPayload } from '@be-heard/shared';

// Import all trigger components
import { CuriosityCompactInline } from './triggers/CuriosityCompactInline';
import { FeelHeardConfirmationInline } from './triggers/FeelHeardConfirmationInline';
import { EmotionSupportInline } from './triggers/EmotionSupportInline';
import { AccuracyFeedbackInline } from './triggers/AccuracyFeedbackInline';
import { PartnerStatusInline } from './triggers/PartnerStatusInline';
// ... other imports

interface InlineTriggerRendererProps {
  trigger: InlineTrigger;
  onAction: (payload: TriggerActionPayload) => void;
}

/**
 * Renders the appropriate inline UI component based on trigger type
 */
export function InlineTriggerRenderer({
  trigger,
  onAction,
}: InlineTriggerRendererProps) {
  // Don't render completed/dismissed/expired triggers
  if (trigger.state !== TriggerState.PENDING) {
    return null;
  }

  const handleAction = useCallback((action: TriggerAction, data?: Record<string, unknown>) => {
    onAction({
      triggerId: trigger.id,
      action,
      data,
    });
  }, [trigger.id, onAction]);

  switch (trigger.type) {
    case TriggerType.CURIOSITY_COMPACT:
      return (
        <CuriosityCompactInline
          payload={trigger.payload as CuriosityCompactPayload}
          onAction={handleAction}
        />
      );

    case TriggerType.FEEL_HEARD_CONFIRMATION:
      return (
        <FeelHeardConfirmationInline
          payload={trigger.payload as FeelHeardPayload}
          onAction={handleAction}
        />
      );

    case TriggerType.EMOTION_SUPPORT_OPTIONS:
      return (
        <EmotionSupportInline
          payload={trigger.payload as EmotionSupportPayload}
          onAction={handleAction}
        />
      );

    case TriggerType.ACCURACY_FEEDBACK:
      return (
        <AccuracyFeedbackInline
          payload={trigger.payload as AccuracyFeedbackPayload}
          onAction={handleAction}
        />
      );

    case TriggerType.PARTNER_STATUS:
      return (
        <PartnerStatusInline
          payload={trigger.payload as PartnerStatusPayload}
        />
      );

    // ... handle all other trigger types

    default:
      console.warn(`Unknown trigger type: ${trigger.type}`);
      return null;
  }
}
```

### Example Inline Trigger Components

#### FeelHeardConfirmationInline

```typescript
// mobile/src/components/triggers/FeelHeardConfirmationInline.tsx

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TriggerAction, FeelHeardPayload } from '@be-heard/shared';

interface Props {
  payload: FeelHeardPayload;
  onAction: (action: TriggerAction, data?: Record<string, unknown>) => void;
}

export function FeelHeardConfirmationInline({ payload, onAction }: Props) {
  const question = payload.question || 'Do you feel fully heard?';
  const continueLabel = payload.continueLabel || 'Not yet, I have more to share';
  const confirmLabel = payload.confirmLabel || 'Yes, I feel heard';

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question}</Text>
      <Text style={styles.subtitle}>
        Take your time - there is no rush to move forward
      </Text>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => onAction(TriggerAction.FEEL_HEARD_CONTINUE)}
        >
          <Text style={styles.continueText}>{continueLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => onAction(TriggerAction.FEEL_HEARD_CONFIRMED)}
        >
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

#### EmotionSupportInline

```typescript
// mobile/src/components/triggers/EmotionSupportInline.tsx

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TriggerAction, EmotionSupportPayload, EmotionalSupportType } from '@be-heard/shared';

const SUPPORT_LABELS: Record<EmotionalSupportType, { label: string; icon: string }> = {
  [EmotionalSupportType.BREATHING_EXERCISE]: { label: 'Breathing Exercise', icon: '...' },
  [EmotionalSupportType.BODY_SCAN]: { label: 'Body Scan', icon: '...' },
  [EmotionalSupportType.GROUNDING]: { label: 'Grounding', icon: '...' },
  [EmotionalSupportType.PAUSE_SESSION]: { label: 'Take a Break', icon: '...' },
};

interface Props {
  payload: EmotionSupportPayload;
  onAction: (action: TriggerAction, data?: Record<string, unknown>) => void;
}

export function EmotionSupportInline({ payload, onAction }: Props) {
  const handleSelect = (supportType: EmotionalSupportType) => {
    onAction(TriggerAction.EMOTION_SUPPORT_SELECTED, {
      exerciseType: supportType,
      intensityBefore: payload.intensityBefore,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Would you like some support?</Text>
      <Text style={styles.subtitle}>
        Your emotions are running high. Here are some options that might help.
      </Text>

      <View style={styles.options}>
        {payload.options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.option,
              option === payload.suggestedOption && styles.suggestedOption,
            ]}
            onPress={() => handleSelect(option)}
          >
            <Text style={styles.optionIcon}>{SUPPORT_LABELS[option].icon}</Text>
            <Text style={styles.optionLabel}>{SUPPORT_LABELS[option].label}</Text>
            {option === payload.suggestedOption && (
              <Text style={styles.suggestedBadge}>Recommended</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => onAction(TriggerAction.EMOTION_SUPPORT_SKIPPED)}
      >
        <Text style={styles.skipText}>Continue without support</Text>
      </TouchableOpacity>
    </View>
  );
}
```

## Parent Screen Integration

### Session Screen Handler

```typescript
// mobile/app/(auth)/session/[id]/chat.tsx

import { useCallback } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { TriggerActionPayload, TriggerAction } from '@be-heard/shared';
import { useSignCompact, useConfirmFeelHeard } from '@/hooks/useStages';
import { useCompleteExercise } from '@/hooks/useMessages';

export default function ChatScreen() {
  const { id: sessionId } = useLocalSearchParams();
  const { mutate: signCompact } = useSignCompact();
  const { mutate: confirmFeelHeard } = useConfirmFeelHeard();
  const { mutate: completeExercise } = useCompleteExercise();

  const [breathingModalVisible, setBreathingModalVisible] = useState(false);
  const [currentExercise, setCurrentExercise] = useState<{
    type: EmotionalSupportType;
    intensityBefore: number;
  } | null>(null);

  const handleTriggerAction = useCallback((payload: TriggerActionPayload) => {
    const { triggerId, action, data } = payload;

    switch (action) {
      // Compact actions
      case TriggerAction.COMPACT_SIGNED:
        signCompact({ sessionId });
        break;

      // Feel Heard actions
      case TriggerAction.FEEL_HEARD_CONFIRMED:
        confirmFeelHeard({ sessionId });
        break;

      case TriggerAction.FEEL_HEARD_CONTINUE:
        // User wants to continue sharing - no backend action needed
        // The chat stays open for more messages
        break;

      // Emotion Support actions
      case TriggerAction.EMOTION_SUPPORT_SELECTED:
        const exerciseType = data?.exerciseType as EmotionalSupportType;
        if (exerciseType === EmotionalSupportType.BREATHING_EXERCISE) {
          setCurrentExercise({
            type: exerciseType,
            intensityBefore: data?.intensityBefore as number || 5,
          });
          setBreathingModalVisible(true);
        }
        // Handle other exercise types...
        break;

      case TriggerAction.EXERCISE_COMPLETED:
        completeExercise({
          sessionId,
          exerciseType: data?.exerciseType as EmotionalSupportType,
          completed: true,
          intensityBefore: data?.intensityBefore as number,
          intensityAfter: data?.intensityAfter as number,
        });
        setBreathingModalVisible(false);
        break;

      // Accuracy actions
      case TriggerAction.ACCURACY_CONFIRMED:
        // Handle accuracy confirmation
        break;

      // Strategy actions
      case TriggerAction.STRATEGY_RANKING_SUBMITTED:
        // Submit strategy rankings
        break;

      default:
        console.warn(`Unhandled trigger action: ${action}`);
    }
  }, [sessionId, signCompact, confirmFeelHeard, completeExercise]);

  return (
    <>
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        onTriggerAction={handleTriggerAction}
      />

      {/* Modal-based exercises */}
      <BreathingExercise
        visible={breathingModalVisible}
        intensityBefore={currentExercise?.intensityBefore || 5}
        onComplete={(intensityAfter) => {
          handleTriggerAction({
            triggerId: 'breathing',
            action: TriggerAction.EXERCISE_COMPLETED,
            data: {
              exerciseType: currentExercise?.type,
              intensityBefore: currentExercise?.intensityBefore,
              intensityAfter,
            },
          });
        }}
        onClose={() => {
          setBreathingModalVisible(false);
          handleTriggerAction({
            triggerId: 'breathing',
            action: TriggerAction.EXERCISE_SKIPPED,
          });
        }}
      />
    </>
  );
}
```

## Backend Integration

### AI Response with Trigger

```typescript
// Example AI response with inline trigger

const aiResponseWithTrigger: MessageWithTrigger = {
  id: 'msg-123',
  sessionId: 'session-456',
  senderId: null,
  role: MessageRole.AI,
  content: "Thank you for sharing. I can hear the frustration in what you're describing. It sounds like you've been carrying a lot.",
  stage: Stage.WITNESS,
  timestamp: new Date().toISOString(),
  trigger: {
    id: 'trigger-789',
    type: TriggerType.FEEL_HEARD_CONFIRMATION,
    state: TriggerState.PENDING,
    payload: {
      question: 'Do you feel fully heard?',
    },
    createdAt: new Date().toISOString(),
  },
};
```

### Trigger Resolution API

```typescript
// POST /api/sessions/:sessionId/triggers/:triggerId/resolve

interface ResolveTriggerRequest {
  action: TriggerAction;
  data?: Record<string, unknown>;
}

interface ResolveTriggerResponse {
  trigger: InlineTrigger;
  nextMessage?: MessageWithTrigger; // AI follow-up if needed
}
```

## FlatList Optimization

### Key Extraction

```typescript
const keyExtractor = useCallback((item: MessageWithTrigger) => {
  // Include trigger id in key for proper re-rendering
  return item.trigger
    ? `${item.id}-${item.trigger.id}-${item.trigger.state}`
    : item.id;
}, []);
```

### Memoization

```typescript
// Memoize individual trigger components to prevent unnecessary re-renders
const MemoizedFeelHeardInline = React.memo(FeelHeardConfirmationInline);
const MemoizedEmotionSupportInline = React.memo(EmotionSupportInline);
// ...
```

### getItemLayout (if items have fixed heights)

```typescript
const getItemLayout = useCallback((
  data: MessageWithTrigger[] | null,
  index: number
) => {
  // Calculate based on message type and trigger presence
  // This optimization enables faster scrolling
  const item = data?.[index];
  const baseHeight = 80; // Average message height
  const triggerHeight = item?.trigger ? getTriggerHeight(item.trigger.type) : 0;

  return {
    length: baseHeight + triggerHeight,
    offset: (baseHeight + triggerHeight) * index,
    index,
  };
}, []);
```

## File Structure

```
mobile/src/
  components/
    ChatInterface.tsx              # Modified to handle triggers
    InlineTriggerRenderer.tsx      # Trigger type router
    triggers/
      index.ts                     # Barrel export
      CuriosityCompactInline.tsx
      FeelHeardConfirmationInline.tsx
      EmotionSupportInline.tsx
      AccuracyFeedbackInline.tsx
      NeedsSectionInline.tsx
      CommonGroundCardInline.tsx
      StrategyRankingInline.tsx
      OverlapRevealInline.tsx
      AgreementCardInline.tsx
      PartnerStatusInline.tsx
      WaitingStatusInline.tsx
      ConsentPromptInline.tsx

shared/src/
  enums.ts                         # TriggerType, TriggerState additions
  dto/
    message.ts                     # InlineTrigger, MessageWithTrigger, payloads
```

## Migration Strategy

1. **Phase 1**: Add types to shared package (non-breaking)
   - Add TriggerType and TriggerState enums
   - Add InlineTrigger interface and payload types
   - Add MessageWithTrigger as optional extension

2. **Phase 2**: Implement InlineTriggerRenderer
   - Create component structure
   - Implement each trigger type as inline variant

3. **Phase 3**: Modify ChatInterface
   - Add onTriggerAction prop
   - Update renderItem to include trigger rendering
   - Ensure FlatList optimization

4. **Phase 4**: Update parent screens
   - Add trigger action handlers
   - Connect to existing hooks/mutations

5. **Phase 5**: Backend integration
   - Update AI to include triggers in responses
   - Add trigger resolution endpoints

## Testing Strategy

### Unit Tests

```typescript
// InlineTriggerRenderer.test.tsx
describe('InlineTriggerRenderer', () => {
  it('renders CuriosityCompactInline for CURIOSITY_COMPACT type', () => {
    const trigger: InlineTrigger = {
      id: '1',
      type: TriggerType.CURIOSITY_COMPACT,
      state: TriggerState.PENDING,
      payload: { terms: [], sessionId: 'test' },
      createdAt: new Date().toISOString(),
    };

    render(<InlineTriggerRenderer trigger={trigger} onAction={jest.fn()} />);
    expect(screen.getByTestId('curiosity-compact-inline')).toBeTruthy();
  });

  it('does not render completed triggers', () => {
    const trigger: InlineTrigger = {
      id: '1',
      type: TriggerType.FEEL_HEARD_CONFIRMATION,
      state: TriggerState.COMPLETED,
      payload: {},
      createdAt: new Date().toISOString(),
    };

    const { container } = render(
      <InlineTriggerRenderer trigger={trigger} onAction={jest.fn()} />
    );
    expect(container.children.length).toBe(0);
  });

  it('calls onAction with correct payload when trigger is activated', () => {
    const onAction = jest.fn();
    const trigger: InlineTrigger = {
      id: 'trigger-1',
      type: TriggerType.FEEL_HEARD_CONFIRMATION,
      state: TriggerState.PENDING,
      payload: {},
      createdAt: new Date().toISOString(),
    };

    render(<InlineTriggerRenderer trigger={trigger} onAction={onAction} />);

    fireEvent.press(screen.getByText('Yes, I feel heard'));

    expect(onAction).toHaveBeenCalledWith({
      triggerId: 'trigger-1',
      action: TriggerAction.FEEL_HEARD_CONFIRMED,
      data: undefined,
    });
  });
});
```

### Integration Tests

```typescript
// ChatInterface.integration.test.tsx
describe('ChatInterface with triggers', () => {
  it('renders messages with inline triggers', () => {
    const messages: MessageWithTrigger[] = [
      {
        id: '1',
        role: MessageRole.AI,
        content: 'How are you feeling?',
        // ... other fields
        trigger: {
          id: 't1',
          type: TriggerType.FEEL_HEARD_CONFIRMATION,
          state: TriggerState.PENDING,
          payload: {},
          createdAt: new Date().toISOString(),
        },
      },
    ];

    render(
      <ChatInterface
        messages={messages}
        onSendMessage={jest.fn()}
        onTriggerAction={jest.fn()}
      />
    );

    expect(screen.getByText('How are you feeling?')).toBeTruthy();
    expect(screen.getByText('Do you feel fully heard?')).toBeTruthy();
  });
});
```

## Success Criteria

1. [ ] All trigger types render correctly inline
2. [ ] Actions propagate to parent correctly
3. [ ] Completed triggers don't re-render
4. [ ] FlatList scrolling remains smooth (60fps)
5. [ ] Trigger state persists across app restarts
6. [ ] Accessibility requirements met (screen readers, focus management)
7. [ ] Tests pass with 80%+ coverage
