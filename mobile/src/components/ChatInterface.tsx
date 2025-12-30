import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
} from 'react-native';
import type { MessageDTO, MessageRole } from '@meet-without-fear/shared';
import { ChatBubble, ChatBubbleMessage, MessageDeliveryStatus } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { EmotionSlider } from './EmotionSlider';
import { ChatIndicator, ChatIndicatorType } from './ChatIndicator';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

/** Extended message type that includes optional delivery status */
export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
  /** If true, skip typewriter effect (for messages loaded from history) */
  skipTypewriter?: boolean;
}

// Re-export indicator type for use by parent components
export { ChatIndicatorType } from './ChatIndicator';

/** Indicator item to display inline in chat */
export interface ChatIndicatorItem {
  type: 'indicator';
  indicatorType: ChatIndicatorType;
  id: string;
  timestamp?: string;
}

/** Union type for items that can appear in chat list */
export type ChatListItem = ChatMessage | ChatIndicatorItem;

/** Type guard to check if item is an indicator */
function isIndicator(item: ChatListItem): item is ChatIndicatorItem {
  return 'type' in item && item.type === 'indicator';
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  /** Optional indicators to display inline (e.g., "Invitation Sent") */
  indicators?: ChatIndicatorItem[];
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
  /** Use compact emotion slider for low-profile display */
  compactEmotionSlider?: boolean;
  /** Content to render above the input (e.g., invitation share button) */
  renderAboveInput?: () => React.ReactNode;
  /** Callback when the most recent AI message finishes typewriter effect */
  onLastAIMessageComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

const DEFAULT_EMPTY_TITLE = 'Start the Conversation';
const DEFAULT_EMPTY_MESSAGE =
  "Share what's on your mind. I'm here to listen and help you work through it.";

export function ChatInterface({
  messages,
  indicators = [],
  onSendMessage,
  isLoading = false,
  disabled = false,
  emptyStateTitle = DEFAULT_EMPTY_TITLE,
  emptyStateMessage = DEFAULT_EMPTY_MESSAGE,
  showEmotionSlider = false,
  emotionValue = 5,
  onEmotionChange,
  onHighEmotion,
  compactEmotionSlider = false,
  renderAboveInput,
  onLastAIMessageComplete,
}: ChatInterfaceProps) {
  const styles = useStyles();
  const flatListRef = useRef<FlatList<ChatListItem>>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  // Scroll helper that uses offset for more reliable scrolling
  const scrollToBottom = useCallback((animated = true) => {
    const scrollOffset = contentHeightRef.current - layoutHeightRef.current;
    if (scrollOffset > 0) {
      flatListRef.current?.scrollToOffset({ offset: scrollOffset, animated });
    }
  }, []);

  // Track which messages have completed typewriter effect
  const [completedMessages, setCompletedMessages] = useState<Set<string>>(new Set());

  // Track message IDs that existed on initial mount - these should skip typewriter
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  if (initialMessageIdsRef.current === null) {
    // First render - capture all existing message IDs
    initialMessageIdsRef.current = new Set(messages.map(m => m.id));
  }

  // Find the last AI message ID for typewriter completion tracking
  // Only consider messages that weren't in the initial set (i.e., new messages)
  const lastAIMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'USER' && !initialMessageIdsRef.current?.has(msg.id)) {
        return msg.id;
      }
    }
    return null;
  }, [messages]);

  // Merge messages and indicators, sorted by timestamp
  const listItems = useMemo((): ChatListItem[] => {
    const items: ChatListItem[] = [...messages, ...indicators];
    return items.sort((a, b) => {
      const aTime = 'timestamp' in a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = 'timestamp' in b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
  }, [messages, indicators]);

  // Handle typewriter completion for a specific message
  const handleTypewriterComplete = useCallback((messageId: string) => {
    setCompletedMessages(prev => new Set(prev).add(messageId));

    // If this is the last AI message, call the callback
    if (messageId === lastAIMessageId && onLastAIMessageComplete) {
      onLastAIMessageComplete();
    }
  }, [lastAIMessageId, onLastAIMessageComplete]);

  // Handle typewriter progress - scroll to keep new content visible
  const handleTypewriterProgress = useCallback(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listItems.length > 0) {
      // Multiple scroll attempts to ensure new content is visible
      const timers = [50, 150, 300].map(delay =>
        setTimeout(() => scrollToBottom(delay > 100), delay)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [listItems.length, scrollToBottom]);

  // Also scroll when content above input changes (e.g., invitation draft appears)
  useEffect(() => {
    if (renderAboveInput) {
      const timer = setTimeout(() => scrollToBottom(true), 150);
      return () => clearTimeout(timer);
    }
  }, [renderAboveInput, scrollToBottom]);

  // Also scroll when loading state changes (typing indicator appears)
  useEffect(() => {
    if (isLoading) {
      // Multiple scroll attempts to ensure the typing indicator is visible
      const timers = [50, 150, 300, 500].map(delay =>
        setTimeout(() => scrollToBottom(delay > 100), delay)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [isLoading, scrollToBottom]);

  const renderItem: ListRenderItem<ChatListItem> = useCallback(({ item }) => {
    // Render indicator
    if (isIndicator(item)) {
      return <ChatIndicator type={item.indicatorType} timestamp={item.timestamp} />;
    }

    // Skip typewriter for messages that existed on initial mount (loaded from history)
    const isInitialMessage = initialMessageIdsRef.current?.has(item.id) ?? false;

    // Render message
    const bubbleMessage: ChatBubbleMessage = {
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      status: item.status,
      skipTypewriter: item.skipTypewriter || isInitialMessage,
    };
    return (
      <ChatBubble
        message={bubbleMessage}
        onTypewriterComplete={() => handleTypewriterComplete(item.id)}
        onTypewriterProgress={handleTypewriterProgress}
      />
    );
  }, [handleTypewriterComplete, handleTypewriterProgress]);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

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
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.messageList,
          listItems.length === 0 && styles.messageListEmpty,
        ]}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        testID="chat-message-list"
        onContentSizeChange={(_, height) => {
          contentHeightRef.current = height;
        }}
        onLayout={(event) => {
          layoutHeightRef.current = event.nativeEvent.layout.height;
        }}
      />
      {showEmotionSlider && onEmotionChange && (
        <EmotionSlider
          value={emotionValue}
          onChange={onEmotionChange}
          onHighEmotion={onHighEmotion}
          compact={compactEmotionSlider}
          testID="chat-emotion-slider"
        />
      )}
      {renderAboveInput?.()}
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
