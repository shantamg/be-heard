/**
 * Stage Hooks for BeHeard Mobile
 *
 * React Query hooks for stage-specific API operations.
 * Covers all 5 stages: Onboarding, Witness, Perspective Stretch, Need Mapping, Strategic Repair.
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
  // Response types
  SignCompactResponse,
  CompactStatusResponse,
  ConfirmFeelHeardResponse,
  SaveEmpathyDraftResponse,
  ConsentToShareEmpathyResponse,
  GetProgressResponse,
  // DTOs
  EmpathyDraftDTO,
  GetEmpathyDraftResponse,
  GetPartnerEmpathyResponse,
  ValidateEmpathyRequest,
  ValidateEmpathyResponse,
  IdentifiedNeedDTO,
  GetNeedsResponse,
  ConfirmNeedsRequest,
  ConfirmNeedsResponse,
  GetCommonGroundResponse,
  ConfirmCommonGroundRequest,
  ConfirmCommonGroundResponse,
  AddNeedRequest,
  AddNeedResponse,
  ConsentShareNeedsRequest,
  ConsentShareNeedsResponse,
  StrategyDTO,
  GetStrategiesResponse,
  ProposeStrategyRequest,
  ProposeStrategyResponse,
  SubmitRankingRequest,
  SubmitRankingResponse,
  RevealOverlapResponse,
  MarkReadyResponse,
  AgreementDTO,
  CreateAgreementRequest,
  CreateAgreementResponse,
  ConfirmAgreementRequest,
  ConfirmAgreementResponse,
  ResolveSessionResponse,
  Stage,
} from '@be-heard/shared';
import { sessionKeys } from './useSessions';

// ============================================================================
// Query Keys
// ============================================================================

export const stageKeys = {
  all: ['stages'] as const,
  progress: (sessionId: string) => [...stageKeys.all, 'progress', sessionId] as const,

  // Stage 0: Compact
  compact: (sessionId: string) => [...stageKeys.all, 'compact', sessionId] as const,

  // Stage 2: Empathy
  empathyDraft: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'draft', sessionId] as const,
  partnerEmpathy: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'partner', sessionId] as const,

  // Stage 3: Needs
  needs: (sessionId: string) => [...stageKeys.all, 'needs', sessionId] as const,
  commonGround: (sessionId: string) =>
    [...stageKeys.all, 'commonGround', sessionId] as const,

  // Stage 4: Strategies
  strategies: (sessionId: string) =>
    [...stageKeys.all, 'strategies', sessionId] as const,
  strategiesReveal: (sessionId: string) =>
    [...stageKeys.all, 'strategies', 'reveal', sessionId] as const,
  agreements: (sessionId: string) =>
    [...stageKeys.all, 'agreements', sessionId] as const,
};

// ============================================================================
// Progress Hook
// ============================================================================

/**
 * Get session progress for both users.
 */
export function useProgress(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetProgressResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.progress(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetProgressResponse>(`/sessions/${sessionId}/progress`);
    },
    enabled: !!sessionId,
    staleTime: 10_000, // Progress can change frequently
    ...options,
  });
}

// ============================================================================
// Stage 0: Curiosity Compact
// ============================================================================

/**
 * Get compact status for both users.
 */
export function useCompactStatus(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<CompactStatusResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.compact(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<CompactStatusResponse>(`/sessions/${sessionId}/compact/status`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Sign the curiosity compact.
 */
export function useSignCompact(
  options?: Omit<
    UseMutationOptions<
      SignCompactResponse,
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<SignCompactResponse>(`/sessions/${sessionId}/compact/sign`, {
        agreed: true,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.compact(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 1: Feel Heard
// ============================================================================

/**
 * Confirm that user feels heard (gate for stage 1 completion).
 */
export function useConfirmFeelHeard(
  options?: Omit<
    UseMutationOptions<
      ConfirmFeelHeardResponse,
      ApiClientError,
      { sessionId: string; confirmed: boolean; feedback?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmed, feedback }) => {
      return post<ConfirmFeelHeardResponse>(`/sessions/${sessionId}/feel-heard`, {
        confirmed,
        feedback,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 2: Empathy / Perspective Stretch
// ============================================================================

/**
 * Get current empathy draft.
 */
export function useEmpathyDraft(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetEmpathyDraftResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.empathyDraft(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetEmpathyDraftResponse>(`/sessions/${sessionId}/empathy/draft`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Save empathy draft.
 */
export function useSaveEmpathyDraft(
  options?: Omit<
    UseMutationOptions<
      SaveEmpathyDraftResponse,
      ApiClientError,
      { sessionId: string; content: string; readyToShare?: boolean }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, content, readyToShare }) => {
      return post<SaveEmpathyDraftResponse>(
        `/sessions/${sessionId}/empathy/draft`,
        { content, readyToShare }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
    },
    ...options,
  });
}

/**
 * Consent to share empathy attempt.
 */
export function useConsentToShareEmpathy(
  options?: Omit<
    UseMutationOptions<
      ConsentToShareEmpathyResponse,
      ApiClientError,
      { sessionId: string; consent: boolean }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, consent }) => {
      return post<ConsentToShareEmpathyResponse>(
        `/sessions/${sessionId}/empathy/consent`,
        { consent }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Get partner's empathy attempt (after both consented).
 */
export function usePartnerEmpathy(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetPartnerEmpathyResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.partnerEmpathy(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetPartnerEmpathyResponse>(`/sessions/${sessionId}/empathy/partner`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Validate partner's empathy attempt.
 */
export function useValidateEmpathy(
  options?: Omit<
    UseMutationOptions<ValidateEmpathyResponse, ApiClientError, ValidateEmpathyRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ValidateEmpathyRequest) => {
      return post<ValidateEmpathyResponse>(
        `/sessions/${request.sessionId}/empathy/validate`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 3: Need Mapping
// ============================================================================

/**
 * Get AI-identified needs for the current user.
 */
export function useNeeds(
  sessionId: string | undefined,
  options?: Omit<UseQueryOptions<GetNeedsResponse, ApiClientError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: stageKeys.needs(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetNeedsResponse>(`/sessions/${sessionId}/needs`);
    },
    enabled: !!sessionId,
    staleTime: 60_000, // Needs analysis doesn't change frequently
    ...options,
  });
}

/**
 * Confirm or adjust identified needs.
 */
export function useConfirmNeeds(
  options?: Omit<
    UseMutationOptions<
      ConfirmNeedsResponse,
      ApiClientError,
      { sessionId: string; confirmations: ConfirmNeedsRequest['confirmations'] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmations }) => {
      return post<ConfirmNeedsResponse>(`/sessions/${sessionId}/needs/confirm`, {
        confirmations,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Add a custom need.
 */
export function useAddNeed(
  options?: Omit<
    UseMutationOptions<
      AddNeedResponse,
      ApiClientError,
      { sessionId: string } & AddNeedRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, need, category, description }) => {
      return post<AddNeedResponse>(`/sessions/${sessionId}/needs`, {
        need,
        category,
        description,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
    },
    ...options,
  });
}

/**
 * Consent to share needs for common ground discovery.
 */
export function useConsentShareNeeds(
  options?: Omit<
    UseMutationOptions<
      ConsentShareNeedsResponse,
      ApiClientError,
      { sessionId: string; needIds: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, needIds }) => {
      return post<ConsentShareNeedsResponse>(`/sessions/${sessionId}/needs/consent`, {
        needIds,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Get common ground (shared needs between both users).
 */
export function useCommonGround(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetCommonGroundResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.commonGround(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetCommonGroundResponse>(`/sessions/${sessionId}/common-ground`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Confirm common ground items.
 */
export function useConfirmCommonGround(
  options?: Omit<
    UseMutationOptions<
      ConfirmCommonGroundResponse,
      ApiClientError,
      { sessionId: string; confirmations: ConfirmCommonGroundRequest['confirmations'] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmations }) => {
      return post<ConfirmCommonGroundResponse>(
        `/sessions/${sessionId}/common-ground/confirm`,
        { confirmations }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 4: Strategic Repair
// ============================================================================

/**
 * Get strategies for the session.
 */
export function useStrategies(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetStrategiesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.strategies(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetStrategiesResponse>(`/sessions/${sessionId}/strategies`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Propose a new strategy.
 */
export function useProposeStrategy(
  options?: Omit<
    UseMutationOptions<
      ProposeStrategyResponse,
      ApiClientError,
      { sessionId: string } & ProposeStrategyRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      description,
      needsAddressed,
      duration,
      measureOfSuccess,
    }) => {
      return post<ProposeStrategyResponse>(`/sessions/${sessionId}/strategies`, {
        description,
        needsAddressed,
        duration,
        measureOfSuccess,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
    },
    ...options,
  });
}

/**
 * Request AI strategy suggestions.
 */
export function useRequestStrategySuggestions(
  options?: Omit<
    UseMutationOptions<
      { suggestions: StrategyDTO[]; source: 'AI_GENERATED' },
      ApiClientError,
      { sessionId: string; count?: number; focusNeeds?: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, count, focusNeeds }) => {
      return post<{ suggestions: StrategyDTO[]; source: 'AI_GENERATED' }>(
        `/sessions/${sessionId}/strategies/suggestions`,
        { count, focusNeeds }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
    },
    ...options,
  });
}

/**
 * Mark ready to rank strategies.
 */
export function useMarkReadyToRank(
  options?: Omit<
    UseMutationOptions<MarkReadyResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<MarkReadyResponse>(`/sessions/${sessionId}/strategies/ready`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Submit strategy rankings.
 */
export function useSubmitRankings(
  options?: Omit<
    UseMutationOptions<
      SubmitRankingResponse,
      ApiClientError,
      { sessionId: string; rankedIds: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, rankedIds }) => {
      return post<SubmitRankingResponse>(`/sessions/${sessionId}/strategies/rank`, {
        rankedIds,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
      queryClient.invalidateQueries({
        queryKey: stageKeys.strategiesReveal(sessionId),
      });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Get strategy reveal (overlap after both ranked).
 */
export function useStrategiesReveal(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<RevealOverlapResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.strategiesReveal(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<RevealOverlapResponse>(`/sessions/${sessionId}/strategies/overlap`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Agreements
// ============================================================================

/**
 * Get agreements for the session.
 */
export function useAgreements(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ agreements: AgreementDTO[] }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.agreements(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<{ agreements: AgreementDTO[] }>(`/sessions/${sessionId}/agreements`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Create an agreement.
 */
export function useCreateAgreement(
  options?: Omit<
    UseMutationOptions<
      CreateAgreementResponse,
      ApiClientError,
      { sessionId: string } & CreateAgreementRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, ...request }) => {
      return post<CreateAgreementResponse>(
        `/sessions/${sessionId}/agreements`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
    },
    ...options,
  });
}

/**
 * Confirm an agreement.
 */
export function useConfirmAgreement(
  options?: Omit<
    UseMutationOptions<
      ConfirmAgreementResponse,
      ApiClientError,
      { sessionId: string; agreementId: string; confirmed: boolean; modification?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, agreementId, confirmed, modification }) => {
      return post<ConfirmAgreementResponse>(
        `/sessions/${sessionId}/agreements/${agreementId}/confirm`,
        { confirmed, modification }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

/**
 * Resolve the session (complete Stage 4).
 */
export function useResolveSession(
  options?: Omit<
    UseMutationOptions<ResolveSessionResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<ResolveSessionResponse>(`/sessions/${sessionId}/resolve`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}
