/**
 * UnifiedSessionScreen Component
 *
 * A unified chat-centric session interface that handles all stages.
 * The chat is always the primary view, with stage-specific content
 * appearing as inline cards or overlays.
 */

import { useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stage, MessageRole, StrategyPhase } from '@be-heard/shared';

import { ChatInterface, ChatMessage } from '../components/ChatInterface';
import { SessionChatHeader } from '../components/SessionChatHeader';
import { EmotionalBarometer } from '../components/EmotionalBarometer';
import { FeelHeardConfirmation } from '../components/FeelHeardConfirmation';
import { BreathingExercise } from '../components/BreathingExercise';
import { WaitingStatusMessage } from '../components/WaitingStatusMessage';
import { EmpathyAttemptCard } from '../components/EmpathyAttemptCard';
import { AccuracyFeedback } from '../components/AccuracyFeedback';
import { ConsentPrompt, SharingOption } from '../components/ConsentPrompt';
import { NeedsSection } from '../components/NeedsSection';
import { CommonGroundCard } from '../components/CommonGroundCard';
import { StrategyPool } from '../components/StrategyPool';
import { StrategyRanking } from '../components/StrategyRanking';
import { OverlapReveal } from '../components/OverlapReveal';
import { AgreementCard } from '../components/AgreementCard';
import { CuriosityCompact } from '../components/CuriosityCompact';

import { useUnifiedSession, InlineChatCard, WaitingStatusType } from '../hooks/useUnifiedSession';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface UnifiedSessionScreenProps {
  sessionId: string;
  onNavigateBack?: () => void;
  onStageComplete?: (stage: Stage) => void;
}

// ============================================================================
// AI Welcome Messages per Stage
// ============================================================================

const AI_WELCOME_MESSAGES: Record<Stage, string> = {
  [Stage.ONBOARDING]: `Welcome! Before we begin, let's establish some ground rules that will help us have a productive conversation.`,
  [Stage.WITNESS]: `Hi there. I'm here to listen and help you feel heard. This is your private space - whatever you share stays between us.

Take your time and share what's on your mind.`,
  [Stage.PERSPECTIVE_STRETCH]: `Now let's work on understanding your partner's perspective. I'll help you build empathy by exploring what they might be feeling and why.`,
  [Stage.NEED_MAPPING]: `Let's explore what you truly need from this situation. Behind every frustration is an unmet need - let's discover yours together.`,
  [Stage.STRATEGIC_REPAIR]: `You've both done incredible work. Now let's find strategies that address both of your needs. I'll suggest some options to get us started.`,
};

// ============================================================================
// Component
// ============================================================================

export function UnifiedSessionScreen({
  sessionId,
  onNavigateBack,
  onStageComplete,
}: UnifiedSessionScreenProps) {
  const styles = useStyles();

  const {
    // Loading
    isLoading,

    // Session context
    currentStage,
    partnerName,
    partnerProgress,
    myProgress,

    // Messages
    messages,
    inlineCards,
    isSending,

    // Overlay state
    activeOverlay,

    // Local state
    barometerValue,
    showFinalCheck,
    pendingConfirmation,

    // Stage-specific data
    compactData,
    empathyDraftData,
    partnerEmpathyData,
    allNeedsConfirmed,
    commonGround,
    strategyPhase,
    strategies,
    overlappingStrategies,
    agreements,
    isGenerating,

    // Actions
    sendMessage,
    openOverlay,
    closeOverlay,
    dismissCard,

    // Stage-specific actions
    handleBarometerChange,
    handleConfirmFeelHeard,
    handleSignCompact,
    handleSaveEmpathyDraft,
    handleShareEmpathy,
    handleValidatePartnerEmpathy,
    handleConfirmAllNeeds,
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,

    // Utility actions
    clearMirrorIntervention,
    showCooling,
    showFinal,
    setPendingConfirmation,
  } = useUnifiedSession(sessionId);

  // -------------------------------------------------------------------------
  // Prepare Messages with Welcome Message
  // -------------------------------------------------------------------------
  const displayMessages = useMemo((): ChatMessage[] => {
    if (messages.length === 0) {
      // Show welcome message for the current stage
      return [
        {
          id: `welcome-${currentStage}`,
          sessionId,
          senderId: null,
          role: MessageRole.AI,
          content: AI_WELCOME_MESSAGES[currentStage],
          stage: currentStage,
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return messages;
  }, [messages, currentStage, sessionId]);

  // -------------------------------------------------------------------------
  // Render Inline Card
  // -------------------------------------------------------------------------
  const renderInlineCard = useCallback(
    (card: InlineChatCard) => {
      switch (card.type) {
        case 'waiting-status':
          return (
            <WaitingStatusMessage
              key={card.id}
              type={card.props.statusType as WaitingStatusType}
              partnerName={card.props.partnerName as string}
              testID="waiting-status-message"
            />
          );

        case 'feel-heard-confirmation':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <FeelHeardConfirmation
                onConfirm={() => {
                  showFinal(true);
                  handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                }}
                onContinue={() => dismissCard(card.id)}
              />
            </View>
          );

        case 'cooling-suggestion':
          return (
            <View style={styles.coolingSuggestion} key={card.id}>
              <Text style={styles.coolingSuggestionTitle}>
                You seem to be feeling intense emotions
              </Text>
              <Text style={styles.coolingSuggestionText}>
                Would you like to take a moment?
              </Text>
              <View style={styles.coolingOptions}>
                <TouchableOpacity
                  style={styles.coolingOptionButton}
                  onPress={() => showCooling(false)}
                >
                  <Text style={styles.coolingOptionText}>Continue sharing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.coolingOptionButton, styles.coolingOptionAccent]}
                  onPress={() => openOverlay('breathing-exercise')}
                >
                  <Text style={styles.coolingOptionTextAccent}>
                    Try breathing exercise
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.coolingOptionButton}
                  onPress={() => {
                    if (pendingConfirmation) {
                      handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                    } else {
                      onNavigateBack?.();
                    }
                  }}
                >
                  <Text style={styles.coolingOptionText}>
                    {pendingConfirmation ? 'Proceed anyway' : 'Take a break'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'mirror-intervention':
          return (
            <View style={styles.interventionCard} key={card.id}>
              <Text style={styles.interventionTitle}>Pause for a moment</Text>
              <Text style={styles.interventionMessage}>{card.props.message as string}</Text>
              <Text style={styles.interventionPatterns}>
                Detected: {(card.props.patterns as string[]).join(', ')}
              </Text>
              <View style={styles.interventionButtons}>
                <TouchableOpacity
                  style={styles.rephraseButton}
                  onPress={clearMirrorIntervention}
                >
                  <Text style={styles.rephraseButtonText}>Rephrase</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={() => {
                    clearMirrorIntervention();
                    // Send pending message anyway
                  }}
                >
                  <Text style={styles.continueButtonText}>Continue anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'hint-card':
          return (
            <View style={styles.hintCard} key={card.id}>
              <Text style={styles.hintLabel}>Hint</Text>
              <Text style={styles.hintText}>{card.props.hint as string}</Text>
              <TouchableOpacity
                style={styles.dismissHintButton}
                onPress={() => dismissCard(card.id)}
              >
                <Text style={styles.dismissHintText}>Got it</Text>
              </TouchableOpacity>
            </View>
          );

        case 'empathy-draft-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <EmpathyAttemptCard
                attempt={card.props.content as string}
                testID="empathy-draft-preview"
              />
              <ConsentPrompt
                title="Share your attempt?"
                description={`${partnerName} will see your attempt to understand their perspective.`}
                onSelect={(option: SharingOption) => {
                  if (option === 'full') {
                    handleShareEmpathy();
                  } else if (option === 'private') {
                    handleSaveEmpathyDraft(card.props.content as string, false);
                  }
                }}
                simplified
                testID="consent-prompt"
              />
            </View>
          );

        case 'accuracy-feedback':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>
                {partnerName}'s Understanding of You
              </Text>
              <EmpathyAttemptCard
                attempt={card.props.content as string}
                isPartner
                testID="partner-empathy-attempt"
              />
              <AccuracyFeedback
                onAccurate={() => handleValidatePartnerEmpathy(true)}
                onPartiallyAccurate={() =>
                  handleValidatePartnerEmpathy(false, 'Some parts are accurate')
                }
                onInaccurate={() =>
                  handleValidatePartnerEmpathy(false, 'This does not capture my perspective')
                }
                testID="accuracy-feedback"
              />
            </View>
          );

        case 'needs-summary':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Your Identified Needs</Text>
              <NeedsSection
                title="What you need most"
                needs={card.props.needs as { id: string; category: string; description: string }[]}
                sharedNeeds={card.props.confirmedIds as string[]}
              />
              <View style={styles.confirmationButtons}>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => sendMessage('I would like to adjust my identified needs')}
                >
                  <Text style={styles.adjustText}>Adjust these</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => handleConfirmAllNeeds(() => onStageComplete?.(Stage.NEED_MAPPING))}
                >
                  <Text style={styles.confirmText}>Confirm my needs</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'common-ground-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <CommonGroundCard
                sharedNeeds={card.props.sharedNeeds as { category: string; description: string }[]}
                insight="When we see our shared needs, we remember we're on the same team."
              />
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => {
                  openOverlay('needs-side-by-side');
                }}
              >
                <Text style={styles.confirmText}>View Full Comparison</Text>
              </TouchableOpacity>
            </View>
          );

        case 'strategy-pool-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Strategy Pool</Text>
              <Text style={styles.cardSubtitle}>
                {card.props.strategyCount as number} strategies available
              </Text>
              <View style={styles.strategyPreviewButtons}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => openOverlay('strategy-pool')}
                >
                  <Text style={styles.secondaryButtonText}>View All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleMarkReadyToRank}
                >
                  <Text style={styles.primaryButtonText}>Ready to Rank</Text>
                </TouchableOpacity>
              </View>
            </View>
          );

        case 'overlap-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>You Both Chose</Text>
              <Text style={styles.overlapDescription}>
                {(card.props.topOverlap as { description: string })?.description}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => openOverlay('overlap-reveal')}
              >
                <Text style={styles.primaryButtonText}>
                  See All {card.props.overlappingCount as number} Matches
                </Text>
              </TouchableOpacity>
            </View>
          );

        case 'agreement-preview':
          return (
            <View style={styles.inlineCard} key={card.id}>
              <Text style={styles.cardTitle}>Your Agreement</Text>
              <Text style={styles.agreementExperiment}>
                {card.props.experiment as string}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => openOverlay('agreement-confirmation')}
              >
                <Text style={styles.primaryButtonText}>Review & Confirm</Text>
              </TouchableOpacity>
            </View>
          );

        default:
          return null;
      }
    },
    [
      styles,
      partnerName,
      pendingConfirmation,
      showFinal,
      showCooling,
      openOverlay,
      dismissCard,
      handleConfirmFeelHeard,
      handleShareEmpathy,
      handleSaveEmpathyDraft,
      handleValidatePartnerEmpathy,
      handleConfirmAllNeeds,
      handleMarkReadyToRank,
      clearMirrorIntervention,
      sendMessage,
      onStageComplete,
      onNavigateBack,
    ]
  );

  // -------------------------------------------------------------------------
  // Render Overlays
  // -------------------------------------------------------------------------
  const renderOverlay = useCallback(() => {
    switch (activeOverlay) {
      case 'breathing-exercise':
        return (
          <BreathingExercise
            visible={true}
            intensityBefore={barometerValue}
            onComplete={(intensityAfter) => {
              handleBarometerChange(intensityAfter);
              closeOverlay();
            }}
            onClose={closeOverlay}
          />
        );

      case 'strategy-pool':
        return (
          <View style={styles.overlayContainer}>
            <StrategyPool
              strategies={strategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              onRequestMore={handleRequestMoreStrategies}
              onReady={() => {
                handleMarkReadyToRank();
                closeOverlay();
              }}
              isGenerating={isGenerating}
            />
            <TouchableOpacity style={styles.closeOverlay} onPress={closeOverlay}>
              <Text style={styles.closeOverlayText}>Close</Text>
            </TouchableOpacity>
          </View>
        );

      case 'strategy-ranking':
        return (
          <View style={styles.overlayContainer}>
            <StrategyRanking
              strategies={strategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              onSubmit={(rankedIds) => {
                handleSubmitRankings(rankedIds);
                closeOverlay();
              }}
            />
          </View>
        );

      case 'overlap-reveal':
        return (
          <View style={styles.overlayContainer}>
            <OverlapReveal
              overlapping={overlappingStrategies.map((s) => ({
                id: s.id,
                description: s.description,
                duration: s.duration || undefined,
              }))}
              uniqueToMe={[]}
              uniqueToPartner={[]}
            />
            <TouchableOpacity style={styles.closeOverlay} onPress={closeOverlay}>
              <Text style={styles.closeOverlayText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      case 'agreement-confirmation':
        if (agreements.length === 0) return null;
        return (
          <View style={styles.overlayContainer}>
            <AgreementCard
              agreement={{
                experiment: agreements[0].description,
                duration: agreements[0].duration || 'To be determined',
                successMeasure: agreements[0].measureOfSuccess || 'To be defined together',
                checkInDate: agreements[0].followUpDate || undefined,
              }}
              onConfirm={() => {
                handleConfirmAgreement(agreements[0].id, () => {
                  handleResolveSession(() => onStageComplete?.(Stage.STRATEGIC_REPAIR));
                });
                closeOverlay();
              }}
            />
          </View>
        );

      case 'curiosity-compact':
        return (
          <View style={styles.overlayContainer}>
            <CuriosityCompact
              sessionId={sessionId}
              onSign={() => {
                handleSignCompact(() => onStageComplete?.(Stage.ONBOARDING));
                closeOverlay();
              }}
            />
          </View>
        );

      default:
        return null;
    }
  }, [
    activeOverlay,
    barometerValue,
    strategies,
    overlappingStrategies,
    agreements,
    sessionId,
    isGenerating,
    styles,
    handleBarometerChange,
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,
    handleSignCompact,
    closeOverlay,
    onStageComplete,
  ]);

  // -------------------------------------------------------------------------
  // Loading State
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={styles.accentColor.color} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Onboarding Stage - Show Compact First
  // -------------------------------------------------------------------------
  if (currentStage === Stage.ONBOARDING && !compactData?.mySigned) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          partnerOnline={false}
          testID="session-chat-header"
        />
        <CuriosityCompact
          sessionId={sessionId}
          onSign={() => handleSignCompact(() => onStageComplete?.(Stage.ONBOARDING))}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Strategy Ranking Phase - Full Screen Overlay
  // -------------------------------------------------------------------------
  if (currentStage === Stage.STRATEGIC_REPAIR && strategyPhase === StrategyPhase.RANKING) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          partnerOnline={false}
          testID="session-chat-header"
        />
        <StrategyRanking
          strategies={strategies.map((s) => ({
            id: s.id,
            description: s.description,
            duration: s.duration || undefined,
          }))}
          onSubmit={handleSubmitRankings}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Main Chat Interface
  // -------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SessionChatHeader
        partnerName={partnerName}
        partnerOnline={false}
        testID="session-chat-header"
      />
      <View style={styles.content}>
        <ChatInterface
          messages={displayMessages}
          onSendMessage={sendMessage}
          isLoading={isSending}
        />

        {/* Render inline cards at the end of the chat */}
        {inlineCards.map((card) => renderInlineCard(card))}

        {/* Emotional Barometer (shown periodically in Stage 1) */}
        {currentStage === Stage.WITNESS && showFinalCheck && (
          <View style={styles.barometerContainer}>
            <EmotionalBarometer
              value={barometerValue}
              onChange={handleBarometerChange}
            />
            <View style={styles.finalCheckActions}>
              <Text style={styles.finalCheckText}>
                Check in with yourself before moving on
              </Text>
              <TouchableOpacity
                style={styles.finalCheckButton}
                onPress={() => {
                  if (barometerValue >= 8) {
                    showCooling(true);
                    setPendingConfirmation(true);
                  } else {
                    handleConfirmFeelHeard(() => onStageComplete?.(Stage.WITNESS));
                  }
                  showFinal(false);
                }}
              >
                <Text style={styles.finalCheckButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Overlays */}
      {renderOverlay()}
    </SafeAreaView>
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
    accentColor: {
      color: t.colors.accent,
    },

    // Inline Cards
    inlineCard: {
      margin: 16,
      padding: 16,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: 8,
    },
    cardSubtitle: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginBottom: 16,
    },

    // Cooling Suggestion
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

    // Mirror Intervention
    interventionCard: {
      margin: 16,
      padding: 16,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.warning,
    },
    interventionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.warning,
      marginBottom: 8,
    },
    interventionMessage: {
      fontSize: 14,
      color: t.colors.textPrimary,
      lineHeight: 20,
      marginBottom: 8,
    },
    interventionPatterns: {
      fontSize: 12,
      color: t.colors.textSecondary,
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
      backgroundColor: t.colors.accent,
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
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    continueButtonText: {
      color: t.colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },

    // Hint Card
    hintCard: {
      margin: 16,
      marginTop: 8,
      padding: 16,
      backgroundColor: 'rgba(16, 163, 127, 0.1)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.accent,
    },
    hintLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.colors.accent,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    hintText: {
      fontSize: 14,
      color: t.colors.textPrimary,
      lineHeight: 20,
      marginBottom: 12,
    },
    dismissHintButton: {
      alignSelf: 'flex-end',
      padding: 8,
    },
    dismissHintText: {
      color: t.colors.accent,
      fontSize: 14,
      fontWeight: '500',
    },

    // Barometer
    barometerContainer: {
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bgSecondary,
    },
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

    // Confirmation Buttons
    confirmationButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    adjustButton: {
      flex: 1,
      padding: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
    },
    adjustText: {
      color: t.colors.textPrimary,
      fontSize: 14,
    },
    confirmButton: {
      flex: 1,
      padding: 14,
      backgroundColor: t.colors.accent,
      borderRadius: 8,
      alignItems: 'center',
    },
    confirmText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },

    // Strategy Preview
    strategyPreviewButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      padding: 14,
      backgroundColor: t.colors.accent,
      borderRadius: 8,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },
    secondaryButton: {
      flex: 1,
      padding: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 8,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: t.colors.textPrimary,
      fontSize: 14,
    },

    // Overlap & Agreement
    overlapDescription: {
      fontSize: 16,
      color: t.colors.textPrimary,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    agreementExperiment: {
      fontSize: 16,
      color: t.colors.textPrimary,
      marginBottom: 16,
      lineHeight: 24,
    },

    // Overlay
    overlayContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.colors.bgPrimary,
    },
    closeOverlay: {
      position: 'absolute',
      bottom: 40,
      left: 20,
      right: 20,
      padding: 16,
      backgroundColor: t.colors.accent,
      borderRadius: 12,
      alignItems: 'center',
    },
    closeOverlayText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
  }));

export default UnifiedSessionScreen;
