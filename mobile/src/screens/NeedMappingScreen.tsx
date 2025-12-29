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
 * - Comparison: Side-by-side view of both partners' needs
 * - Common Ground: Discover shared needs with partner
 * - Waiting: Wait for partner to complete their needs
 */

import { View, ScrollView, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';
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
import { Stage, MessageRole, IdentifiedNeedDTO, CommonGroundDTO } from '@meet-without-fear/shared';

// ============================================================================
// Soft, Calming Color Palette for Need Mapping
// ============================================================================

const needMappingColors = {
  // Soft blues and teals for need categories
  softBlue: 'rgba(125, 179, 213, 0.2)',
  softBlueBorder: 'rgba(125, 179, 213, 0.4)',
  softTeal: 'rgba(94, 186, 183, 0.2)',
  softTealBorder: 'rgba(94, 186, 183, 0.4)',

  // Gentle greens for common ground
  gentleGreen: 'rgba(134, 197, 166, 0.2)',
  gentleGreenBorder: 'rgba(134, 197, 166, 0.5)',
  gentleGreenText: '#6B9E7F',

  // Warm neutrals for backgrounds
  warmNeutral: 'rgba(209, 199, 186, 0.1)',
  warmNeutralBorder: 'rgba(209, 199, 186, 0.3)',

  // Partner's needs (soft coral/peach)
  softCoral: 'rgba(224, 166, 147, 0.2)',
  softCoralBorder: 'rgba(224, 166, 147, 0.4)',

  // Shared needs highlight
  sharedHighlight: 'rgba(134, 197, 166, 0.3)',
  sharedConnector: 'rgba(134, 197, 166, 0.6)',
};

// ============================================================================
// Transformation Examples (for display)
// ============================================================================

interface NeedTransformation {
  original: string;
  transformed: string;
  needCategory: string;
}

const transformationExamples: NeedTransformation[] = [
  { original: '"You never listen"', transformed: 'Need: To be heard', needCategory: 'Understanding' },
  { original: '"You\'re always busy"', transformed: 'Need: Quality time', needCategory: 'Connection' },
  { original: '"You don\'t care"', transformed: 'Need: To feel valued', needCategory: 'Appreciation' },
  { original: '"You\'re so controlling"', transformed: 'Need: Autonomy', needCategory: 'Independence' },
];

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
// Sub-Components
// ============================================================================

/**
 * TransformationCard - Shows how accusations become needs language
 */
function TransformationCard({ transformation }: { transformation: NeedTransformation }) {
  return (
    <View style={subStyles.transformationCard}>
      <View style={subStyles.transformationRow}>
        <View style={subStyles.originalBox}>
          <Text style={subStyles.originalLabel}>What we say:</Text>
          <Text style={subStyles.originalText}>{transformation.original}</Text>
        </View>
        <View style={subStyles.arrowContainer}>
          <Text style={subStyles.arrow}>{'->'}</Text>
        </View>
        <View style={subStyles.transformedBox}>
          <Text style={subStyles.transformedLabel}>What we need:</Text>
          <Text style={subStyles.transformedText}>{transformation.transformed}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * TransformationDisplay - Shows the reframing concept
 */
function TransformationDisplay() {
  return (
    <View style={subStyles.transformationSection}>
      <Text style={subStyles.transformationTitle}>Understanding the Transformation</Text>
      <Text style={subStyles.transformationSubtitle}>
        Behind every complaint is an unmet need
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={subStyles.transformationScroll}
      >
        {transformationExamples.map((t, index) => (
          <TransformationCard key={index} transformation={t} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * NeedCardSoft - A softer styled need card for the side-by-side view
 */
function NeedCardSoft({
  need,
  isShared,
  variant,
}: {
  need: { category: string; description: string };
  isShared: boolean;
  variant: 'user' | 'partner';
}) {
  const cardStyle = [
    subStyles.needCardSoft,
    variant === 'user' ? subStyles.userNeedCard : subStyles.partnerNeedCard,
    isShared && subStyles.sharedNeedCard,
  ];

  return (
    <View style={cardStyle}>
      <Text style={subStyles.needCardCategory}>{need.category}</Text>
      <Text style={subStyles.needCardDescription}>{need.description}</Text>
      {isShared && (
        <View style={subStyles.sharedIndicator}>
          <Text style={subStyles.sharedIndicatorText}>Shared</Text>
        </View>
      )}
    </View>
  );
}

/**
 * SideBySideNeedsView - Shows user and partner needs side by side
 */
function SideBySideNeedsView({
  userNeeds,
  partnerNeeds,
  partnerName,
}: {
  userNeeds: { id: string; category: string; description: string }[];
  partnerNeeds: { id: string; category: string; description: string }[];
  partnerName: string;
}) {
  // Find shared need categories
  const sharedCategories = new Set<string>();
  const userCategories = new Set(userNeeds.map((n) => n.category.toLowerCase()));
  partnerNeeds.forEach((n) => {
    if (userCategories.has(n.category.toLowerCase())) {
      sharedCategories.add(n.category.toLowerCase());
    }
  });

  const isShared = (category: string) => sharedCategories.has(category.toLowerCase());

  return (
    <View style={subStyles.sideBySideContainer}>
      {/* Insight Banner for shared needs */}
      {sharedCategories.size > 0 && (
        <View style={subStyles.insightBanner}>
          <Text style={subStyles.insightBannerText}>
            You share {sharedCategories.size} common need{sharedCategories.size > 1 ? 's' : ''}
          </Text>
          <Text style={subStyles.insightBannerSubtext}>
            This is the foundation for understanding each other
          </Text>
        </View>
      )}

      <View style={subStyles.columnsContainer}>
        {/* Your Needs Column */}
        <View style={subStyles.needsColumn}>
          <View style={subStyles.columnHeader}>
            <Text style={subStyles.columnTitle}>Your Needs</Text>
          </View>
          {userNeeds.map((need) => (
            <NeedCardSoft
              key={need.id}
              need={need}
              isShared={isShared(need.category)}
              variant="user"
            />
          ))}
        </View>

        {/* Connector Line */}
        <View style={subStyles.connectorColumn}>
          {sharedCategories.size > 0 && (
            <View style={subStyles.connectorLine} />
          )}
        </View>

        {/* Partner's Needs Column */}
        <View style={subStyles.needsColumn}>
          <View style={subStyles.columnHeaderPartner}>
            <Text style={subStyles.columnTitle}>{partnerName}'s Needs</Text>
          </View>
          {partnerNeeds.map((need) => (
            <NeedCardSoft
              key={need.id}
              need={need}
              isShared={isShared(need.category)}
              variant="partner"
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Styles for sub-components
 */
const subStyles = StyleSheet.create({
  // Transformation styles
  transformationSection: {
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: needMappingColors.warmNeutral,
    borderRadius: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  transformationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  transformationSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  transformationScroll: {
    paddingHorizontal: 8,
  },
  transformationCard: {
    backgroundColor: needMappingColors.softTeal,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: needMappingColors.softTealBorder,
    padding: 12,
    marginRight: 12,
    width: 280,
  },
  transformationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  originalBox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 8,
  },
  originalLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  originalText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  arrowContainer: {
    paddingHorizontal: 8,
  },
  arrow: {
    fontSize: 18,
    color: needMappingColors.gentleGreenText,
    fontWeight: '600',
  },
  transformedBox: {
    flex: 1,
    backgroundColor: needMappingColors.gentleGreen,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: needMappingColors.gentleGreenBorder,
  },
  transformedLabel: {
    fontSize: 10,
    color: needMappingColors.gentleGreenText,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  transformedText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  // Side-by-side styles
  sideBySideContainer: {
    marginBottom: 24,
  },
  insightBanner: {
    backgroundColor: needMappingColors.gentleGreen,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: needMappingColors.gentleGreenBorder,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  insightBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  insightBannerSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  columnsContainer: {
    flexDirection: 'row',
  },
  needsColumn: {
    flex: 1,
  },
  connectorColumn: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 44,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    backgroundColor: needMappingColors.sharedConnector,
    borderRadius: 1,
  },
  columnHeader: {
    backgroundColor: needMappingColors.softBlue,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    marginRight: 4,
    borderWidth: 1,
    borderColor: needMappingColors.softBlueBorder,
  },
  columnHeaderPartner: {
    backgroundColor: needMappingColors.softCoral,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: needMappingColors.softCoralBorder,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  // Soft need card styles
  needCardSoft: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    position: 'relative',
  },
  userNeedCard: {
    backgroundColor: needMappingColors.softBlue,
    borderColor: needMappingColors.softBlueBorder,
    marginRight: 4,
  },
  partnerNeedCard: {
    backgroundColor: needMappingColors.softCoral,
    borderColor: needMappingColors.softCoralBorder,
    marginLeft: 4,
  },
  sharedNeedCard: {
    backgroundColor: needMappingColors.sharedHighlight,
    borderColor: needMappingColors.gentleGreenBorder,
    borderWidth: 2,
  },
  needCardCategory: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  needCardDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  sharedIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: needMappingColors.gentleGreenText,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sharedIndicatorText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});

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
  const { mutate: consentShareNeeds } = useConsentShareNeeds();

  // Common ground data
  const { data: commonGroundData } = useCommonGround(sessionId);
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

  // ============================================================================
  // Hooks must be called unconditionally (before any early returns)
  // ============================================================================

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
  // Early Returns (after all hooks)
  // ============================================================================

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
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
            <View style={styles.headerSoft}>
              <Text style={styles.title}>Your Identified Needs</Text>
              <Text style={styles.subtitle}>
                Review the needs identified from your conversation
              </Text>
            </View>

            <View style={styles.content}>
              {/* Transformation Display - shows how reframing works */}
              <TransformationDisplay />

              <NeedsSection
                title="What you need most"
                needs={displayNeeds}
                sharedNeeds={confirmedNeedIds}
              />

              <View style={styles.confirmationSoft}>
                <Text style={styles.confirmQuestion}>
                  Does this capture what you need?
                </Text>

                <TouchableOpacity
                  style={styles.adjustButtonSoft}
                  onPress={handleAdjustNeeds}
                  disabled={isConfirming}
                >
                  <Text style={styles.adjustTextSoft}>I want to adjust these</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmButtonSoft, isConfirming && styles.disabledButton]}
                  onPress={handleConfirmNeeds}
                  disabled={isConfirming}
                >
                  <Text style={styles.confirmTextSoft}>
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

  // Phase: Common Ground - show shared needs with partner using side-by-side view
  if (phase === 'common_ground') {
    const displayNeeds = transformNeedsForDisplay(needs);
    const displayCommonGround = transformCommonGroundForDisplay(commonGround);

    // Create partner needs representation from common ground
    // In the common ground phase, we show shared needs on partner's side
    // to create the "insight moment" of shared humanity
    const partnerDisplayNeeds = commonGround.map((cg) => ({
      id: `partner-${cg.id}`,
      category: cg.need,
      description: cg.description,
    }));

    const partnerName = session?.partner?.name ?? 'Partner';

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
            <View style={styles.headerSoft}>
              <Text style={styles.title}>Common Ground Discovered</Text>
              <Text style={styles.subtitle}>
                You and {partnerName} share some common needs
              </Text>
            </View>

            <View style={styles.content}>
              {/* Side-by-side needs comparison - the insight moment */}
              <SideBySideNeedsView
                userNeeds={displayNeeds}
                partnerNeeds={partnerDisplayNeeds}
                partnerName={partnerName}
              />

              {/* Common ground summary with insight */}
              <CommonGroundCard
                sharedNeeds={displayCommonGround}
                insight="When we see our shared needs, we remember we're on the same team."
              />

              <View style={styles.confirmationSoft}>
                <Text style={styles.confirmQuestion}>
                  Ready to build on this foundation?
                </Text>

                <TouchableOpacity
                  style={[styles.confirmButtonSoft, isConfirmingCommonGround && styles.disabledButton]}
                  onPress={handleConfirmCommonGround}
                  disabled={isConfirmingCommonGround}
                >
                  <Text style={styles.confirmTextSoft}>
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
        <ActivityIndicator size="large" color={colors.accent} />
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
    backgroundColor: colors.bgPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: 20,
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
  content: {
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  confirmation: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  adjustButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: colors.bgSecondary,
  },
  adjustText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  confirmButton: {
    padding: 14,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },

  // ============================================================================
  // Soft-themed styles for calming experience
  // ============================================================================

  headerSoft: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: needMappingColors.warmNeutralBorder,
    backgroundColor: needMappingColors.warmNeutral,
  },
  confirmationSoft: {
    marginTop: 24,
    padding: 16,
    backgroundColor: needMappingColors.warmNeutral,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: needMappingColors.warmNeutralBorder,
  },
  adjustButtonSoft: {
    padding: 14,
    borderWidth: 1,
    borderColor: needMappingColors.softTealBorder,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: needMappingColors.softTeal,
  },
  adjustTextSoft: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  confirmButtonSoft: {
    padding: 14,
    backgroundColor: needMappingColors.gentleGreen,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: needMappingColors.gentleGreenBorder,
  },
  confirmTextSoft: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default NeedMappingScreen;
