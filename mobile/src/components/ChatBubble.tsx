/**
 * ChatBubble Component
 *
 * Renders a single message bubble for chat interface.
 * User messages are right-aligned, AI messages are left-aligned.
 */

import { View, Text, StyleSheet } from 'react-native';
import { MessageRole } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({ message, showTimestamp = true }: ChatBubbleProps) {
  const isUser = message.role === MessageRole.USER;

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View
      style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
      </View>
      {showTimestamp && <Text style={styles.time}>{formatTime(message.timestamp)}</Text>}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  aiContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1F2937',
  },
  userText: {
    color: '#FFFFFF',
  },
  time: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
