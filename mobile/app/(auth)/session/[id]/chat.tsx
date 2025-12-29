/**
 * Chat Screen
 *
 * AI conversation interface for a session.
 * Displays message history and allows sending new messages.
 *
 * Features:
 * - Real-time message display
 * - Optimistic updates for user messages
 * - AI typing indicator during response
 * - Auto-scroll to latest message
 */

import { useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import {
  useMessages,
  useSendMessage,
  useOptimisticMessage,
} from '@/src/hooks/useMessages';
import { ChatInterface } from '@/src/components/ChatInterface';
import { ChatHeader } from '@/src/components/ChatHeader';
import { Stage, MessageRole } from '@meet-without-fear/shared';
import { createStyles } from '@/src/theme/styled';

// ============================================================================
// Component
// ============================================================================

export default function ChatScreen() {
  const styles = useStyles();
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();

  // Fetch messages for this session
  const {
    data: messagesData,
    isLoading: loadingMessages,
    error: messagesError,
  } = useMessages({ sessionId: sessionId! }, { enabled: !!sessionId });

  // Send message mutation
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();

  // Optimistic updates for immediate feedback
  const { addOptimisticMessage, removeOptimisticMessage } =
    useOptimisticMessage();

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      // Add optimistic message immediately
      const optimisticId = addOptimisticMessage(sessionId, {
        content,
        role: MessageRole.USER,
        stage: Stage.WITNESS, // Default to Witness stage for chat
      });

      // Send the actual message
      sendMessage(
        { sessionId, content },
        {
          onError: () => {
            // Remove optimistic message on failure
            removeOptimisticMessage(sessionId, optimisticId);
          },
        }
      );
    },
    [sessionId, sendMessage, addOptimisticMessage, removeOptimisticMessage]
  );

  // Loading state
  if (loadingMessages) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  // Error state
  if (messagesError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load messages</Text>
        <Text style={styles.errorDetail}>{messagesError.message}</Text>
      </View>
    );
  }

  const messages = messagesData?.messages ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Chat',
          headerBackTitle: 'Session',
        }}
      />
      <View style={styles.container}>
        <ChatHeader
          stageName="Conversation"
          stageNumber={1}
          stageDescription="Continue the conversation with AI assistance."
          showProgress={false}
          testID="chat-screen-header"
        />
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isSending}
        />
      </View>
    </>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.colors.bgPrimary,
      padding: 20,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    errorText: {
      fontSize: 18,
      fontWeight: '600',
      color: t.colors.error,
      marginBottom: 8,
    },
    errorDetail: {
      fontSize: 14,
      color: t.colors.textSecondary,
      textAlign: 'center',
    },
  }));
