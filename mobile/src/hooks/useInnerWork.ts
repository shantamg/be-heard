/**
 * Inner Work Session Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for inner work (solo self-reflection) session operations.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, patch, del } from '../lib/api';
import { ApiClientError } from '../lib/api';
import {
  InnerWorkSessionSummaryDTO,
  InnerWorkSessionDetailDTO,
  InnerWorkMessageDTO,
  CreateInnerWorkSessionRequest,
  CreateInnerWorkSessionResponse,
  ListInnerWorkSessionsResponse,
  GetInnerWorkSessionResponse,
  SendInnerWorkMessageRequest,
  SendInnerWorkMessageResponse,
  UpdateInnerWorkSessionRequest,
  UpdateInnerWorkSessionResponse,
  ArchiveInnerWorkSessionResponse,
  InnerWorkStatus,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const innerWorkKeys = {
  all: ['innerWork'] as const,
  lists: () => [...innerWorkKeys.all, 'list'] as const,
  list: (filters?: { status?: InnerWorkStatus }) =>
    [...innerWorkKeys.lists(), filters] as const,
  details: () => [...innerWorkKeys.all, 'detail'] as const,
  detail: (id: string) => [...innerWorkKeys.details(), id] as const,
};

// ============================================================================
// List Inner Work Sessions Hook
// ============================================================================

export interface ListInnerWorkParams {
  status?: InnerWorkStatus;
  limit?: number;
  offset?: number;
}

/**
 * Fetch a list of inner work sessions.
 */
export function useInnerWorkSessions(
  params: ListInnerWorkParams = {},
  options?: Omit<
    UseQueryOptions<ListInnerWorkSessionsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerWorkKeys.list({ status: params.status }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.offset) queryParams.set('offset', params.offset.toString());

      const queryString = queryParams.toString();
      const url = queryString ? `/inner-work?${queryString}` : '/inner-work';
      return get<ListInnerWorkSessionsResponse>(url);
    },
    staleTime: 5_000, // 5 seconds - short to catch async metadata updates
    ...options,
  });
}

// ============================================================================
// Get Inner Work Session Hook
// ============================================================================

/**
 * Fetch a single inner work session with messages.
 */
export function useInnerWorkSession(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetInnerWorkSessionResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerWorkKeys.detail(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetInnerWorkSessionResponse>(`/inner-work/${sessionId}`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Create Inner Work Session Hook
// ============================================================================

/**
 * Create a new inner work session.
 */
export function useCreateInnerWorkSession(
  options?: Omit<
    UseMutationOptions<
      CreateInnerWorkSessionResponse,
      ApiClientError,
      CreateInnerWorkSessionRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateInnerWorkSessionRequest) => {
      return post<CreateInnerWorkSessionResponse, CreateInnerWorkSessionRequest>(
        '/inner-work',
        request
      );
    },
    onSuccess: (data) => {
      // Invalidate session list to show new session
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.lists() });

      // Pre-populate the cache with the new session detail
      queryClient.setQueryData(innerWorkKeys.detail(data.session.id), {
        session: {
          ...data.session,
          messages: [data.initialMessage],
        },
      });
    },
    ...options,
  });
}

// ============================================================================
// Send Inner Work Message Hook
// ============================================================================

/**
 * Send a message in an inner work session and get AI response.
 */
export function useSendInnerWorkMessage(
  sessionId: string,
  options?: Omit<
    UseMutationOptions<
      SendInnerWorkMessageResponse,
      ApiClientError,
      SendInnerWorkMessageRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SendInnerWorkMessageRequest) => {
      return post<SendInnerWorkMessageResponse, SendInnerWorkMessageRequest>(
        `/inner-work/${sessionId}/messages`,
        request
      );
    },
    onSuccess: (data) => {
      // Update the session detail cache with new messages
      queryClient.setQueryData<GetInnerWorkSessionResponse>(
        innerWorkKeys.detail(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              messages: [
                ...old.session.messages,
                data.userMessage,
                data.aiMessage,
              ],
              messageCount: old.session.messageCount + 2,
              updatedAt: data.aiMessage.timestamp,
            },
          };
        }
      );

      // Invalidate session list immediately for timestamp updates
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.lists() });

      // Invalidate again after a delay to catch the async metadata update (title/summary)
      // Haiku typically completes in ~1-2 seconds
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: innerWorkKeys.lists() });
      }, 2500);
    },
    ...options,
  });
}

// ============================================================================
// Update Inner Work Session Hook
// ============================================================================

/**
 * Update an inner work session (title, status).
 */
export function useUpdateInnerWorkSession(
  sessionId: string,
  options?: Omit<
    UseMutationOptions<
      UpdateInnerWorkSessionResponse,
      ApiClientError,
      UpdateInnerWorkSessionRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateInnerWorkSessionRequest) => {
      return patch<UpdateInnerWorkSessionResponse, UpdateInnerWorkSessionRequest>(
        `/inner-work/${sessionId}`,
        request
      );
    },
    onSuccess: (data) => {
      // Update session detail cache
      queryClient.setQueryData<GetInnerWorkSessionResponse>(
        innerWorkKeys.detail(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              ...data.session,
            },
          };
        }
      );

      // Invalidate session list
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.lists() });
    },
    ...options,
  });
}

// ============================================================================
// Archive Inner Work Session Hook
// ============================================================================

/**
 * Archive an inner work session.
 */
export function useArchiveInnerWorkSession(
  options?: Omit<
    UseMutationOptions<
      ArchiveInnerWorkSessionResponse,
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return del<ArchiveInnerWorkSessionResponse>(`/inner-work/${sessionId}`);
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate session lists
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.lists() });
      // Invalidate the specific session detail
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.detail(sessionId) });
    },
    ...options,
  });
}
