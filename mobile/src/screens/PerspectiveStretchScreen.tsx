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
 * 5. Revision - Partner provided feedback, user can revise their attempt
 * 6. Complete - Both users have validated, stage advances
 *
 * Features:
 * - Mirror Intervention: Detects harmful language patterns (judgmental, accusatory)
 * - Hint System: Helps stuck users with contextual suggestions
 * - Revision Loop: Allows revision when partner rates empathy as inaccurate
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
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
import { ChatHeader } from '../components/ChatHeader';
import { EmpathyAttemptCard } from '../components/EmpathyAttemptCard';
import { ConsentPrompt, SharingOption } from '../components/ConsentPrompt';
import { AccuracyFeedback } from '../components/AccuracyFeedback';
import { WaitingRoom } from '../components/WaitingRoom';
import { Stage, StageStatus } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

type Phase = 'building' | 'ready_to_share' | 'waiting_for_partner' | 'validation' | 'revision' | 'complete';

interface MirrorIntervention {
  detected: boolean;
  message: string;
  patterns: string[];
}

// ============================================================================
// Mirror Intervention Detection
// ============================================================================

/**
 * Harmful language patterns that may indicate judgmental or accusatory language.
 * Used to trigger the Mirror Intervention feature.
 */
const HARMFUL_PATTERNS = {
  judgmental: [
    /\byou always\b/i,
    /\byou never\b/i,
    /\byou're (so|being|just)\b/i,
    /\btypical(ly)?\b/i,
    /\bof course you\b/i,
  ],
  accusatory: [
    /\byou made me\b/i,
    /\bit's your fault\b/i,
    /\byou did this\b/i,
    /\bbecause of you\b/i,
    /\byou don't care\b/i,
    /\byou're wrong\b/i,
  ],
  dismissive: [
    /\bwhatever\b/i,
    /\bI don't care\b/i,
    /\bdoesn't matter\b/i,
    /\bget over it\b/i,
    /\byou're overreacting\b/i,
    /\bthat's ridiculous\b/i,
  ],
};

/**
 * Detects potentially harmful language patterns in text.
 */
function detectHarmfulLanguage(text: string): MirrorIntervention {
  const detectedPatterns: string[] = [];

  // Check judgmental patterns
  for (const pattern of HARMFUL_PATTERNS.judgmental) {
    if (pattern.test(text)) {
      detectedPatterns.push('judgmental language');
      break;
    }
  }

  // Check accusatory patterns
  for (const pattern of HARMFUL_PATTERNS.accusatory) {
    if (pattern.test(text)) {
      detectedPatterns.push('accusatory language');
      break;
    }
  }

  // Check dismissive patterns
  for (const pattern of HARMFUL_PATTERNS.dismissive) {
    if (pattern.test(text)) {
      detectedPatterns.push('dismissive language');
      break;
    }
  }

  if (detectedPatterns.length > 0) {
    return {
      detected: true,
      message: 'I notice some strong language. Would you like to rephrase this to focus on understanding?',
      patterns: detectedPatterns,
    };
  }

  return { detected: false, message: '', patterns: [] };
}

// ============================================================================
// Hint System
// ============================================================================

const EMPATHY_HINTS = [
  'Try thinking about what they might be feeling in this situation.',
  'Consider what underlying needs they might be expressing.',
  'What experiences from their life might shape their perspective?',
  'How might they describe this situation to a close friend?',
  'What fears or hopes might be driving their position?',
  'Try starting with "It sounds like you feel..."',
  'Consider what they might need to feel heard right now.',
];

/**
 * Gets a random hint from the available hints.
 */
function getRandomHint(): string {
  const index = Math.floor(Math.random() * EMPATHY_HINTS.length);
  return EMPATHY_HINTS[index];
}

// ============================================================================
// Phase Determination
// ============================================================================

function determinePhase(
  progressData: ReturnType<typeof useProgress>['data'],
  empathyDraftData: ReturnType<typeof useEmpathyDraft>['data'],
  partnerEmpathyData: ReturnType<typeof usePartnerEmpathy>['data'],
  needsRevision: boolean
): Phase {
  // Check if stage is complete
  if (progressData?.myProgress?.status === StageStatus.COMPLETED && progressData?.canAdvance) {
    return 'complete';
  }

  // Check if user needs to revise their empathy attempt based on partner feedback
  if (needsRevision && empathyDraftData?.draft) {
    return 'revision';
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
  const { mutate: consentToShare } = useConsentToShareEmpathy();
  const { mutate: validateEmpathy } = useValidateEmpathy();

  // Mirror intervention state
  const [mirrorIntervention, setMirrorIntervention] = useState<MirrorIntervention | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Hint system state
  const [showHint, setShowHint] = useState(false);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const lastActivityTime = useRef<number>(Date.now());
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Revision state (for when partner rates empathy as inaccurate)
  const [needsRevision, setNeedsRevision] = useState(false);
  const [partnerFeedback, setPartnerFeedback] = useState<string | null>(null);

  // Derived data
  const session = sessionData?.session;
  const myProgress = progressData?.myProgress;
  const partnerName = session?.partner?.name ?? 'Partner';

  // Determine current phase
  const phase = useMemo(
    () => determinePhase(progressData, empathyDraftData, partnerEmpathyData, needsRevision),
    [progressData, empathyDraftData, partnerEmpathyData, needsRevision]
  );

  // Setup hint timer for stuck users
  useEffect(() => {
    const HINT_DELAY_MS = 60000; // Show hint after 1 minute of inactivity

    if (phase === 'building' || phase === 'revision') {
      const checkInactivity = () => {
        const timeSinceActivity = Date.now() - lastActivityTime.current;
        if (timeSinceActivity >= HINT_DELAY_MS && !showHint) {
          setCurrentHint(getRandomHint());
          setShowHint(true);
        }
      };

      hintTimeoutRef.current = setInterval(checkInactivity, 10000);

      return () => {
        if (hintTimeoutRef.current) {
          clearInterval(hintTimeoutRef.current);
        }
      };
    }
  }, [phase, showHint]);

  // Reset activity timer on user interaction
  const resetActivityTimer = useCallback(() => {
    lastActivityTime.current = Date.now();
    setShowHint(false);
  }, []);

  // Handle getting a new hint
  const handleGetHint = useCallback(() => {
    setCurrentHint(getRandomHint());
    setShowHint(true);
  }, []);

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
        <ActivityIndicator size="large" color={colors.accent} />
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

  // Handle sharing option selection (simplified to consent/decline)
  const handleShareSelect = (option: SharingOption) => {
    if (!sessionId) return;

    if (option === 'private') {
      // Go back to editing - mark draft as not ready
      if (!empathyDraftData?.draft?.content) return;
      saveDraft({
        sessionId,
        content: empathyDraftData.draft.content,
        readyToShare: false,
      });
    } else {
      // Share with partner
      consentToShare({
        sessionId,
        consent: true,
      });
    }
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
    // When partner says partially accurate, trigger revision for the other user
    // For now, we store feedback and allow the partner to revise
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: 'Some parts are accurate, but I need to add more context.',
    });
  };

  const handleInaccurate = () => {
    if (!sessionId) return;
    // When partner says inaccurate, trigger revision for the other user
    validateEmpathy({
      sessionId,
      validated: false,
      feedback: 'This does not capture my perspective accurately.',
    });
  };

  // Handle message sending with mirror intervention
  const handleSendMessage = (content: string) => {
    if (!sessionId) return;

    // Reset activity timer
    resetActivityTimer();

    // Check for harmful language patterns
    const intervention = detectHarmfulLanguage(content);
    if (intervention.detected) {
      setMirrorIntervention(intervention);
      setPendingMessage(content);
      return;
    }

    sendMessage({ sessionId, content });
  };

  // Handle mirror intervention - rephrase
  const handleRephrase = () => {
    setMirrorIntervention(null);
    setPendingMessage(null);
    // User will type a new message
  };

  // Handle mirror intervention - continue anyway
  const handleContinueAnyway = () => {
    if (pendingMessage && sessionId) {
      sendMessage({ sessionId, content: pendingMessage });
    }
    setMirrorIntervention(null);
    setPendingMessage(null);
  };

  // Handle revision submission (used for future partner feedback feature)
  const _handleRevisionSubmit = (revisedContent: string) => {
    if (!sessionId) return;
    saveDraft({
      sessionId,
      content: revisedContent,
      readyToShare: true,
    });
    setNeedsRevision(false);
    setPartnerFeedback(null);
  };

  // Handle skipping revision and continuing
  const handleSkipRevision = () => {
    setNeedsRevision(false);
    setPartnerFeedback(null);
  };

  // Render mirror intervention card
  const renderMirrorIntervention = () => {
    if (!mirrorIntervention) return null;

    return (
      <View style={styles.interventionCard}>
        <Text style={styles.interventionTitle}>Pause for a moment</Text>
        <Text style={styles.interventionMessage}>{mirrorIntervention.message}</Text>
        <Text style={styles.interventionPatterns}>
          Detected: {mirrorIntervention.patterns.join(', ')}
        </Text>
        <View style={styles.interventionButtons}>
          <TouchableOpacity
            style={styles.rephraseButton}
            onPress={handleRephrase}
            accessibilityRole="button"
          >
            <Text style={styles.rephraseButtonText}>Rephrase</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinueAnyway}
            accessibilityRole="button"
          >
            <Text style={styles.continueButtonText}>Continue anyway</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render hint card
  const renderHintCard = () => {
    if (!showHint || !currentHint) return null;

    return (
      <View style={styles.hintCard}>
        <Text style={styles.hintLabel}>Hint</Text>
        <Text style={styles.hintText}>{currentHint}</Text>
        <TouchableOpacity
          style={styles.dismissHintButton}
          onPress={() => setShowHint(false)}
          accessibilityRole="button"
        >
          <Text style={styles.dismissHintText}>Got it</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render "Need a hint?" button
  const renderHintButton = () => {
    if (showHint) return null;

    return (
      <TouchableOpacity
        style={styles.needHintButton}
        onPress={handleGetHint}
        accessibilityRole="button"
      >
        <Text style={styles.needHintText}>Need a hint?</Text>
      </TouchableOpacity>
    );
  };

  // Render phase-specific content
  const renderContent = () => {
    switch (phase) {
      case 'building':
        return (
          <View style={styles.chatContainer}>
            <ChatHeader
              stageName="Perspective Stretch"
              stageNumber={2}
              stageDescription="Work with the AI to understand your partner's perspective."
              completedStages={1}
              testID="perspective-stretch-chat-header"
            />
            <View style={styles.header}>
              <Text style={styles.title}>Building Your Understanding</Text>
              <Text style={styles.subtitle}>
                Work with the AI to understand your partner's perspective
              </Text>
              {renderHintButton()}
            </View>
            {renderHintCard()}
            {renderMirrorIntervention()}
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
              onSelect={handleShareSelect}
              simplified
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

      case 'revision':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Revise Your Understanding</Text>
              <Text style={styles.subtitle}>
                {partnerName} provided feedback on your empathy attempt
              </Text>
              {renderHintButton()}
            </View>
            {partnerFeedback && (
              <View style={styles.feedbackCard}>
                <Text style={styles.feedbackLabel}>Partner's feedback:</Text>
                <Text style={styles.feedbackText}>{partnerFeedback}</Text>
              </View>
            )}
            <EmpathyAttemptCard
              attempt={empathyDraftData?.draft?.content || ''}
              testID="my-empathy-attempt-revision"
            />
            {renderHintCard()}
            {renderMirrorIntervention()}
            <View style={styles.revisionActions}>
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isSending}
                emptyStateTitle="Revise Your Understanding"
                emptyStateMessage="Consider the feedback and work with the AI to improve your understanding."
              />
              <View style={styles.revisionButtons}>
                <TouchableOpacity
                  style={styles.skipRevisionButton}
                  onPress={handleSkipRevision}
                  accessibilityRole="button"
                >
                  <Text style={styles.skipRevisionText}>Skip revision</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    backgroundColor: colors.bgPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: 20,
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },

  // Mirror Intervention styles
  interventionCard: {
    margin: 16,
    padding: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  interventionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 8,
  },
  interventionMessage: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 8,
  },
  interventionPatterns: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  interventionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  rephraseButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  rephraseButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  continueButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },

  // Hint system styles
  hintCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  hintLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hintText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 12,
  },
  dismissHintButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  dismissHintText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  needHintButton: {
    marginTop: 8,
    padding: 8,
    alignSelf: 'flex-start',
  },
  needHintText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },

  // Revision phase styles
  feedbackCard: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedbackText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  revisionActions: {
    flex: 1,
  },
  revisionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  skipRevisionButton: {
    padding: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipRevisionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PerspectiveStretchScreen;
