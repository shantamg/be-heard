/**
 * Witness Screen (Stage 1)
 *
 * The AI-guided conversation where users share their perspective.
 * Includes emotional barometer check-ins and feel-heard confirmation.
 */

import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/src/hooks/useSessions';
import {
  useMessages,
  useSendMessage,
  useOptimisticMessage,
  useRecordEmotion,
} from '@/src/hooks/useMessages';
import { useConfirmFeelHeard, useProgress } from '@/src/hooks/useStages';
import { ChatInterface } from '@/src/components/ChatInterface';
import { EmotionalBarometer } from '@/src/components/EmotionalBarometer';
import { FeelHeardConfirmation } from '@/src/components/FeelHeardConfirmation';
import { WaitingRoom } from '@/src/components/WaitingRoom';
import { Stage, MessageRole } from '@be-heard/shared';

// ============================================================================
// Component
// ============================================================================

export default function WitnessScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessionData } = useSession(sessionId);
  const {
    data: messagesData,
    isLoading: loadingMessages,
    error: messagesError,
  } = useMessages({ sessionId: sessionId!, stage: Stage.WITNESS }, { enabled: !!sessionId });
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: confirmHeard, isPending: isConfirming } = useConfirmFeelHeard();
  const { mutate: recordEmotion } = useRecordEmotion();
  const { data: progressData } = useProgress(sessionId);
  const { addOptimisticMessage, removeOptimisticMessage } = useOptimisticMessage();

  const [showBarometer, setShowBarometer] = useState(false);
  const [barometerValue, setBarometerValue] = useState(5);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const session = sessionData?.session;
  const messages = messagesData?.messages ?? [];

  // Check if AI has asked about feeling heard
  const lastAiMessage = [...messages].reverse().find((m) => m.role === MessageRole.AI);
  const isAskingAboutHeard =
    lastAiMessage?.content.toLowerCase().includes('feel heard') ||
    lastAiMessage?.content.toLowerCase().includes('fully heard');

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      // Add optimistic message immediately
      const optimisticId = addOptimisticMessage(sessionId, {
        content,
        role: MessageRole.USER,
        stage: Stage.WITNESS,
      });

      // Send the actual message
      sendMessage(
        { sessionId, content },
        {
          onError: () => {
            removeOptimisticMessage(sessionId, optimisticId);
          },
        }
      );

      // Hide confirmation after sending a message (user chose to continue)
      setShowConfirmation(false);
    },
    [sessionId, sendMessage, addOptimisticMessage, removeOptimisticMessage]
  );

  const handleConfirmHeard = () => {
    if (!sessionId) return;

    confirmHeard(
      { sessionId, confirmed: true },
      {
        onSuccess: () => {
          // Navigate back to session detail which will route to next stage
          router.replace(`/session/${sessionId}`);
        },
      }
    );
  };

  const handleBarometerChange = (value: number) => {
    setBarometerValue(value);
    if (sessionId) {
      recordEmotion({
        sessionId,
        intensity: value,
      });
    }
  };

  const handleToggleBarometer = () => {
    setShowBarometer(!showBarometer);
  };

  // Check progress for waiting room logic
  const myProgress = progressData?.myProgress;
  const partnerProgress = progressData?.partnerProgress;

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

  // If we completed stage 1 but partner hasn't
  if (
    myProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
    partnerProgress?.stage === Stage.WITNESS
  ) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to complete their witness session"
            partnerName={session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Share Your Perspective',
          headerBackTitle: 'Session',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.content}>
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isSending}
            emptyStateTitle="Share Your Experience"
            emptyStateMessage="This is your private space to share what happened and how you feel. The AI is here to listen without judgment."
          />

          {showBarometer && (
            <View style={styles.barometerContainer}>
              <EmotionalBarometer
                value={barometerValue}
                onChange={handleBarometerChange}
              />
            </View>
          )}

          {isAskingAboutHeard && !showConfirmation && (
            <FeelHeardConfirmation
              onConfirm={handleConfirmHeard}
              onContinue={() => setShowConfirmation(false)}
            />
          )}
        </View>
      </SafeAreaView>
    </>
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
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  barometerContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
});
