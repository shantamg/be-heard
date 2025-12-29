/**
 * Home Screen (Chat-First Interface)
 *
 * The main entry point for BeHeard. Uses the same ChatInterface as
 * the session stages, but in "router" mode where the AI helps users
 * create new sessions by gathering person info conversationally.
 *
 * When a session is created, navigates directly to it.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { ChatInterface } from '@/src/components/ChatInterface';
import { BiometricPrompt } from '@/src/components/BiometricPrompt';
import { useBiometricAuth } from '@/src/hooks';
import { useRouterChat } from '@/src/hooks/useRouterChat';
import { createStyles } from '@/src/theme/styled';

// ============================================================================
// Component
// ============================================================================

export default function HomeScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { isAvailable, isEnrolled, hasPrompted, isLoading: biometricLoading } = useBiometricAuth();

  // Biometric prompt state
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Router chat for session creation
  const { messages, isSending, isLoading, sendMessage } = useRouterChat({
    onSessionCreated: (sessionId) => {
      // Navigate directly to the new session
      router.push(`/session/${sessionId}`);
    },
  });

  // Show biometric prompt when conditions are met
  useEffect(() => {
    if (!biometricLoading && isAvailable && isEnrolled && !hasPrompted) {
      const timer = setTimeout(() => {
        setShowBiometricPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [biometricLoading, isAvailable, isEnrolled, hasPrompted]);

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isSending}
        emptyStateTitle="What can I help you work through today?"
      />

      {/* Biometric opt-in prompt */}
      <BiometricPrompt
        visible={showBiometricPrompt}
        onDismiss={() => setShowBiometricPrompt(false)}
        testID="biometric-prompt"
      />
    </View>
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
  }));
