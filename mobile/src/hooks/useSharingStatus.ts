/**
 * useSharingStatus Hook
 *
 * Composite hook that composes existing hooks to provide all sharing-related data
 * for the Sharing Status screen and header badge.
 */

import { useMemo } from 'react';
import { useEmpathyStatus, useShareOffer, usePartnerEmpathy } from './useStages';
import {
  EmpathyExchangeStatusResponse,
  GetShareSuggestionResponse,
  EmpathyStatus,
  EmpathyAttemptDTO,
  ReconcilerResultSummary,
} from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface SharedContextHistoryItem {
  id: string;
  type: 'empathy_attempt' | 'shared_context' | 'validation';
  direction: 'sent' | 'received';
  content: string;
  timestamp: string;
  /** Additional metadata */
  metadata?: {
    status?: EmpathyStatus;
    validated?: boolean;
  };
}

export interface SharingStatusData {
  /** My empathy attempt toward partner */
  myAttempt: EmpathyAttemptDTO | null;
  /** Partner's empathy attempt toward me */
  partnerAttempt: EmpathyAttemptDTO | null;
  /** Whether reconciler is currently analyzing */
  isAnalyzing: boolean;
  /** Pending share suggestion from reconciler */
  shareOffer: GetShareSuggestionResponse['suggestion'];
  /** Whether there is a pending share suggestion */
  hasSuggestion: boolean;
  /** Count of all pending actions (for badge) */
  pendingActionsCount: number;
  /** Chronological list of shared items */
  sharedContextHistory: SharedContextHistoryItem[];
  /** Whether to show the sharing button in header */
  shouldShowButton: boolean;
  /** Whether partner has completed Stage 1 */
  partnerCompletedStage1: boolean;
  /** Partner's validation status of my attempt (if applicable) */
  partnerValidated: boolean;
  /** My validation status of partner's attempt */
  myValidation: {
    validated: boolean;
    awaitingRevision: boolean;
    validatedAt: string | null;
  };
  /** Shared context from subject (if I'm the guesser) */
  sharedContext: EmpathyExchangeStatusResponse['sharedContext'];
  /** Content I shared (if I'm the subject) */
  mySharedContext: EmpathyExchangeStatusResponse['mySharedContext'];
  /** Whether there is new shared context to view */
  hasNewSharedContext: boolean;
  /** Whether I need to validate partner's empathy */
  needsToValidatePartner: boolean;
  /** Reconciler result for my empathy attempt (if reconciler has run) */
  myReconcilerResult: ReconcilerResultSummary | null;
  /** Whether partner has submitted an empathy attempt (even if not revealed to me yet) */
  partnerHasSubmittedEmpathy: boolean;
  /** Partner's empathy attempt status (even if not revealed) - allows showing "held by reconciler" */
  partnerEmpathyHeldStatus: EmpathyStatus | null;
  /** When partner submitted their empathy attempt (for chronological ordering) */
  partnerEmpathySubmittedAt: string | null;
  /** Loading states */
  isLoading: boolean;
  isError: boolean;
}

export interface UseSharingStatusOptions {
  /** Master switch for all sharing-status queries. */
  enabled?: boolean;
  /** Whether to fetch empathy status data. */
  enableEmpathyStatus?: boolean;
  /** Whether to fetch pending share-offer data. */
  enableShareOffer?: boolean;
  /** Whether to fetch partner empathy data. */
  enablePartnerEmpathy?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useSharingStatus(
  sessionId: string | undefined,
  options: UseSharingStatusOptions = {}
): SharingStatusData {
  const baseEnabled = !!sessionId && (options.enabled ?? true);

  // Compose existing hooks
  const empathyStatusQuery = useEmpathyStatus(sessionId, {
    enabled: baseEnabled && (options.enableEmpathyStatus ?? true),
  });
  const empathyStatus = empathyStatusQuery.data;
  const shareOfferQuery = useShareOffer(sessionId, {
    enabled:
      baseEnabled &&
      (options.enableShareOffer ?? true),
    // Once reconciliation reports AWAITING_SHARING, the offer may still be
    // committing in the background. Poll only until that persisted offer is
    // visible; normal steady-state reads remain event-driven.
    refetchInterval: (query) =>
      empathyStatus?.awaitingSharing && !query.state.data?.hasSuggestion
        ? 2_000
        : false,
  });
  const partnerEmpathyQuery = usePartnerEmpathy(sessionId, {
    enabled: baseEnabled && (options.enablePartnerEmpathy ?? true),
  });

  const shareOfferData = shareOfferQuery.data;
  const partnerEmpathyData = partnerEmpathyQuery.data;

  // Build shared context history
  const sharedContextHistory = useMemo<SharedContextHistoryItem[]>(() => {
    const items: SharedContextHistoryItem[] = [];

    // Add my empathy attempt - show all attempts, not just revealed ones
    if (empathyStatus?.myAttempt) {
      items.push({
        id: empathyStatus.myAttempt.id,
        type: 'empathy_attempt',
        direction: 'sent',
        content: empathyStatus.myAttempt.content,
        timestamp: empathyStatus.myAttempt.sharedAt,
        metadata: {
          status: empathyStatus.myAttempt.status,
        },
      });
    }

    // Add partner's empathy attempt - show if revealed or validated
    if (
      empathyStatus?.partnerAttempt &&
      (empathyStatus.partnerAttempt.status === 'REVEALED' ||
        empathyStatus.partnerAttempt.status === 'VALIDATED')
    ) {
      items.push({
        id: empathyStatus.partnerAttempt.id,
        type: 'empathy_attempt',
        direction: 'received',
        content: empathyStatus.partnerAttempt.content,
        timestamp: empathyStatus.partnerAttempt.revealedAt || empathyStatus.partnerAttempt.sharedAt,
        metadata: {
          status: empathyStatus.partnerAttempt.status,
        },
      });
    }

    // Add shared context if received (I'm the guesser)
    if (empathyStatus?.sharedContext) {
      items.push({
        id: `shared-context-received-${empathyStatus.sharedContext.sharedAt}`,
        type: 'shared_context',
        direction: 'received',
        content: empathyStatus.sharedContext.content,
        timestamp: empathyStatus.sharedContext.sharedAt,
      });
    }

    // Add shared context I sent (I'm the subject)
    if (empathyStatus?.mySharedContext) {
      items.push({
        id: `shared-context-sent-${empathyStatus.mySharedContext.sharedAt}`,
        type: 'shared_context',
        direction: 'sent',
        content: empathyStatus.mySharedContext.content,
        timestamp: empathyStatus.mySharedContext.sharedAt,
      });
    }

    // Sort by timestamp (oldest first, chat-like order)
    return items.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [empathyStatus, shareOfferData]);

  // Calculate pending actions count
  const pendingActionsCount = useMemo(() => {
    let count = 0;

    // Share suggestion pending
    if (shareOfferData?.hasSuggestion) {
      count += 1;
    }

    // Partner's empathy needs validation (revealed but not validated)
    if (
      partnerEmpathyData?.attempt &&
      partnerEmpathyData.partnerStatus === 'REVEALED' &&
      !partnerEmpathyData.validated
    ) {
      count += 1;
    }

    // New shared context to view
    if (empathyStatus?.hasNewSharedContext) {
      count += 1;
    }

    return count;
  }, [shareOfferData, partnerEmpathyData, empathyStatus]);

  // Determine if button should show
  const shouldShowButton = useMemo(() => {
    // Show if any pending actions exist
    if (pendingActionsCount > 0) return true;

    // Show if there's any empathy activity to view
    if (empathyStatus?.myAttempt || empathyStatus?.partnerAttempt) return true;

    // Show if reconciler is analyzing
    if (empathyStatus?.analyzing) return true;

    return false;
  }, [pendingActionsCount, empathyStatus]);

  // Check if user needs to validate partner's empathy
  const needsToValidatePartner = useMemo(() => {
    return (
      partnerEmpathyData?.attempt !== null &&
      partnerEmpathyData?.partnerStatus === 'REVEALED' &&
      !partnerEmpathyData?.validated
    );
  }, [partnerEmpathyData]);

  return {
    myAttempt: empathyStatus?.myAttempt ?? null,
    partnerAttempt: empathyStatus?.partnerAttempt ?? null,
    isAnalyzing: empathyStatus?.analyzing ?? false,
    shareOffer: shareOfferData?.suggestion ?? null,
    hasSuggestion: shareOfferData?.hasSuggestion ?? false,
    pendingActionsCount,
    sharedContextHistory,
    shouldShowButton,
    partnerCompletedStage1: empathyStatus?.partnerCompletedStage1 ?? false,
    /** Whether my empathy attempt was validated by partner (derived from status) */
    partnerValidated: empathyStatus?.myAttempt?.status === 'VALIDATED',
    myValidation: {
      validated: partnerEmpathyData?.validated ?? false,
      awaitingRevision: partnerEmpathyData?.awaitingRevision ?? false,
      validatedAt: partnerEmpathyData?.validatedAt ?? null,
    },
    sharedContext: empathyStatus?.sharedContext ?? null,
    mySharedContext: empathyStatus?.mySharedContext ?? null,
    hasNewSharedContext: empathyStatus?.hasNewSharedContext ?? false,
    needsToValidatePartner,
    myReconcilerResult: empathyStatus?.myReconcilerResult ?? null,
    partnerHasSubmittedEmpathy: empathyStatus?.partnerHasSubmittedEmpathy ?? false,
    partnerEmpathyHeldStatus: empathyStatus?.partnerEmpathyHeldStatus ?? null,
    partnerEmpathySubmittedAt: empathyStatus?.partnerEmpathySubmittedAt ?? null,
    isLoading:
      empathyStatusQuery.isLoading ||
      shareOfferQuery.isLoading ||
      partnerEmpathyQuery.isLoading,
    isError:
      empathyStatusQuery.isError ||
      shareOfferQuery.isError ||
      partnerEmpathyQuery.isError,
  };
}

export default useSharingStatus;
