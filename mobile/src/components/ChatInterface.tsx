/**
 * ChatInterface Component
 *
 * Complete chat interface combining message list, typing indicator, and input.
 * Handles auto-scroll to bottom on new messages and keyboard avoidance.
 *
 * Features:
 * - Message history with user/AI styling
 * - Typing indicator while AI is responding
 * - Auto-scroll to new messages
 * - Keyboard avoidance on iOS
 * - Empty state for new conversations
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import type { MessageDTO } from '@be-heard/shared';
import { ChatBubble, ChatBubbleMessage } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';

// ============================================================================
// Types
// ============================================================================

interface ChatInterfaceProps {
  messages: MessageDTO[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
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
}: ChatInterfaceProps) {
  const flatListRef = useRef<FlatList<MessageDTO>>(null);

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

  const renderMessage: ListRenderItem<MessageDTO> = useCallback(({ item }) => {
    const bubbleMessage: ChatBubbleMessage = {
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
    };
    return <ChatBubble message={bubbleMessage} />;
  }, []);

  const keyExtractor = useCallback((item: MessageDTO) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator />;
  }, [isLoading]);

  const renderEmptyState = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState} testID="chat-empty-state">
        <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
        <Text style={styles.emptyStateMessage}>{emptyStateMessage}</Text>
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
      <ChatInput onSend={onSendMessage} disabled={disabled || isLoading} />
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  messageList: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  messageListEmpty: {
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyStateMessage: {
    fontSize: 16,
    lineHeight: 24,
    color: '#6B7280',
    textAlign: 'center',
  },
});
