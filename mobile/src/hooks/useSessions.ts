/**
 * Session Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for session-related API operations.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { get, post, put, ApiClientError } from '../lib/api';
import {
  SessionSummaryDTO,
  SessionDetailDTO,
  CreateSessionRequest,
  CreateSessionResponse,
  SessionStatus,
  PaginatedResponse,
  AcceptInvitationResponse,
  DeclineInvitationResponse,
  InvitationDTO,
  Stage,
} from '@meet-without-fear/shared';
import { stageKeys } from './useStages';
import { messageKeys } from './useMessages';

// ============================================================================
// Query Keys
// ============================================================================

export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (filters: { status?: SessionStatus }) =>
    [...sessionKeys.lists(), filters] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  invitations: () => ['invitations'] as const,
  invitation: (id: string) => [...sessionKeys.invitations(), id] as const,
  sessionInvitation: (sessionId: string) =>
    [...sessionKeys.all, sessionId, 'invitation'] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface ListSessionsParams {
  status?: SessionStatus;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// List Sessions Hook
// ============================================================================

/**
 * Fetch a paginated list of sessions.
 *
 * @param params - Query parameters for filtering and pagination
 * @param options - React Query options
 */
export function useSessions(
  params: ListSessionsParams = {},
  options?: Omit<
    UseQueryOptions<PaginatedResponse<SessionSummaryDTO>, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.list({ status: params.status }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.cursor) queryParams.set('cursor', params.cursor);

      const queryString = queryParams.toString();
      const url = queryString ? `/sessions?${queryString}` : '/sessions';
      return get<PaginatedResponse<SessionSummaryDTO>>(url);
    },
    staleTime: 30_000, // 30 seconds
    ...options,
  });
}

/**
 * Fetch sessions with infinite scroll pagination.
 */
export function useInfiniteSessions(
  params: Omit<ListSessionsParams, 'cursor'> = {},
  options?: Omit<
    UseInfiniteQueryOptions<PaginatedResponse<SessionSummaryDTO>, ApiClientError>,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  return useInfiniteQuery({
    queryKey: sessionKeys.list({ status: params.status }),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (pageParam) queryParams.set('cursor', pageParam as string);

      const queryString = queryParams.toString();
      const url = queryString ? `/sessions?${queryString}` : '/sessions';
      return get<PaginatedResponse<SessionSummaryDTO>>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.cursor : undefined,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Get Session Detail Hook
// ============================================================================

/**
 * Fetch a single session by ID with full details.
 *
 * @param sessionId - The session ID to fetch
 * @param options - React Query options
 */
export function useSession(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ session: SessionDetailDTO }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<{ session: SessionDetailDTO }>(`/sessions/${sessionId}`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Create Session Hook
// ============================================================================

/**
 * Create a new session and send invitation.
 */
export function useCreateSession(
  options?: Omit<
    UseMutationOptions<CreateSessionResponse, ApiClientError, CreateSessionRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateSessionRequest) => {
      return post<CreateSessionResponse, CreateSessionRequest>('/sessions', request);
    },
    onSuccess: (data) => {
      // Invalidate session list to show new session
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });

      // Pre-populate the cache with the new session
      queryClient.setQueryData(sessionKeys.detail(data.session.id), {
        session: data.session,
      });
    },
    ...options,
  });
}

// ============================================================================
// Pause Session Hook
// ============================================================================

/**
 * Pause an active session.
 */
export function usePauseSession(
  options?: Omit<
    UseMutationOptions<
      { paused: boolean; pausedAt: string },
      ApiClientError,
      { sessionId: string; reason?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, reason }) => {
      return post<{ paused: boolean; pausedAt: string }, { reason?: string }>(
        `/sessions/${sessionId}/pause`,
        { reason }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
    ...options,
  });
}

// ============================================================================
// Resume Session Hook
// ============================================================================

/**
 * Resume a paused session.
 */
export function useResumeSession(
  options?: Omit<
    UseMutationOptions<{ resumed: boolean; resumedAt: string }, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<{ resumed: boolean; resumedAt: string }>(`/sessions/${sessionId}/resume`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
    ...options,
  });
}

// ============================================================================
// Invitation Hooks
// ============================================================================

/**
 * Get invitation details by ID.
 */
export function useInvitation(
  invitationId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ invitation: InvitationDTO }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.invitation(invitationId || ''),
    queryFn: async () => {
      if (!invitationId) throw new Error('Invitation ID is required');
      return get<{ invitation: InvitationDTO }>(`/invitations/${invitationId}`);
    },
    enabled: !!invitationId,
    ...options,
  });
}

/**
 * Accept a session invitation.
 */
export function useAcceptInvitation(
  options?: Omit<
    UseMutationOptions<AcceptInvitationResponse, ApiClientError, { invitationId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId }) => {
      return post<AcceptInvitationResponse>(`/invitations/${invitationId}/accept`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.invitations() });

      // Pre-populate session cache
      queryClient.setQueryData(sessionKeys.detail(data.session.id), {
        session: data.session,
      });
    },
    ...options,
  });
}

/**
 * Decline a session invitation.
 */
export function useDeclineInvitation(
  options?: Omit<
    UseMutationOptions<
      DeclineInvitationResponse,
      ApiClientError,
      { invitationId: string; reason?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId, reason }) => {
      return post<DeclineInvitationResponse>(`/invitations/${invitationId}/decline`, {
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.invitations() });
    },
    ...options,
  });
}

/**
 * Resend a session invitation.
 */
export function useResendInvitation(
  options?: Omit<
    UseMutationOptions<
      { sent: boolean; sentAt: string; expiresAt: string },
      ApiClientError,
      { invitationId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId }) => {
      return post<{ sent: boolean; sentAt: string; expiresAt: string }>(
        `/invitations/${invitationId}/resend`
      );
    },
    onSuccess: (_, { invitationId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.invitation(invitationId),
      });
    },
    ...options,
  });
}

// ============================================================================
// Session Invitation Message Hooks
// ============================================================================

interface SessionInvitationResponse {
  invitation: {
    id: string;
    name: string | null;
    invitationMessage: string | null;
    messageConfirmed: boolean;
    status: string;
    expiresAt: string;
  };
}

/**
 * Get invitation details for a session.
 */
export function useSessionInvitation(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<SessionInvitationResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.sessionInvitation(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<SessionInvitationResponse>(`/sessions/${sessionId}/invitation`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Update the invitation message for a session.
 */
export function useUpdateInvitationMessage(
  options?: Omit<
    UseMutationOptions<
      { invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean } },
      ApiClientError,
      { sessionId: string; message: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, message }) => {
      return put<{ invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean } }>(
        `/sessions/${sessionId}/invitation/message`,
        { message }
      );
    },
    onSuccess: (data, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.sessionInvitation(sessionId),
      });
    },
    ...options,
  });
}

/**
 * Confirm the invitation message for a session.
 */
export function useConfirmInvitationMessage(
  options?: Omit<
    UseMutationOptions<
      {
        confirmed: boolean;
        invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean };
      },
      ApiClientError,
      { sessionId: string; message?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, message }) => {
      return post<{
        confirmed: boolean;
        invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean };
        advancedToStage?: number;
        transitionMessage?: { id: string; content: string; timestamp: string };
      }>(`/sessions/${sessionId}/invitation/confirm`, { message });
    },
    onSuccess: (data, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.sessionInvitation(sessionId),
      });
      // Also invalidate session detail to reflect the status change
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(sessionId),
      });
      // Invalidate stage progress since backend advances to Stage 1
      queryClient.invalidateQueries({
        queryKey: stageKeys.progress(sessionId),
      });
      // Invalidate ALL messages queries for this session (both with and without stage filter)
      // This ensures the transition message appears when stage 1 loads
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === 'messages' &&
            key[1] === 'list' &&
            key[2] === sessionId
          );
        },
      });

      // If we received a transition message, add it to the messages cache
      if (data.transitionMessage && data.advancedToStage === Stage.WITNESS) {
        const transitionMsg = {
          id: data.transitionMessage.id,
          sessionId,
          senderId: null,
          role: 'AI' as const,
          content: data.transitionMessage.content,
          stage: Stage.WITNESS,
          timestamp: data.transitionMessage.timestamp,
        };

        // Add to the non-stage-filtered message cache (what we use now)
        queryClient.setQueryData<{ messages: typeof transitionMsg[]; hasMore: boolean }>(
          messageKeys.list(sessionId),
          (old) => {
            if (!old) return { messages: [transitionMsg], hasMore: false };
            // Append the transition message if not already present
            const exists = old.messages.some(m => m.id === transitionMsg.id);
            if (exists) return old;
            return { ...old, messages: [...old.messages, transitionMsg] };
          }
        );
      }
    },
    ...options,
  });
}
