/**
 * PerspectiveStretchScreen Component
 *
 * Stage 2 - Perspective Stretch
 * Users create and share empathy drafts to understand each other's perspective.
 *
 * Phases:
 * 1. Building - User works with AI to draft their understanding of partner's perspective
 * 2. Ready to Share - User reviews draft and consents to share with partner
 * 3. Waiting for Partner - User has consented, waiting for partner to do the same
 * 4. Validation - User reviews partner's attempt and provides accuracy feedback
 * 5. Complete - Both users have validated, stage advances
 */

import { useEffect, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../hooks/useSessions';
import {
  useProgress,
  useEmpathyDraft,
  usePartnerEmpathy,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  useValidateEmpathy,
} from '../hooks/useStages';
import { useMessages, useSendMessage } from '../hooks/useMessages';
import { ChatInterface } from '../components/ChatInterface';
import { EmpathyAttemptCard } from '../components/EmpathyAttemptCard';
import { ConsentPrompt } from '../components/ConsentPrompt';
import { AccuracyFeedback } from '../components/AccuracyFeedback';
import { WaitingRoom } from '../components/WaitingRoom';
import { Stage, StageStatus } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

type Phase = 'building' | 'ready_to_share' | 'waiting_for_partner' | 'validation' | 'complete';

// ============================================================================
// Phase Determination
// ============================================================================

function determinePhase(
  progressData: ReturnType<typeof useProgress>['data'],
  empathyDraftData: ReturnType<typeof useEmpathyDraft>['data'],
  partnerEmpathyData: ReturnType<typeof usePartnerEmpathy>['data']
): Phase {
  // Check if stage is complete
  if (progressData?.myProgress?.status === StageStatus.COMPLETED && progressData?.canAdvance) {
    return 'complete';
  }

  // Check if we have partner's attempt to validate
  if (partnerEmpathyData?.attempt && !partnerEmpathyData.validated) {
    return 'validation';
  }

  // Check if we're waiting for partner
  if (empathyDraftData?.alreadyConsented && partnerEmpathyData?.waitingForPartner) {
    return 'waiting_for_partner';
  }

  // Check if draft is ready to share
  if (empathyDraftData?.canConsent && empathyDraftData?.draft?.readyToShare) {
    return 'ready_to_share';
  }

  // Default to building phase
  return 'building';
}

// ============================================================================
// Component
// ============================================================================

export function PerspectiveStretchScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Data hooks
  const { data: sessionData, isLoading: loadingSession } = useSession(sessionId);
  const { data: progressData, isLoading: loadingProgress } = useProgress(sessionId);
  const { data: empathyDraftData, isLoading: loadingDraft } = useEmpathyDraft(sessionId);
  const { data: partnerEmpathyData, isLoading: loadingPartnerEmpathy } =
    usePartnerEmpathy(sessionId);
  const { data: messagesData } = useMessages({ sessionId: sessionId || '', stage: Stage.PERSPECTIVE_STRETCH });
  const messages = messagesData?.messages ?? [];

  // Mutation hooks
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: saveDraft } = useSaveEmpathyDraft();
  const { mutate: consentToShare, isPending: isConsenting } = useConsentToShareEmpathy();
  const { mutate: validateEmpathy, isPending: isValidating } = useValidateEmpathy();

  // Derived data
  const session = sessionData?.session;
  const myProgress = progressData?.myProgress;
  const partnerName = session?.partner?.name ?? 'Partner';

  // Determine current phase
  const phase = useMemo(
    () => determinePhase(progressData, empathyDraftData, partnerEmpathyData),
    [progressData, empathyDraftData, partnerEmpathyData]
  );

  // Navigate away when complete
  useEffect(() => {
    if (phase === 'complete' && sessionId) {
      router.replace(`/session/${sessionId}`);
    }
  }, [phase, sessionId, router]);

  // Loading state
  const isLoading = loadingSession || loadingProgress || loadingDraft || loadingPartnerEmpathy;
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading perspective stretch...</Text>
      </View>
    );
  }

  // Check if we're on the right stage
  if (myProgress?.stage !== Stage.PERSPECTIVE_STRETCH) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Perspective Stretch',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContainer}>
            <Text style={styles.title}>Perspective Stretch</Text>
            <Text style={styles.subtitle}>
              This stage will be unlocked after completing the Witness stage.
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Handle consent actions
  const handleConsent = () => {
    if (!sessionId) return;
    consentToShare({
      sessionId,
      consent: true,
    });
  };

  const handleDecline = () => {
    // Go back to editing - mark draft as not ready
    if (!sessionId || !empathyDraftData?.draft?.content) return;
    saveDraft({
      sessionId,
      content: empathyDraftData.draft.content,
      readyToShare: false,
    });
  };

  // Handle validation actions
  const handleAccurate = () => {
    if (!sessionId) return;
    validateEmpathy({
      sessionId,
      validated: true,
    });
  };

  const handlePartiallyAccurate = () => {
    if (!sessionId) return;
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: 'Some parts are accurate, but I need to add more context.',
    });
  };

  const handleInaccurate = () => {
    if (!sessionId) return;
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: 'This does not capture my perspective accurately.',
    });
  };

  // Handle message sending
  const handleSendMessage = (content: string) => {
    if (!sessionId) return;
    sendMessage({ sessionId, content });
  };

  // Render phase-specific content
  const renderContent = () => {
    switch (phase) {
      case 'building':
        return (
          <View style={styles.chatContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>Building Your Understanding</Text>
              <Text style={styles.subtitle}>
                Work with the AI to understand your partner's perspective
              </Text>
            </View>
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isSending}
              emptyStateTitle="Build Your Understanding"
              emptyStateMessage="Share what you understand about your partner's perspective. The AI will help you refine it."
            />
          </View>
        );

      case 'ready_to_share':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Ready to Share</Text>
              <Text style={styles.subtitle}>
                Review your empathy attempt before sharing with {partnerName}
              </Text>
            </View>
            <EmpathyAttemptCard
              attempt={empathyDraftData?.draft?.content || ''}
              testID="my-empathy-attempt"
            />
            <ConsentPrompt
              title="Share your attempt?"
              description={`${partnerName} will see your attempt to understand their perspective. They can provide feedback on how accurate it feels.`}
              onConsent={handleConsent}
              onDecline={handleDecline}
              consentLabel="Yes, share this"
              declineLabel="Not yet"
              testID="consent-prompt"
            />
          </ScrollView>
        );

      case 'waiting_for_partner':
        return (
          <WaitingRoom
            message={`You've shared your empathy attempt. Waiting for ${partnerName} to share theirs.`}
            partnerName={partnerName}
          />
        );

      case 'validation':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Partner's Understanding of You</Text>
              <Text style={styles.subtitle}>
                Review how {partnerName} understands your perspective
              </Text>
            </View>
            <EmpathyAttemptCard
              attempt={partnerEmpathyData?.attempt?.content || ''}
              isPartner
              testID="partner-empathy-attempt"
            />
            <AccuracyFeedback
              onAccurate={handleAccurate}
              onPartiallyAccurate={handlePartiallyAccurate}
              onInaccurate={handleInaccurate}
              testID="accuracy-feedback"
            />
          </ScrollView>
        );

      case 'complete':
        // Will be navigated away
        return null;

      default:
        return null;
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: phase === 'validation' ? 'Review Understanding' : 'Building Empathy',
          headerBackTitle: 'Session',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {renderContent()}
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
    backgroundColor: 'white',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
  },
  chatContainer: {
    flex: 1,
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});

export default PerspectiveStretchScreen;
