/**
 * New Session Screen (Chat-Based Creation)
 *
 * Uses the same ChatInterface as other screens to gather
 * session creation info conversationally. Accessed from the
 * "New Session" button in the Sessions tab.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { ChatInterface } from '@/src/components/ChatInterface';
import { useRouterChat } from '@/src/hooks/useRouterChat';
import { createStyles } from '@/src/theme/styled';
import { MessageDTO, MessageRole, Stage } from '@be-heard/shared';

// ============================================================================
// Constants
// ============================================================================

const NEW_SESSION_WELCOME: MessageDTO = {
  id: 'new-session-welcome',
  sessionId: 'router',
  senderId: null,
  role: MessageRole.AI,
  content: "Who would you like to start a session with? Just tell me their name, and I'll help you send them an invitation.",
  stage: Stage.ONBOARDING,
  timestamp: new Date().toISOString(),
};

// ============================================================================
// Component
// ============================================================================

export default function NewSessionScreen() {
  const styles = useStyles();
  const router = useRouter();

  // Use router chat but with custom welcome message
  const { messages, isSending, isLoading, sendMessage, clearMessages } = useRouterChat({
    onSessionCreated: (sessionId) => {
      // Navigate to the new session, replacing this screen
      router.replace(`/session/${sessionId}`);
    },
  });

  // Replace the default welcome with our custom one
  const displayMessages = messages.length <= 1 ? [NEW_SESSION_WELCOME] : messages;

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  const handleClose = useCallback(() => {
    clearMessages();
    router.back();
  }, [clearMessages, router]);

  // Loading state
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'New Session',
            headerLeft: () => (
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <X color={styles.closeIcon.color} size={24} />
              </TouchableOpacity>
            ),
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New Session',
          headerLeft: () => (
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X color={styles.closeIcon.color} size={24} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ChatInterface
          messages={displayMessages}
          onSendMessage={handleSendMessage}
          isLoading={isSending}
          emptyStateTitle="New Session"
          emptyStateMessage="Tell me who you'd like to have a conversation with."
        />
      </SafeAreaView>
    </>
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    closeButton: {
      padding: 8,
      marginLeft: 8,
    },
    closeIcon: {
      color: t.colors.textSecondary,
    },
  }));
