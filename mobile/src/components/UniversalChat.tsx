/**
 * UniversalChat Component
 *
 * A unified chat interface for the entire session flow that:
 * - Works across all stages (0-4)
 * - Supports inline UI triggers (compact signing, feel-heard, etc.)
 * - Integrates EmotionSlider for mood tracking
 * - Uses SimpleChatHeader for minimal branding
 * - Renders AI messages full-width (no bubbles)
 * - Hides timestamps by default
 *
 * The backend determines what stage we're in and returns appropriate
 * AI responses with optional inline triggers.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
} from 'react-native';
import type { MessageDTO } from '@be-heard/shared';
import { MessageRole, Stage, StageStatus } from '@be-heard/shared';
import { SimpleChatHeader } from './SimpleChatHeader';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { InlineCompact } from './InlineCompact';
import { FeelHeardConfirmation } from './FeelHeardConfirmation';
import { BreathingExercise } from './BreathingExercise';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

/**
 * Trigger types that can appear inline in chat
 */
export enum TriggerType {
  CURIOSITY_COMPACT = 'CURIOSITY_COMPACT',
  FEEL_HEARD_CONFIRMATION = 'FEEL_HEARD_CONFIRMATION',
  EMOTION_SUPPORT_OPTIONS = 'EMOTION_SUPPORT_OPTIONS',
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  PARTNER_STATUS = 'PARTNER_STATUS',
  WAITING_STATUS = 'WAITING_STATUS',
}

/**
 * State of a trigger's lifecycle
 */
export enum TriggerState {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  DISMISSED = 'DISMISSED',
}

/**
 * Inline UI trigger attached to a message
 */
export interface InlineTrigger {
  id: string;
  type: TriggerType;
  state: TriggerState;
  payload?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Extended message type with optional trigger and delivery status
 */
export interface UniversalChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
  trigger?: InlineTrigger;
  isIntervention?: boolean;
}

/**
 * Actions emitted from trigger interactions
 */
export enum TriggerAction {
  COMPACT_SIGNED = 'COMPACT_SIGNED',
  FEEL_HEARD_CONFIRMED = 'FEEL_HEARD_CONFIRMED',
  FEEL_HEARD_CONTINUE = 'FEEL_HEARD_CONTINUE',
  EMOTION_SUPPORT_SELECTED = 'EMOTION_SUPPORT_SELECTED',
  EXERCISE_COMPLETED = 'EXERCISE_COMPLETED',
  EXERCISE_SKIPPED = 'EXERCISE_SKIPPED',
  TRIGGER_DISMISSED = 'TRIGGER_DISMISSED',
}

/**
 * Payload for trigger action events
 */
export interface TriggerActionPayload {
  triggerId: string;
  action: TriggerAction;
  data?: Record<string, unknown>;
}

/**
 * Stage context for the chat
 */
export interface StageContext {
  stage: Stage;
  status: StageStatus;
  partnerName?: string;
  partnerStage?: Stage;
  partnerStatus?: StageStatus;
}

interface UniversalChatProps {
  /** Messages to display */
  messages: UniversalChatMessage[];
  /** Callback when user sends a message */
  onSendMessage: (content: string) => void;
  /** Callback when user interacts with a trigger */
  onTriggerAction?: (payload: TriggerActionPayload) => void;
  /** Current stage context */
  stageContext?: StageContext;
  /** Whether AI is generating a response */
  isLoading?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Person's name for header (defaults to "BeHeard") */
  personName?: string;
  /** Status text for header (e.g., "Listening", "Stage 1") */
  headerStatus?: string;
  /** Current emotion value (1-10) */
  emotionValue?: number;
  /** Callback when emotion value changes */
  onEmotionChange?: (value: number) => void;
  /** Callback when emotion is high (default threshold: 9) */
  onHighEmotion?: (value: number) => void;
  /** Whether to show emotion slider */
  showEmotionSlider?: boolean;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Render Item Type
// ============================================================================

type ChatItem =
  | { type: 'message'; data: UniversalChatMessage }
  | { type: 'trigger'; data: InlineTrigger; messageId: string };

// ============================================================================
// Component
// ============================================================================

export function UniversalChat({
  messages,
  onSendMessage,
  onTriggerAction,
  stageContext,
  isLoading = false,
  disabled = false,
  personName = 'BeHeard',
  headerStatus,
  emotionValue = 5,
  onEmotionChange,
  onHighEmotion,
  showEmotionSlider = true,
  testID = 'universal-chat',
}: UniversalChatProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatItem>>(null);
  const [breathingVisible, setBreathingVisible] = useState(false);
  const [breathingIntensity, setBreathingIntensity] = useState(5);

  // Derive header status from stage context if not provided
  const derivedStatus = headerStatus ?? deriveStatusFromContext(stageContext);

  // Transform messages into flat list items (messages + triggers)
  const listItems = transformToListItems(messages);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listItems.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [listItems.length]);

  // Also scroll when loading state changes
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Handle trigger actions
  const handleTriggerAction = useCallback(
    (triggerId: string, action: TriggerAction, data?: Record<string, unknown>) => {
      // Handle breathing exercise internally
      if (action === TriggerAction.EMOTION_SUPPORT_SELECTED) {
        const exerciseType = data?.exerciseType as string;
        if (exerciseType === 'BREATHING_EXERCISE') {
          setBreathingIntensity(data?.intensityBefore as number ?? emotionValue);
          setBreathingVisible(true);
          return;
        }
      }

      // Pass to parent handler
      if (onTriggerAction) {
        onTriggerAction({ triggerId, action, data });
      }
    },
    [onTriggerAction, emotionValue]
  );

  // Handle breathing exercise completion
  const handleBreathingComplete = useCallback(
    (intensityAfter: number) => {
      setBreathingVisible(false);
      if (onTriggerAction) {
        onTriggerAction({
          triggerId: 'breathing-exercise',
          action: TriggerAction.EXERCISE_COMPLETED,
          data: {
            exerciseType: 'BREATHING_EXERCISE',
            intensityBefore: breathingIntensity,
            intensityAfter,
          },
        });
      }
    },
    [onTriggerAction, breathingIntensity]
  );

  // Render individual list items
  const renderItem: ListRenderItem<ChatItem> = useCallback(
    ({ item }) => {
      if (item.type === 'message') {
        const msg = item.data;
        const bubbleMessage: ChatBubbleMessage = {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          status: msg.status,
          isIntervention: msg.isIntervention,
        };
        return <ChatBubble message={bubbleMessage} showTimestamp={false} />;
      }

      // Render trigger
      return renderTrigger(item.data, item.messageId, handleTriggerAction);
    },
    [handleTriggerAction]
  );

  const keyExtractor = useCallback((item: ChatItem) => {
    if (item.type === 'message') {
      return `msg-${item.data.id}`;
    }
    return `trigger-${item.data.id}`;
  }, []);

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator />;
  }, [isLoading]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
      testID={testID}
    >
      <SimpleChatHeader
        personName={personName}
        status={derivedStatus}
        testID={`${testID}-header`}
      />

      <FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        testID={`${testID}-message-list`}
      />

      {showEmotionSlider && onEmotionChange && (
        <EmotionSlider
          value={emotionValue}
          onChange={onEmotionChange}
          onHighEmotion={onHighEmotion}
          testID={`${testID}-emotion-slider`}
        />
      )}

      <ChatInput
        onSend={onSendMessage}
        disabled={disabled || isLoading}
      />

      {/* Breathing Exercise Modal */}
      <BreathingExercise
        visible={breathingVisible}
        intensityBefore={breathingIntensity}
        onComplete={handleBreathingComplete}
        onClose={() => {
          setBreathingVisible(false);
          if (onTriggerAction) {
            onTriggerAction({
              triggerId: 'breathing-exercise',
              action: TriggerAction.EXERCISE_SKIPPED,
              data: { intensityBefore: breathingIntensity },
            });
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive status text from stage context
 */
function deriveStatusFromContext(context?: StageContext): string | undefined {
  if (!context) return undefined;

  switch (context.stage) {
    case Stage.ONBOARDING:
      return 'Getting Started';
    case Stage.WITNESS:
      return 'Listening';
    case Stage.PERSPECTIVE_STRETCH:
      return 'Perspective';
    case Stage.NEED_MAPPING:
      return 'Needs';
    case Stage.STRATEGIC_REPAIR:
      return 'Solutions';
    default:
      return undefined;
  }
}

/**
 * Transform messages into flat list items including triggers
 */
function transformToListItems(messages: UniversalChatMessage[]): ChatItem[] {
  const items: ChatItem[] = [];

  for (const msg of messages) {
    // Add the message
    items.push({ type: 'message', data: msg });

    // Add trigger if present and pending
    if (msg.trigger && msg.trigger.state === TriggerState.PENDING) {
      items.push({
        type: 'trigger',
        data: msg.trigger,
        messageId: msg.id,
      });
    }
  }

  return items;
}

/**
 * Render a trigger component based on type
 */
function renderTrigger(
  trigger: InlineTrigger,
  messageId: string,
  onAction: (triggerId: string, action: TriggerAction, data?: Record<string, unknown>) => void
): React.ReactElement | null {
  switch (trigger.type) {
    case TriggerType.CURIOSITY_COMPACT:
      return (
        <InlineCompact
          key={trigger.id}
          onSign={() => onAction(trigger.id, TriggerAction.COMPACT_SIGNED)}
          isPending={false}
          testID={`trigger-compact-${trigger.id}`}
        />
      );

    case TriggerType.FEEL_HEARD_CONFIRMATION:
      return (
        <FeelHeardConfirmation
          key={trigger.id}
          onConfirm={() => onAction(trigger.id, TriggerAction.FEEL_HEARD_CONFIRMED)}
          onContinue={() => onAction(trigger.id, TriggerAction.FEEL_HEARD_CONTINUE)}
        />
      );

    case TriggerType.EMOTION_SUPPORT_OPTIONS:
      // This would render a support options component
      // For now, returning null as the component needs to be created
      return null;

    case TriggerType.PARTNER_STATUS:
    case TriggerType.WAITING_STATUS:
      // These would render status indicators
      // For now, returning null
      return null;

    default:
      return null;
  }
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    messageList: {
      paddingVertical: t.spacing.lg,
      flexGrow: 1,
      gap: t.spacing.xs,
    },
  }));
