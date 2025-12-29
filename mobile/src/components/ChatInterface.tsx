import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
} from 'react-native';
import type { MessageDTO } from '@be-heard/shared';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

/** Extended message type that includes optional delivery status */
export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  /** Whether to show emotion slider */
  showEmotionSlider?: boolean;
  /** Current emotion value (1-10) */
  emotionValue?: number;
  /** Callback when emotion value changes */
  onEmotionChange?: (value: number) => void;
  /** Callback when emotion reaches high threshold */
  onHighEmotion?: (value: number) => void;
}

// ============================================================================
// Component
// ============================================================================

const DEFAULT_EMPTY_TITLE = 'Start the Conversation';
const DEFAULT_EMPTY_MESSAGE =
  "Share what's on your mind. I'm here to listen and help you work through it.";

export function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  disabled = false,
  emptyStateTitle = DEFAULT_EMPTY_TITLE,
  emptyStateMessage = DEFAULT_EMPTY_MESSAGE,
  showEmotionSlider = false,
  emotionValue = 5,
  onEmotionChange,
  onHighEmotion,
}: ChatInterfaceProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to ensure layout is complete
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Also scroll when loading state changes (typing indicator appears)
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const renderMessage: ListRenderItem<ChatMessage> = useCallback(({ item }) => {
    const bubbleMessage: ChatBubbleMessage = {
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      status: item.status,
    };
    return <ChatBubble message={bubbleMessage} />;
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator />;
  }, [isLoading]);

  const renderEmptyState = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState} testID="chat-empty-state">
        <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
        {emptyStateMessage ? (
          <Text style={styles.emptyStateMessage}>{emptyStateMessage}</Text>
        ) : null}
      </View>
    );
  }, [isLoading, emptyStateTitle, emptyStateMessage]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        testID="chat-message-list"
      />
      {showEmotionSlider && onEmotionChange && (
        <EmotionSlider
          value={emotionValue}
          onChange={onEmotionChange}
          onHighEmotion={onHighEmotion}
          testID="chat-emotion-slider"
        />
      )}
      <ChatInput onSend={onSendMessage} disabled={disabled || isLoading} />
    </KeyboardAvoidingView>
  );
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
    messageListEmpty: {
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.spacing['3xl'],
      paddingVertical: t.spacing['3xl'],
    },
    emptyStateTitle: {
      fontSize: 28,
      fontWeight: '600',
      color: t.colors.textPrimary,
      textAlign: 'center',
      lineHeight: 36,
    },
    emptyStateMessage: {
      fontSize: t.typography.fontSize.lg,
      lineHeight: 24,
      color: t.colors.textSecondary,
      textAlign: 'center',
      marginTop: t.spacing.md,
    },
  }));
