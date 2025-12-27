/**
 * NeedMappingScreen Component
 *
 * Stage 3 - Need Mapping
 * AI helps users identify their underlying needs from the conversation,
 * then both partners confirm their needs and discover common ground.
 *
 * Phases:
 * - Exploration: Chat with AI to explore needs
 * - Review: View and confirm identified needs
 * - Common Ground: Discover shared needs with partner
 * - Waiting: Wait for partner to complete their needs
 */

import { View, ScrollView, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../hooks/useSessions';
import {
  useMessages,
  useSendMessage,
  useOptimisticMessage,
} from '../hooks/useMessages';
import {
  useProgress,
  useNeeds,
  useConfirmNeeds,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
} from '../hooks/useStages';
import { ChatInterface } from '../components/ChatInterface';
import { NeedsSection } from '../components/NeedsSection';
import { CommonGroundCard } from '../components/CommonGroundCard';
import { WaitingRoom } from '../components/WaitingRoom';
import { Stage, MessageRole, IdentifiedNeedDTO, CommonGroundDTO } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

type NeedMappingPhase = 'exploration' | 'review' | 'common_ground' | 'waiting' | 'complete';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the current phase based on data state.
 */
function determinePhase(
  needs: IdentifiedNeedDTO[] | undefined,
  allNeedsConfirmed: boolean,
  commonGround: CommonGroundDTO[] | undefined,
  commonGroundComplete: boolean
): NeedMappingPhase {
  // No needs synthesized yet - still in exploration
  if (!needs || needs.length === 0) {
    return 'exploration';
  }

  // Needs exist but not all confirmed - review phase
  if (!allNeedsConfirmed) {
    return 'review';
  }

  // Needs confirmed, checking common ground
  if (commonGround && commonGround.length > 0) {
    if (commonGroundComplete) {
      return 'complete';
    }
    return 'common_ground';
  }

  // Needs confirmed, waiting for common ground analysis or partner
  return 'waiting';
}

/**
 * Transform IdentifiedNeedDTO to NeedsSection format.
 */
function transformNeedsForDisplay(needs: IdentifiedNeedDTO[]) {
  return needs.map((need) => ({
    id: need.id,
    category: need.need,
    description: need.description,
  }));
}

/**
 * Transform CommonGroundDTO to CommonGroundCard format.
 */
function transformCommonGroundForDisplay(commonGround: CommonGroundDTO[]) {
  return commonGround.map((cg) => ({
    category: cg.need,
    description: cg.description,
  }));
}

// ============================================================================
// Component
// ============================================================================

export function NeedMappingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Session and progress data
  const { data: sessionData, isLoading: loadingSession } = useSession(sessionId);
  const { data: progressData, isLoading: loadingProgress } = useProgress(sessionId);

  // Messages for chat interface
  const { data: messagesData, isLoading: loadingMessages } = useMessages(
    { sessionId: sessionId!, stage: Stage.NEED_MAPPING },
    { enabled: !!sessionId }
  );
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { addOptimisticMessage, removeOptimisticMessage } = useOptimisticMessage();

  // Needs data
  const { data: needsData, isLoading: loadingNeeds } = useNeeds(sessionId);
  const { mutate: confirmNeeds, isPending: isConfirming } = useConfirmNeeds();
  const { mutate: consentShareNeeds, isPending: isConsenting } = useConsentShareNeeds();

  // Common ground data
  const { data: commonGroundData, isLoading: loadingCommonGround } = useCommonGround(sessionId);
  const { mutate: confirmCommonGround, isPending: isConfirmingCommonGround } = useConfirmCommonGround();

  // Local state for adjustment mode
  const [adjustmentMode, setAdjustmentMode] = useState(false);

  // Derived data
  const session = sessionData?.session;
  const messages = messagesData?.messages ?? [];
  const needs = needsData?.needs ?? [];
  const commonGround = commonGroundData?.commonGround ?? [];
  const myProgress = progressData?.myProgress;
  const partnerProgress = progressData?.partnerProgress;

  // Check if all needs are confirmed
  const allNeedsConfirmed = needs.length > 0 && needs.every((n) => n.confirmed);
  const commonGroundComplete = commonGroundData?.bothConfirmed ?? false;

  // Determine current phase
  const phase = determinePhase(needs, allNeedsConfirmed, commonGround, commonGroundComplete);

  // Loading state
  const isLoading = loadingSession || loadingProgress || loadingMessages || loadingNeeds;
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading need mapping...</Text>
      </View>
    );
  }

  // Check if we're on the right stage
  if (myProgress?.stage !== Stage.NEED_MAPPING && myProgress?.stage !== Stage.STRATEGIC_REPAIR) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Need Mapping',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContainer}>
            <Text style={styles.title}>Need Mapping</Text>
            <Text style={styles.subtitle}>
              This stage will be unlocked after completing Perspective Stretch.
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Check if we completed stage 3 but partner hasn't
  if (
    myProgress?.stage === Stage.STRATEGIC_REPAIR &&
    partnerProgress?.stage === Stage.NEED_MAPPING
  ) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to complete need mapping"
            partnerName={session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

  // Handle sending messages
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      const optimisticId = addOptimisticMessage(sessionId, {
        content,
        role: MessageRole.USER,
        stage: Stage.NEED_MAPPING,
      });

      sendMessage(
        { sessionId, content },
        {
          onError: () => {
            removeOptimisticMessage(sessionId, optimisticId);
          },
        }
      );
    },
    [sessionId, sendMessage, addOptimisticMessage, removeOptimisticMessage]
  );

  // Handle confirming all needs
  const handleConfirmNeeds = useCallback(() => {
    if (!sessionId) return;

    const confirmations = needs.map((need) => ({
      needId: need.id,
      confirmed: true,
    }));

    confirmNeeds(
      { sessionId, confirmations },
      {
        onSuccess: () => {
          // After confirming, consent to share for common ground discovery
          consentShareNeeds({
            sessionId,
            needIds: needs.map((n) => n.id),
          });
        },
      }
    );
  }, [sessionId, needs, confirmNeeds, consentShareNeeds]);

  // Handle confirming common ground
  const handleConfirmCommonGround = useCallback(() => {
    if (!sessionId) return;

    const confirmations = commonGround.map((cg) => ({
      commonGroundId: cg.id,
      confirmed: true,
    }));

    confirmCommonGround(
      { sessionId, confirmations },
      {
        onSuccess: () => {
          // Navigate to session detail which will route to next stage
          router.replace(`/session/${sessionId}`);
        },
      }
    );
  }, [sessionId, commonGround, confirmCommonGround, router]);

  // Handle adjustment request
  const handleAdjustNeeds = useCallback(() => {
    setAdjustmentMode(true);
    // Send a message to the AI requesting adjustment
    handleSendMessage('I would like to adjust my identified needs');
  }, [handleSendMessage]);

  // ============================================================================
  // Render Phases
  // ============================================================================

  // Phase: Exploration - chat with AI about needs
  if (phase === 'exploration') {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Understanding Needs',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Understanding Your Needs</Text>
            <Text style={styles.subtitle}>
              The AI will help translate your feelings into underlying needs
            </Text>
          </View>
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isSending}
            emptyStateTitle="Explore Your Needs"
            emptyStateMessage="Let's discover what you truly need in this situation. The AI will help translate your feelings into underlying needs."
          />
        </SafeAreaView>
      </>
    );
  }

  // Phase: Review - show identified needs for confirmation
  if (phase === 'review' || adjustmentMode) {
    const displayNeeds = transformNeedsForDisplay(needs);
    const confirmedNeedIds = needs.filter((n) => n.confirmed).map((n) => n.id);

    return (
      <>
        <Stack.Screen
          options={{
            title: 'Your Needs',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Your Identified Needs</Text>
              <Text style={styles.subtitle}>
                Review the needs identified from your conversation
              </Text>
            </View>

            <View style={styles.content}>
              <NeedsSection
                title="What you need most"
                needs={displayNeeds}
                sharedNeeds={confirmedNeedIds}
              />

              <View style={styles.confirmation}>
                <Text style={styles.confirmQuestion}>
                  Does this capture what you need?
                </Text>

                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={handleAdjustNeeds}
                  disabled={isConfirming}
                >
                  <Text style={styles.adjustText}>I want to adjust these</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmButton, isConfirming && styles.disabledButton]}
                  onPress={handleConfirmNeeds}
                  disabled={isConfirming}
                >
                  <Text style={styles.confirmText}>
                    {isConfirming ? 'Confirming...' : 'Yes, confirm my needs'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // Phase: Common Ground - show shared needs with partner
  if (phase === 'common_ground') {
    const displayNeeds = transformNeedsForDisplay(needs);
    const displayCommonGround = transformCommonGroundForDisplay(commonGround);
    const sharedNeedIds = commonGround.map((cg) => cg.id);

    return (
      <>
        <Stack.Screen
          options={{
            title: 'Common Ground',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Common Ground Discovered</Text>
              <Text style={styles.subtitle}>
                You and {session?.partner?.name ?? 'your partner'} share some common needs
              </Text>
            </View>

            <View style={styles.content}>
              <CommonGroundCard
                sharedNeeds={displayCommonGround}
                insight="Understanding these shared needs can help you find solutions together."
              />

              <NeedsSection
                title="Your Confirmed Needs"
                needs={displayNeeds}
                sharedNeeds={sharedNeedIds}
              />

              <View style={styles.confirmation}>
                <Text style={styles.confirmQuestion}>
                  Ready to move forward?
                </Text>

                <TouchableOpacity
                  style={[styles.confirmButton, isConfirmingCommonGround && styles.disabledButton]}
                  onPress={handleConfirmCommonGround}
                  disabled={isConfirmingCommonGround}
                >
                  <Text style={styles.confirmText}>
                    {isConfirmingCommonGround ? 'Confirming...' : 'Continue to Strategies'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // Phase: Waiting - waiting for partner
  if (phase === 'waiting') {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to confirm their needs so we can discover common ground"
            partnerName={session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

  // Phase: Complete - redirect to session
  if (phase === 'complete') {
    router.replace(`/session/${sessionId}`);
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Moving to next stage...</Text>
      </View>
    );
  }

  return null;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  content: {
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  confirmation: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1F2937',
  },
  adjustButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'white',
  },
  adjustText: {
    color: '#374151',
    fontSize: 14,
  },
  confirmButton: {
    padding: 14,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default NeedMappingScreen;
