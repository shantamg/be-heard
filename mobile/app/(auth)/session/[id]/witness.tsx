/**
 * Witness Screen (Stage 1)
 *
 * The AI-guided conversation where users share their perspective.
 * Clean chat experience with AI welcome message.
 * Includes emotional barometer check-ins and feel-heard confirmation.
 */

import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { SessionChatHeader } from '@/src/components/SessionChatHeader';
import { EmotionalBarometer } from '@/src/components/EmotionalBarometer';
import { FeelHeardConfirmation } from '@/src/components/FeelHeardConfirmation';
import { BreathingExercise } from '@/src/components/BreathingExercise';
import { WaitingRoom } from '@/src/components/WaitingRoom';
import { Stage, MessageRole, MessageDTO } from '@meet-without-fear/shared';
import { createStyles } from '@/src/theme/styled';

// ============================================================================
// AI Welcome Message
// ============================================================================

const AI_WELCOME_MESSAGE = `Hi there. I'm here to listen and help you feel heard. This is your private space - whatever you share stays between us.

Take your time and share what's on your mind.`;

// ============================================================================
// Constants
// ============================================================================

/** Number of user messages before showing barometer prompt */
const BAROMETER_MESSAGE_INTERVAL = 5;
/** Intensity threshold for showing cooling period suggestion */
const HIGH_INTENSITY_THRESHOLD = 8;

// ============================================================================
// Component
// ============================================================================

export default function WitnessScreen() {
  const styles = useStyles();
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessionData } = useSession(sessionId);
  const {
    data: messagesData,
    isLoading: loadingMessages,
    error: messagesError,
  } = useMessages({ sessionId: sessionId!, stage: Stage.WITNESS }, { enabled: !!sessionId });
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: confirmHeard } = useConfirmFeelHeard();
  const { mutate: recordEmotion } = useRecordEmotion();
  const { data: progressData } = useProgress(sessionId);
  const { addOptimisticMessage, removeOptimisticMessage } = useOptimisticMessage();

  // Barometer state
  const [showBarometer, setShowBarometer] = useState(false);
  const [barometerValue, setBarometerValue] = useState(5);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Track when barometer was last shown (by message count)
  const [lastBarometerMessageCount, setLastBarometerMessageCount] = useState(0);

  // Cooling period state
  const [showCoolingSuggestion, setShowCoolingSuggestion] = useState(false);
  const [showBreathingExercise, setShowBreathingExercise] = useState(false);

  // Final emotion check state (before stage completion)
  const [showFinalCheck, setShowFinalCheck] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  // Track previous message count to detect new messages
  const prevMessageCountRef = useRef(0);

  const session = sessionData?.session;
  const apiMessages = messagesData?.messages ?? [];

  // Create welcome message to show when there are no messages
  const welcomeMessage: MessageDTO = useMemo(() => ({
    id: 'welcome-message',
    sessionId: sessionId!,
    senderId: null,
    role: MessageRole.AI,
    content: AI_WELCOME_MESSAGE,
    stage: Stage.WITNESS,
    timestamp: new Date().toISOString(),
  }), [sessionId]);

  // Show welcome message if no messages exist, otherwise show API messages
  const messages = useMemo(() => {
    if (apiMessages.length === 0) {
      return [welcomeMessage];
    }
    return apiMessages;
  }, [apiMessages, welcomeMessage]);

  // Count user messages
  const userMessageCount = messages.filter(m => m.role === MessageRole.USER).length;

  // TASK 1: Show barometer periodically (every N user messages)
  useEffect(() => {
    // Only trigger if we have new user messages
    if (userMessageCount > prevMessageCountRef.current) {
      prevMessageCountRef.current = userMessageCount;

      // Check if we've hit the threshold since last barometer
      const messagesSinceLastBarometer = userMessageCount - lastBarometerMessageCount;
      if (messagesSinceLastBarometer >= BAROMETER_MESSAGE_INTERVAL) {
        setShowBarometer(true);
        setLastBarometerMessageCount(userMessageCount);
      }
    }
  }, [userMessageCount, lastBarometerMessageCount]);

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

    // TASK 2: Show cooling suggestion when intensity is high
    if (value >= HIGH_INTENSITY_THRESHOLD && !showCoolingSuggestion) {
      setShowCoolingSuggestion(true);
    }
  };


  // TASK 2: Cooling period handlers
  const handleContinueSharing = () => {
    setShowCoolingSuggestion(false);
    setShowBarometer(false);
  };

  const handleTryBreathing = () => {
    setShowCoolingSuggestion(false);
    setShowBreathingExercise(true);
  };

  const handleTakeBreak = () => {
    setShowCoolingSuggestion(false);
    setShowBarometer(false);
    // Navigate back to session detail for a break
    router.replace(`/session/${sessionId}`);
  };

  const handleBreathingComplete = (intensityAfter: number) => {
    setShowBreathingExercise(false);
    setBarometerValue(intensityAfter);
    if (sessionId) {
      recordEmotion({
        sessionId,
        intensity: intensityAfter,
      });
    }
    // If intensity is now lower, hide barometer
    if (intensityAfter < HIGH_INTENSITY_THRESHOLD) {
      setShowBarometer(false);
    }
  };

  const handleBreathingClose = () => {
    setShowBreathingExercise(false);
  };

  // TASK 3: Final emotion check before stage completion
  const handleInitiateConfirmation = () => {
    // Show barometer for final check before confirming
    setShowFinalCheck(true);
    setShowBarometer(true);
    setPendingConfirmation(true);
  };

  const handleFinalCheckComplete = () => {
    if (barometerValue >= HIGH_INTENSITY_THRESHOLD) {
      // Still high intensity - suggest taking a break
      setShowCoolingSuggestion(true);
    } else {
      // Intensity is manageable, proceed with confirmation
      handleConfirmHeard();
    }
    setShowFinalCheck(false);
  };

  const handleProceedAnyway = () => {
    // User chose to proceed despite high intensity
    setShowCoolingSuggestion(false);
    setPendingConfirmation(false);
    handleConfirmHeard();
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
          headerShown: false, // Use custom SessionChatHeader instead
        }}
      />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <SessionChatHeader
            partnerName={session?.partner?.name}
            partnerOnline={false} // TODO: Get from realtime subscription
            testID="witness-chat-header"
          />
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isSending}
          />

          {/* Emotional Barometer */}
          {showBarometer && (
            <View style={styles.barometerContainer}>
              <EmotionalBarometer
                value={barometerValue}
                onChange={handleBarometerChange}
              />
              {/* TASK 3: Final check action button */}
              {showFinalCheck && (
                <View style={styles.finalCheckActions}>
                  <Text style={styles.finalCheckText}>
                    Check in with yourself before moving on
                  </Text>
                  <TouchableOpacity
                    style={styles.finalCheckButton}
                    onPress={handleFinalCheckComplete}
                  >
                    <Text style={styles.finalCheckButtonText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* TASK 2: Cooling Period Suggestion Card */}
          {showCoolingSuggestion && (
            <View style={styles.coolingSuggestion}>
              <Text style={styles.coolingSuggestionTitle}>
                You seem to be feeling intense emotions
              </Text>
              <Text style={styles.coolingSuggestionText}>
                Would you like to take a moment?
              </Text>
              <View style={styles.coolingOptions}>
                <TouchableOpacity
                  style={styles.coolingOptionButton}
                  onPress={handleContinueSharing}
                >
                  <Text style={styles.coolingOptionText}>Continue sharing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.coolingOptionButton, styles.coolingOptionAccent]}
                  onPress={handleTryBreathing}
                >
                  <Text style={styles.coolingOptionTextAccent}>
                    Try breathing exercise
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.coolingOptionButton}
                  onPress={pendingConfirmation ? handleProceedAnyway : handleTakeBreak}
                >
                  <Text style={styles.coolingOptionText}>
                    {pendingConfirmation ? 'Proceed anyway' : 'Take a break'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TASK 2: Breathing Exercise Modal */}
          <BreathingExercise
            visible={showBreathingExercise}
            intensityBefore={barometerValue}
            onComplete={handleBreathingComplete}
            onClose={handleBreathingClose}
          />

          {/* TASK 3: Modified FeelHeardConfirmation to trigger final check */}
          {isAskingAboutHeard && !showConfirmation && !showFinalCheck && !showCoolingSuggestion && (
            <FeelHeardConfirmation
              onConfirm={handleInitiateConfirmation}
              onContinue={() => setShowConfirmation(false)}
            />
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

// ============================================================================
const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    content: {
      flex: 1,
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
    barometerContainer: {
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bgSecondary,
    },
    // TASK 3: Final check styles
    finalCheckActions: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      alignItems: 'center',
    },
    finalCheckText: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 12,
      textAlign: 'center',
    },
    finalCheckButton: {
      backgroundColor: t.colors.accent,
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 8,
    },
    finalCheckButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    // TASK 2: Cooling suggestion styles
    coolingSuggestion: {
      margin: 16,
      padding: 16,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 4,
      borderLeftColor: t.colors.warning,
    },
    coolingSuggestionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 4,
    },
    coolingSuggestionText: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 16,
    },
    coolingOptions: {
      gap: 8,
    },
    coolingOptionButton: {
      padding: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
    },
    coolingOptionAccent: {
      backgroundColor: t.colors.accent,
      borderColor: t.colors.accent,
    },
    coolingOptionText: {
      fontSize: 14,
      color: t.colors.textSecondary,
    },
    coolingOptionTextAccent: {
      fontSize: 14,
      color: 'white',
      fontWeight: '600',
    },
  }));
