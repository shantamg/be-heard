/**
 * useUnifiedSession Hook
 *
 * Composite hook that combines all stage-specific logic for the unified session interface.
 * Manages state across all stages while keeping the chat interface as the primary view.
 */

import { useMemo, useCallback, useReducer, useEffect, useRef } from 'react';
import { Stage, MessageRole, StrategyPhase } from '@meet-without-fear/shared';

import {
  useSession,
  useSessionInvitation,
  useConfirmInvitationMessage,
} from './useSessions';
import {
  useInfiniteMessages,
  useSendMessage,
  useOptimisticMessage,
  useRecordEmotion,
} from './useMessages';
import {
  useProgress,
  useCompactStatus,
  useSignCompact,
  useAdvanceStage,
  useConfirmFeelHeard,
  useEmpathyDraft,
  usePartnerEmpathy,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  useValidateEmpathy,
  useNeeds,
  useConfirmNeeds,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
  useStrategies,
  useRequestStrategySuggestions,
  useProposeStrategy,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  useAgreements,
  useConfirmAgreement,
  useCreateAgreement,
  useResolveSession,
} from './useStages';

// ============================================================================
// Types
// ============================================================================

export type OverlayType =
  | 'breathing-exercise'
  | 'grounding-exercise'
  | 'body-scan-exercise'
  | 'support-options'
  | 'strategy-pool'
  | 'strategy-ranking'
  | 'overlap-reveal'
  | 'agreement-confirmation'
  | 'needs-side-by-side'
  | 'curiosity-compact'
  | 'waiting-room'
  | null;

export type InlineCardType =
  // Cross-stage: Waiting status
  | 'waiting-status'
  // Stage 1: Witness
  | 'emotional-barometer'
  | 'feel-heard-confirmation'
  | 'cooling-suggestion'
  // Stage 2: Perspective Stretch
  | 'empathy-draft-preview'
  | 'mirror-intervention'
  | 'hint-card'
  | 'consent-prompt'
  | 'accuracy-feedback'
  // Stage 3: Need Mapping
  | 'need-card'
  | 'needs-summary'
  | 'common-ground-preview'
  // Stage 4: Strategic Repair
  | 'strategy-suggestion'
  | 'strategy-pool-preview'
  | 'overlap-preview'
  | 'agreement-preview';

export interface InlineChatCard {
  id: string;
  type: InlineCardType;
  position: string | 'end';
  props: Record<string, unknown>;
  dismissible?: boolean;
}

interface MirrorIntervention {
  detected: boolean;
  message: string;
  patterns: string[];
}

// Re-export WaitingStatusType from the component for external use
export type { WaitingStatusType } from '../components/WaitingStatusMessage';

// Internal type that includes null for state management
type WaitingStatusState =
  | 'compact-pending' // Stage 0: Waiting for partner to sign compact
  | 'witness-pending' // Stage 1: Waiting for partner to complete witness
  | 'empathy-pending' // Stage 2: Waiting for partner to share empathy
  | 'needs-pending' // Stage 3: Waiting for partner to confirm needs
  | 'ranking-pending' // Stage 4: Waiting for partner to submit ranking
  | 'partner-signed' // Partner has signed compact
  | 'partner-completed-witness' // Partner completed witness stage
  | 'partner-shared-empathy' // Partner shared their empathy attempt
  | 'partner-confirmed-needs' // Partner confirmed their needs
  | null;

interface UnifiedSessionState {
  activeOverlay: OverlayType;
  dismissedCards: Set<string>;
  barometerValue: number;
  lastBarometerMessageCount: number;
  mirrorIntervention: MirrorIntervention | null;
  pendingMessage: string | null;
  showHint: boolean;
  currentHint: string | null;
  showCoolingSuggestion: boolean;
  showFinalCheck: boolean;
  pendingConfirmation: boolean;
  hasConfirmedHeard: boolean; // Tracks if user confirmed they feel heard
  followUpDate: Date | null;
  waitingStatus: WaitingStatusState;
  previousWaitingStatus: WaitingStatusState; // Track previous to detect changes
}

// ============================================================================
// Constants
// ============================================================================

const BAROMETER_MESSAGE_INTERVAL = 5;
const HIGH_INTENSITY_THRESHOLD = 8;
const HINT_DELAY_MS = 60000;

const EMPATHY_HINTS = [
  'Try thinking about what they might be feeling in this situation.',
  'Consider what underlying needs they might be expressing.',
  'What experiences from their life might shape their perspective?',
  'How might they describe this situation to a close friend?',
  'What fears or hopes might be driving their position?',
  'Try starting with "It sounds like you feel..."',
  'Consider what they might need to feel heard right now.',
];

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

// ============================================================================
// Helper Functions
// ============================================================================

function detectHarmfulLanguage(text: string): MirrorIntervention {
  const detectedPatterns: string[] = [];

  for (const pattern of HARMFUL_PATTERNS.judgmental) {
    if (pattern.test(text)) {
      detectedPatterns.push('judgmental language');
      break;
    }
  }

  for (const pattern of HARMFUL_PATTERNS.accusatory) {
    if (pattern.test(text)) {
      detectedPatterns.push('accusatory language');
      break;
    }
  }

  for (const pattern of HARMFUL_PATTERNS.dismissive) {
    if (pattern.test(text)) {
      detectedPatterns.push('dismissive language');
      break;
    }
  }

  if (detectedPatterns.length > 0) {
    return {
      detected: true,
      message:
        'I notice some strong language. Would you like to rephrase this to focus on understanding?',
      patterns: detectedPatterns,
    };
  }

  return { detected: false, message: '', patterns: [] };
}

function getRandomHint(): string {
  const index = Math.floor(Math.random() * EMPATHY_HINTS.length);
  return EMPATHY_HINTS[index];
}

// ============================================================================
// State Reducer
// ============================================================================

type SessionAction =
  | { type: 'OPEN_OVERLAY'; payload: OverlayType }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'DISMISS_CARD'; payload: string }
  | { type: 'SET_BAROMETER'; payload: number }
  | {
      type: 'SET_MIRROR_INTERVENTION';
      payload: { intervention: MirrorIntervention; pendingMessage: string };
    }
  | { type: 'CLEAR_MIRROR_INTERVENTION' }
  | { type: 'SET_HINT'; payload: string }
  | { type: 'CLEAR_HINT' }
  | { type: 'SET_FOLLOW_UP_DATE'; payload: Date | null }
  | { type: 'SET_LAST_BAROMETER_COUNT'; payload: number }
  | { type: 'SHOW_COOLING_SUGGESTION'; payload: boolean }
  | { type: 'SHOW_FINAL_CHECK'; payload: boolean }
  | { type: 'SET_PENDING_CONFIRMATION'; payload: boolean }
  | { type: 'SET_HAS_CONFIRMED_HEARD'; payload: boolean }
  | { type: 'SET_WAITING_STATUS'; payload: WaitingStatusState }
  | { type: 'RESET_STATE' };

function sessionReducer(
  state: UnifiedSessionState,
  action: SessionAction
): UnifiedSessionState {
  switch (action.type) {
    case 'OPEN_OVERLAY':
      return { ...state, activeOverlay: action.payload };
    case 'CLOSE_OVERLAY':
      return { ...state, activeOverlay: null };
    case 'DISMISS_CARD':
      return {
        ...state,
        dismissedCards: new Set([...state.dismissedCards, action.payload]),
      };
    case 'SET_BAROMETER':
      return { ...state, barometerValue: action.payload };
    case 'SET_MIRROR_INTERVENTION':
      return {
        ...state,
        mirrorIntervention: action.payload.intervention,
        pendingMessage: action.payload.pendingMessage,
      };
    case 'CLEAR_MIRROR_INTERVENTION':
      return { ...state, mirrorIntervention: null, pendingMessage: null };
    case 'SET_HINT':
      return { ...state, showHint: true, currentHint: action.payload };
    case 'CLEAR_HINT':
      return { ...state, showHint: false, currentHint: null };
    case 'SET_FOLLOW_UP_DATE':
      return { ...state, followUpDate: action.payload };
    case 'SET_LAST_BAROMETER_COUNT':
      return { ...state, lastBarometerMessageCount: action.payload };
    case 'SHOW_COOLING_SUGGESTION':
      return { ...state, showCoolingSuggestion: action.payload };
    case 'SHOW_FINAL_CHECK':
      return { ...state, showFinalCheck: action.payload };
    case 'SET_PENDING_CONFIRMATION':
      return { ...state, pendingConfirmation: action.payload };
    case 'SET_HAS_CONFIRMED_HEARD':
      return { ...state, hasConfirmedHeard: action.payload };
    case 'SET_WAITING_STATUS':
      return {
        ...state,
        previousWaitingStatus: state.waitingStatus,
        waitingStatus: action.payload,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

const initialState: UnifiedSessionState = {
  activeOverlay: null,
  dismissedCards: new Set(),
  barometerValue: 5,
  lastBarometerMessageCount: 0,
  mirrorIntervention: null,
  pendingMessage: null,
  showHint: false,
  currentHint: null,
  showCoolingSuggestion: false,
  showFinalCheck: false,
  pendingConfirmation: false,
  hasConfirmedHeard: false,
  followUpDate: null,
  waitingStatus: null,
  previousWaitingStatus: null,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useUnifiedSession(sessionId: string | undefined) {
  // Local state management
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const lastActivityTime = useRef<number>(Date.now());
  const prevMessageCountRef = useRef(0);

  // -------------------------------------------------------------------------
  // Core Data Hooks
  // -------------------------------------------------------------------------
  const { data: sessionData, isLoading: loadingSession } = useSession(sessionId);
  const { data: progressData, isLoading: loadingProgress } = useProgress(sessionId);

  const currentStage = progressData?.myProgress?.stage ?? Stage.ONBOARDING;

  // Messages - fetch all messages with infinite scroll (no stage filter)
  // This allows previous stage messages to remain visible after stage transitions
  const {
    data: messagesData,
    isLoading: loadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMessages(
    { sessionId: sessionId!, limit: 25 },
    { enabled: !!sessionId }
  );

  // -------------------------------------------------------------------------
  // Stage-Specific Data Hooks (conditionally enabled based on current stage)
  // -------------------------------------------------------------------------

  // Stage 0: Compact
  const { data: compactData } = useCompactStatus(sessionId);

  // Invitation - fetch for invitation phase detection
  // We enable this when session status is CREATED (sessionData is available)
  const { data: invitationData } = useSessionInvitation(sessionId, {
    enabled: !!sessionId && sessionData?.session?.status === 'CREATED',
  });

  // Stage 2: Empathy - only fetch when in stage 2 or later
  const { data: empathyDraftData } = useEmpathyDraft(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.PERSPECTIVE_STRETCH,
  });
  const { data: partnerEmpathyData } = usePartnerEmpathy(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.PERSPECTIVE_STRETCH,
  });

  // Stage 3: Needs - only fetch when in stage 3 or later
  const { data: needsData } = useNeeds(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.NEED_MAPPING,
  });
  const { data: commonGroundData } = useCommonGround(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.NEED_MAPPING,
  });

  // Stage 4: Strategies - only fetch when in stage 4 or later
  const { data: strategyData } = useStrategies(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.STRATEGIC_REPAIR,
  });
  const { data: revealData } = useStrategiesReveal(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.STRATEGIC_REPAIR,
  });
  const { data: agreementsData } = useAgreements(sessionId, {
    enabled: !!sessionId && currentStage >= Stage.STRATEGIC_REPAIR,
  });

  // -------------------------------------------------------------------------
  // Mutation Hooks
  // -------------------------------------------------------------------------
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: recordEmotion } = useRecordEmotion();
  const { mutate: confirmHeard } = useConfirmFeelHeard();
  const { mutate: signCompact } = useSignCompact();
  const { mutate: confirmInvitationMessage } = useConfirmInvitationMessage();
  const { mutate: advanceStage } = useAdvanceStage();
  const { mutate: saveDraft } = useSaveEmpathyDraft();
  const { mutate: consentToShare } = useConsentToShareEmpathy();
  const { mutate: validateEmpathy } = useValidateEmpathy();
  const { mutate: confirmNeeds } = useConfirmNeeds();
  const { mutate: consentShareNeeds } = useConsentShareNeeds();
  const { mutate: confirmCommonGroundMutation } = useConfirmCommonGround();
  const { mutate: proposeStrategy, isPending: isProposing } = useProposeStrategy();
  const { mutate: requestSuggestions, isPending: isGenerating } =
    useRequestStrategySuggestions();
  const { mutate: markReady } = useMarkReadyToRank();
  const { mutate: submitRankings } = useSubmitRankings();
  const { mutate: confirmAgreement } = useConfirmAgreement();
  useCreateAgreement(); // Available if needed for hybrid strategies
  const { mutate: resolveSession } = useResolveSession();
  const { addOptimisticMessage, removeOptimisticMessage } = useOptimisticMessage();

  // -------------------------------------------------------------------------
  // Derived Values
  // -------------------------------------------------------------------------
  const session = sessionData?.session;
  // Flatten paginated messages - pages are in reverse chronological order (newest first)
  // but each page's messages are in chronological order, so we need to flatten
  // with older pages first: [page2, page1, page0].flatMap(p => p.messages)
  const messages = useMemo(() => {
    // messagesData is InfiniteData<GetMessagesResponse> with pages array
    const pages = messagesData?.pages;
    if (!pages || pages.length === 0) return [];
    // Pages are stored newest-first, but we want chronological order for display
    // Reverse pages so older messages come first, then flatten
    return [...pages].reverse().flatMap(page => page.messages);
  }, [messagesData]);
  // Only show 'Partner' fallback after data has loaded, otherwise show empty string
  const partnerName = loadingSession
    ? ''
    : (session?.partner?.nickname ?? session?.partner?.name ?? 'Partner');

  // Invitation phase detection
  // We're in invitation phase when:
  // - Session status is CREATED
  // - Invitation message hasn't been confirmed yet
  const invitation = invitationData?.invitation;
  const isInvitationPhase =
    session?.status === 'CREATED' && !invitation?.messageConfirmed;
  const invitationMessage = invitation?.invitationMessage ?? null;
  const invitationConfirmed = invitation?.messageConfirmed ?? false;
  const myProgress = progressData?.myProgress;
  const partnerProgress = progressData?.partnerProgress;
  const canAdvance = progressData?.canAdvance ?? false;

  // Count user messages for barometer trigger
  const userMessageCount = messages.filter((m) => m.role === MessageRole.USER).length;

  // Check if AI is asking about feeling heard (Stage 1)
  const lastAiMessage = [...messages].reverse().find((m) => m.role === MessageRole.AI);
  const isAskingAboutHeard =
    lastAiMessage?.content.toLowerCase().includes('feel heard') ||
    lastAiMessage?.content.toLowerCase().includes('fully heard');

  // Needs confirmation state
  const needs = useMemo(() => needsData?.needs ?? [], [needsData?.needs]);
  const allNeedsConfirmed = needs.length > 0 && needs.every((n) => n.confirmed);
  const commonGround = useMemo(() => commonGroundData?.commonGround ?? [], [commonGroundData?.commonGround]);
  const commonGroundComplete = commonGroundData?.bothConfirmed ?? false;

  // Strategy phase
  const strategyPhase = strategyData?.phase ?? StrategyPhase.COLLECTING;
  const strategies = useMemo(() => strategyData?.strategies ?? [], [strategyData?.strategies]);
  const overlappingStrategies = useMemo(() => revealData?.overlap ?? [], [revealData?.overlap]);
  const agreements = useMemo(() => agreementsData?.agreements ?? [], [agreementsData?.agreements]);

  // -------------------------------------------------------------------------
  // Barometer Trigger Effect
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentStage !== Stage.WITNESS) return;

    if (userMessageCount > prevMessageCountRef.current) {
      prevMessageCountRef.current = userMessageCount;

      const messagesSinceLastBarometer =
        userMessageCount - state.lastBarometerMessageCount;
      if (messagesSinceLastBarometer >= BAROMETER_MESSAGE_INTERVAL) {
        dispatch({ type: 'SET_LAST_BAROMETER_COUNT', payload: userMessageCount });
        // Show barometer via inline card
      }
    }
  }, [userMessageCount, state.lastBarometerMessageCount, currentStage]);

  // -------------------------------------------------------------------------
  // Hint Timer Effect (Stage 2)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentStage !== Stage.PERSPECTIVE_STRETCH) return;

    const checkInactivity = () => {
      const timeSinceActivity = Date.now() - lastActivityTime.current;
      if (timeSinceActivity >= HINT_DELAY_MS && !state.showHint) {
        dispatch({ type: 'SET_HINT', payload: getRandomHint() });
      }
    };

    const interval = setInterval(checkInactivity, 10000);
    return () => clearInterval(interval);
  }, [currentStage, state.showHint]);

  // -------------------------------------------------------------------------
  // Waiting Status Effect
  // -------------------------------------------------------------------------
  // Compute and update waiting status based on session state
  useEffect(() => {
    let newWaitingStatus: WaitingStatusState = null;

    // Stage 0: Waiting for partner to sign compact
    if (currentStage === Stage.ONBOARDING && compactData?.mySigned && !compactData?.partnerSigned) {
      newWaitingStatus = 'compact-pending';
    }
    // Stage 0: Partner just signed (transition)
    else if (
      currentStage === Stage.ONBOARDING &&
      compactData?.mySigned &&
      compactData?.partnerSigned &&
      state.previousWaitingStatus === 'compact-pending'
    ) {
      newWaitingStatus = 'partner-signed';
    }
    // Stage 1: Waiting for partner to complete witness
    else if (
      myProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      partnerProgress?.stage === Stage.WITNESS
    ) {
      newWaitingStatus = 'witness-pending';
    }
    // Stage 1: Partner just completed witness (transition)
    else if (
      myProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      partnerProgress?.stage === Stage.PERSPECTIVE_STRETCH &&
      state.previousWaitingStatus === 'witness-pending'
    ) {
      newWaitingStatus = 'partner-completed-witness';
    }
    // Stage 2: Waiting for partner to share empathy
    else if (empathyDraftData?.alreadyConsented && partnerEmpathyData?.waitingForPartner) {
      newWaitingStatus = 'empathy-pending';
    }
    // Stage 2: Partner just shared empathy (transition)
    else if (
      partnerEmpathyData?.attempt &&
      !partnerEmpathyData.validated &&
      state.previousWaitingStatus === 'empathy-pending'
    ) {
      newWaitingStatus = 'partner-shared-empathy';
    }
    // Stage 3: Waiting for partner to confirm needs
    else if (allNeedsConfirmed && !commonGround.length) {
      newWaitingStatus = 'needs-pending';
    }
    // Stage 3: Partner confirmed needs (transition)
    else if (
      commonGround.length > 0 &&
      state.previousWaitingStatus === 'needs-pending'
    ) {
      newWaitingStatus = 'partner-confirmed-needs';
    }
    // Stage 4: Waiting for partner to rank
    else if (strategyPhase === StrategyPhase.REVEALING && !overlappingStrategies.length) {
      newWaitingStatus = 'ranking-pending';
    }

    // Only update if status changed
    if (newWaitingStatus !== state.waitingStatus) {
      dispatch({ type: 'SET_WAITING_STATUS', payload: newWaitingStatus });
    }
  }, [
    currentStage,
    compactData?.mySigned,
    compactData?.partnerSigned,
    myProgress?.stage,
    partnerProgress?.stage,
    empathyDraftData?.alreadyConsented,
    partnerEmpathyData?.waitingForPartner,
    partnerEmpathyData?.attempt,
    partnerEmpathyData?.validated,
    allNeedsConfirmed,
    commonGround.length,
    strategyPhase,
    overlappingStrategies.length,
    state.waitingStatus,
    state.previousWaitingStatus,
  ]);

  // -------------------------------------------------------------------------
  // Generate Inline Cards
  // -------------------------------------------------------------------------
  const inlineCards = useMemo((): InlineChatCard[] => {
    const cards: InlineChatCard[] = [];

    // Cross-stage: Waiting status notification (appears first)
    if (state.waitingStatus) {
      cards.push({
        id: `waiting-status-${state.waitingStatus}`,
        type: 'waiting-status',
        position: 'end',
        props: {
          statusType: state.waitingStatus,
          partnerName,
        },
      });
    }

    // Stage 1: Witness cards
    if (currentStage === Stage.WITNESS) {
      // Cooling suggestion
      if (state.showCoolingSuggestion) {
        cards.push({
          id: 'cooling-suggestion',
          type: 'cooling-suggestion',
          position: 'end',
          props: {
            intensity: state.barometerValue,
            pendingConfirmation: state.pendingConfirmation,
          },
        });
      }

      // Feel heard confirmation (only show if not already confirmed)
      if (isAskingAboutHeard && !state.showFinalCheck && !state.showCoolingSuggestion && !state.hasConfirmedHeard) {
        cards.push({
          id: 'feel-heard-confirmation',
          type: 'feel-heard-confirmation',
          position: 'end',
          props: {},
        });
      }
    }

    // Stage 2: Perspective Stretch cards
    if (currentStage === Stage.PERSPECTIVE_STRETCH) {
      // Mirror intervention
      if (state.mirrorIntervention) {
        cards.push({
          id: 'mirror-intervention',
          type: 'mirror-intervention',
          position: 'end',
          props: {
            message: state.mirrorIntervention.message,
            patterns: state.mirrorIntervention.patterns,
          },
        });
      }

      // Hint card
      if (state.showHint && state.currentHint) {
        cards.push({
          id: 'hint-card',
          type: 'hint-card',
          position: 'end',
          props: { hint: state.currentHint },
          dismissible: true,
        });
      }

      // Empathy draft preview when ready to share
      if (empathyDraftData?.canConsent && empathyDraftData?.draft?.readyToShare) {
        cards.push({
          id: 'empathy-draft-preview',
          type: 'empathy-draft-preview',
          position: 'end',
          props: {
            content: empathyDraftData.draft.content,
            partnerName,
          },
        });
      }

      // Partner's empathy for validation
      if (partnerEmpathyData?.attempt && !partnerEmpathyData.validated) {
        cards.push({
          id: 'accuracy-feedback',
          type: 'accuracy-feedback',
          position: 'end',
          props: {
            partnerName,
            content: partnerEmpathyData.attempt.content,
          },
        });
      }
    }

    // Stage 3: Need Mapping cards
    if (currentStage === Stage.NEED_MAPPING) {
      // Needs summary for review
      if (needs.length > 0 && !allNeedsConfirmed) {
        cards.push({
          id: 'needs-summary',
          type: 'needs-summary',
          position: 'end',
          props: {
            needs: needs.map((n) => ({
              id: n.id,
              category: n.need,
              description: n.description,
            })),
            confirmedIds: needs.filter((n) => n.confirmed).map((n) => n.id),
          },
        });
      }

      // Common ground preview
      if (commonGround.length > 0 && !commonGroundComplete) {
        cards.push({
          id: 'common-ground-preview',
          type: 'common-ground-preview',
          position: 'end',
          props: {
            sharedNeeds: commonGround.map((cg) => ({
              category: cg.need,
              description: cg.description,
            })),
            partnerName,
          },
        });
      }
    }

    // Stage 4: Strategic Repair cards
    if (currentStage === Stage.STRATEGIC_REPAIR) {
      // Strategy pool preview
      if (strategyPhase === StrategyPhase.COLLECTING) {
        cards.push({
          id: 'strategy-pool-preview',
          type: 'strategy-pool-preview',
          position: 'end',
          props: {
            strategyCount: strategies.length,
            // Note: StrategyDTO doesn't expose source to keep strategies unlabeled
            userContributedCount: 0,
          },
        });
      }

      // Overlap preview after ranking
      if (strategyPhase === StrategyPhase.REVEALING && overlappingStrategies.length > 0) {
        cards.push({
          id: 'overlap-preview',
          type: 'overlap-preview',
          position: 'end',
          props: {
            overlappingCount: overlappingStrategies.length,
            topOverlap: overlappingStrategies[0],
          },
        });
      }

      // Agreement preview
      if (agreements.length > 0) {
        cards.push({
          id: 'agreement-preview',
          type: 'agreement-preview',
          position: 'end',
          props: {
            experiment: agreements[0].description,
            duration: agreements[0].duration,
          },
        });
      }
    }

    // Filter out dismissed cards
    return cards.filter((card) => !state.dismissedCards.has(card.id));
  }, [
    currentStage,
    state,
    isAskingAboutHeard,
    empathyDraftData,
    partnerEmpathyData,
    needs,
    allNeedsConfirmed,
    commonGround,
    commonGroundComplete,
    strategyPhase,
    strategies,
    overlappingStrategies,
    agreements,
    partnerName,
  ]);

  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;

      // Reset activity timer
      lastActivityTime.current = Date.now();
      dispatch({ type: 'CLEAR_HINT' });

      // Check for mirror intervention (Stage 2)
      if (currentStage === Stage.PERSPECTIVE_STRETCH) {
        const intervention = detectHarmfulLanguage(content);
        if (intervention.detected) {
          dispatch({
            type: 'SET_MIRROR_INTERVENTION',
            payload: { intervention, pendingMessage: content },
          });
          return;
        }
      }

      // Add optimistic message
      const optimisticId = addOptimisticMessage(sessionId, {
        content,
        role: MessageRole.USER,
        stage: currentStage,
      });

      sendMessage(
        { sessionId, content },
        {
          onError: () => removeOptimisticMessage(sessionId, optimisticId),
        }
      );
    },
    [
      sessionId,
      currentStage,
      sendMessage,
      addOptimisticMessage,
      removeOptimisticMessage,
    ]
  );

  const handleBarometerChange = useCallback(
    (value: number) => {
      dispatch({ type: 'SET_BAROMETER', payload: value });
      if (sessionId) {
        recordEmotion({ sessionId, intensity: value });
      }

      if (value >= HIGH_INTENSITY_THRESHOLD) {
        dispatch({ type: 'SHOW_COOLING_SUGGESTION', payload: true });
      }
    },
    [sessionId, recordEmotion]
  );

  const handleConfirmFeelHeard = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      // Mark as confirmed to prevent looping
      dispatch({ type: 'SET_HAS_CONFIRMED_HEARD', payload: true });
      confirmHeard({ sessionId, confirmed: true }, { onSuccess });
    },
    [sessionId, confirmHeard]
  );

  const handleSignCompact = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      signCompact(
        { sessionId },
        {
          onSuccess: () => {
            // Auto-advance to stage 1 after signing compact
            advanceStage({ sessionId }, { onSuccess });
          },
        }
      );
    },
    [sessionId, signCompact, advanceStage]
  );

  const handleConfirmInvitationMessage = useCallback(
    (message?: string, onSuccess?: () => void) => {
      if (!sessionId) return;
      confirmInvitationMessage(
        { sessionId, message },
        { onSuccess }
      );
    },
    [sessionId, confirmInvitationMessage]
  );

  const handleSaveEmpathyDraft = useCallback(
    (content: string, readyToShare?: boolean) => {
      if (!sessionId) return;
      saveDraft({ sessionId, content, readyToShare });
    },
    [sessionId, saveDraft]
  );

  const handleShareEmpathy = useCallback(() => {
    if (!sessionId) return;
    consentToShare({ sessionId, consent: true });
  }, [sessionId, consentToShare]);

  const handleValidatePartnerEmpathy = useCallback(
    (validated: boolean, feedback?: string) => {
      if (!sessionId) return;
      validateEmpathy({ sessionId, validated, feedback });
    },
    [sessionId, validateEmpathy]
  );

  const handleConfirmAllNeeds = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId || needs.length === 0) return;

      const confirmations = needs.map((need) => ({
        needId: need.id,
        confirmed: true,
      }));

      confirmNeeds(
        { sessionId, confirmations },
        {
          onSuccess: () => {
            consentShareNeeds({
              sessionId,
              needIds: needs.map((n) => n.id),
            });
            onSuccess?.();
          },
        }
      );
    },
    [sessionId, needs, confirmNeeds, consentShareNeeds]
  );

  const handleConfirmCommonGround = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId || commonGround.length === 0) return;

      const confirmations = commonGround.map((cg) => ({
        commonGroundId: cg.id,
        confirmed: true,
      }));

      confirmCommonGroundMutation({ sessionId, confirmations }, { onSuccess });
    },
    [sessionId, commonGround, confirmCommonGroundMutation]
  );

  const handleAddStrategy = useCallback(
    (description: string) => {
      if (!sessionId) return;
      proposeStrategy({ sessionId, description });
    },
    [sessionId, proposeStrategy]
  );

  const handleRequestMoreStrategies = useCallback(
    (count?: number) => {
      if (!sessionId) return;
      requestSuggestions({ sessionId, count });
    },
    [sessionId, requestSuggestions]
  );

  const handleMarkReadyToRank = useCallback(() => {
    if (!sessionId) return;
    markReady({ sessionId });
  }, [sessionId, markReady]);

  const handleSubmitRankings = useCallback(
    (rankedIds: string[]) => {
      if (!sessionId) return;
      submitRankings({ sessionId, rankedIds });
    },
    [sessionId, submitRankings]
  );

  const handleConfirmAgreement = useCallback(
    (agreementId: string, onSuccess?: () => void) => {
      if (!sessionId) return;
      confirmAgreement({ sessionId, agreementId, confirmed: true }, { onSuccess });
    },
    [sessionId, confirmAgreement]
  );

  const handleResolveSession = useCallback(
    (onSuccess?: () => void) => {
      if (!sessionId) return;
      resolveSession({ sessionId }, { onSuccess });
    },
    [sessionId, resolveSession]
  );

  const openOverlay = useCallback((overlay: OverlayType) => {
    dispatch({ type: 'OPEN_OVERLAY', payload: overlay });
  }, []);

  const closeOverlay = useCallback(() => {
    dispatch({ type: 'CLOSE_OVERLAY' });
  }, []);

  const dismissCard = useCallback((cardId: string) => {
    dispatch({ type: 'DISMISS_CARD', payload: cardId });
  }, []);

  // -------------------------------------------------------------------------
  // Return Value
  // -------------------------------------------------------------------------
  return {
    // Loading state
    isLoading: loadingSession || loadingProgress || loadingMessages,

    // Session context
    session,
    sessionId,
    currentStage,
    stageStatus: myProgress?.status,
    partnerName,
    partnerProgress,
    myProgress,
    canAdvance,
    gates: myProgress?.gates,

    // Messages and cards
    messages,
    inlineCards,
    isSending,

    // Pagination for loading older messages
    fetchMoreMessages: fetchNextPage,
    hasMoreMessages: hasNextPage ?? false,
    isFetchingMoreMessages: isFetchingNextPage,

    // Overlay state
    activeOverlay: state.activeOverlay,

    // Local state
    barometerValue: state.barometerValue,
    currentHint: state.currentHint,
    mirrorIntervention: state.mirrorIntervention,
    pendingMessage: state.pendingMessage,
    showCoolingSuggestion: state.showCoolingSuggestion,
    showFinalCheck: state.showFinalCheck,
    pendingConfirmation: state.pendingConfirmation,
    followUpDate: state.followUpDate,
    waitingStatus: state.waitingStatus,

    // Invitation phase
    isInvitationPhase,
    invitationMessage,
    invitationConfirmed,
    invitation,

    // Stage-specific data
    compactData,
    empathyDraftData,
    partnerEmpathyData,
    needsData,
    needs,
    allNeedsConfirmed,
    commonGroundData,
    commonGround,
    commonGroundComplete,
    strategyData,
    strategyPhase,
    strategies,
    revealData,
    overlappingStrategies,
    agreementsData,
    agreements,
    isGenerating,
    isProposing,

    // Actions
    sendMessage: handleSendMessage,
    openOverlay,
    closeOverlay,
    dismissCard,
    dispatch,

    // Stage-specific actions
    handleBarometerChange,
    handleConfirmFeelHeard,
    handleSignCompact,
    handleConfirmInvitationMessage,
    handleSaveEmpathyDraft,
    handleShareEmpathy,
    handleValidatePartnerEmpathy,
    handleConfirmAllNeeds,
    handleConfirmCommonGround,
    handleAddStrategy,
    handleRequestMoreStrategies,
    handleMarkReadyToRank,
    handleSubmitRankings,
    handleConfirmAgreement,
    handleResolveSession,

    // Utility actions
    clearMirrorIntervention: () => dispatch({ type: 'CLEAR_MIRROR_INTERVENTION' }),
    clearHint: () => dispatch({ type: 'CLEAR_HINT' }),
    showCooling: (show: boolean) =>
      dispatch({ type: 'SHOW_COOLING_SUGGESTION', payload: show }),
    showFinal: (show: boolean) =>
      dispatch({ type: 'SHOW_FINAL_CHECK', payload: show }),
    setPendingConfirmation: (pending: boolean) =>
      dispatch({ type: 'SET_PENDING_CONFIRMATION', payload: pending }),
    setFollowUpDate: (date: Date | null) =>
      dispatch({ type: 'SET_FOLLOW_UP_DATE', payload: date }),
  };
}
