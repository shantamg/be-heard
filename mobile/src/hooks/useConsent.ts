/**
 * Consent Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for consent management operations.
 * These hooks support the Consensual Bridge mechanism where users
 * explicitly control what data is shared with their partner.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import {
  ConsentDecision,
  ConsentContentType,
} from '@meet-without-fear/shared';
import { stageKeys } from './useStages';

// ============================================================================
// Query Keys
// ============================================================================

export const consentKeys = {
  all: ['consent'] as const,
  pending: (sessionId: string) => [...consentKeys.all, 'pending', sessionId] as const,
  history: (sessionId: string) => [...consentKeys.all, 'history', sessionId] as const,
};

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from GET /sessions/:id/consent/pending
 */
interface GetPendingConsentsResponse {
  pendingRequests: {
    id: string;
    contentType: ConsentContentType;
    targetId: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }[];
}

/**
 * Response from POST /sessions/:id/consent/decide
 */
interface DecideConsentResponse {
  recorded: boolean;
  consentRecord: {
    id: string;
    contentType: ConsentContentType;
    decision: ConsentDecision | null;
    decidedAt: string | null;
    revokedAt: string | null;
  };
  sharedContent: {
    id: string;
    sourceUserId: string;
    transformedContent: string;
    consentedAt: string;
    consentActive: boolean;
  } | null;
}

/**
 * Response from POST /sessions/:id/consent/revoke
 */
interface RevokeConsentResponse {
  revoked: boolean;
  revokedAt: string;
}

/**
 * Response from GET /sessions/:id/consent/history
 */
interface GetConsentHistoryResponse {
  records: {
    id: string;
    contentType: ConsentContentType;
    targetId: string;
    decision: ConsentDecision | null;
    decidedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }[];
}

// ============================================================================
// Pending Consents Hook
// ============================================================================

/**
 * Get pending consent requests for the current user.
 * GET /sessions/:id/consent/pending
 */
export function useConsentPending(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetPendingConsentsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: consentKeys.pending(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetPendingConsentsResponse>(`/sessions/${sessionId}/consent/pending`);
    },
    enabled: !!sessionId,
    staleTime: 10_000, // Check for pending consents frequently
    ...options,
  });
}

// ============================================================================
// Decide Consent Hook
// ============================================================================

/**
 * Grant or deny a consent request.
 * POST /sessions/:id/consent/decide
 */
export function useConsentDecide(
  options?: Omit<
    UseMutationOptions<
      DecideConsentResponse,
      ApiClientError,
      {
        sessionId: string;
        consentRequestId: string;
        decision: 'GRANTED' | 'DENIED';
        editedContent?: string;
      }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, consentRequestId, decision, editedContent }) => {
      return post<DecideConsentResponse>(`/sessions/${sessionId}/consent/decide`, {
        consentRequestId,
        decision,
        editedContent,
      });
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate pending consents as one has been decided
      queryClient.invalidateQueries({ queryKey: consentKeys.pending(sessionId) });
      // Invalidate history to show the new decision
      queryClient.invalidateQueries({ queryKey: consentKeys.history(sessionId) });
      // Also invalidate stage progress as consent may affect gates
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Revoke Consent Hook
// ============================================================================

/**
 * Revoke a previously granted consent.
 * POST /sessions/:id/consent/revoke
 */
export function useConsentRevoke(
  options?: Omit<
    UseMutationOptions<
      RevokeConsentResponse,
      ApiClientError,
      {
        sessionId: string;
        consentRecordId: string;
      }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, consentRecordId }) => {
      return post<RevokeConsentResponse>(`/sessions/${sessionId}/consent/revoke`, {
        consentRecordId,
      });
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate history to reflect the revocation
      queryClient.invalidateQueries({ queryKey: consentKeys.history(sessionId) });
      // Invalidate stage progress as revocation may affect shared content visibility
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Consent History Hook
// ============================================================================

/**
 * Get consent history for the session.
 * GET /sessions/:id/consent/history
 */
export function useConsentHistory(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetConsentHistoryResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: consentKeys.history(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetConsentHistoryResponse>(`/sessions/${sessionId}/consent/history`);
    },
    enabled: !!sessionId,
    staleTime: 30_000, // History doesn't change as frequently
    ...options,
  });
}
