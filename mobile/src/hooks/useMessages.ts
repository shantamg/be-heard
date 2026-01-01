/**
 * Message Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for chat messages and emotional barometer.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  useInfiniteQuery,
  InfiniteData,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesResponse,
  RecordEmotionalReadingRequest,
  RecordEmotionalReadingResponse,
  GetEmotionalHistoryResponse,
  CompleteExerciseRequest,
  CompleteExerciseResponse,
  Stage,
} from '@meet-without-fear/shared';
import { sessionKeys } from './useSessions';
import { stageKeys } from './useStages';

// ============================================================================
// Query Keys
// ============================================================================

export const messageKeys = {
  all: ['messages'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (sessionId: string, stage?: Stage) =>
    [...messageKeys.lists(), sessionId, stage] as const,
  // Separate key for infinite queries to avoid cache structure conflicts
  infinite: (sessionId: string, stage?: Stage) =>
    [...messageKeys.all, 'infinite', sessionId, stage] as const,
  emotions: () => [...messageKeys.all, 'emotions'] as const,
  emotionHistory: (sessionId: string, stage?: Stage) =>
    [...messageKeys.emotions(), sessionId, stage] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface GetMessagesParams {
  sessionId: string;
  stage?: Stage;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// Get Messages Hook
// ============================================================================

/**
 * Fetch messages for a session with optional stage filter.
 *
 * @param params - Query parameters
 * @param options - React Query options
 */
export function useMessages(
  params: GetMessagesParams,
  options?: Omit<
    UseQueryOptions<GetMessagesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const { sessionId, stage, limit, cursor } = params;

  return useQuery({
    queryKey: messageKeys.list(sessionId, stage),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      if (limit) queryParams.set('limit', limit.toString());
      if (cursor) queryParams.set('cursor', cursor);

      const queryString = queryParams.toString();
      const url = queryString
        ? `/sessions/${sessionId}/messages?${queryString}`
        : `/sessions/${sessionId}/messages`;

      return get<GetMessagesResponse>(url);
    },
    enabled: !!sessionId,
    staleTime: 10_000, // 10 seconds - messages update frequently
    ...options,
  });
}

/** Options for useInfiniteMessages hook */
export interface UseInfiniteMessagesOptions {
  enabled?: boolean;
}

/** Return type for useInfiniteMessages hook */
export interface UseInfiniteMessagesResult {
  data: InfiniteData<GetMessagesResponse> | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch: () => void;
}

/**
 * Fetch messages with infinite scroll pagination.
 * Initial load gets newest messages (order: desc, reversed on server).
 * Loading more fetches older messages using 'before' cursor.
 */
export function useInfiniteMessages(
  params: Omit<GetMessagesParams, 'cursor'>,
  options?: UseInfiniteMessagesOptions
): UseInfiniteMessagesResult {
  const { sessionId, stage, limit = 25 } = params;

  const result = useInfiniteQuery({
    queryKey: messageKeys.infinite(sessionId, stage),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      queryParams.set('limit', limit.toString());

      // First page: get newest messages (default order is 'desc')
      // Subsequent pages: get older messages using 'before' cursor with 'asc' order
      if (pageParam) {
        queryParams.set('before', pageParam as string);
        queryParams.set('order', 'asc');
      }

      const url = `/sessions/${sessionId}/messages?${queryParams.toString()}`;
      return get<GetMessagesResponse>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
      // Return the oldest message's timestamp as the cursor for the next page
      return lastPage.messages[0]?.timestamp;
    },
    enabled: options?.enabled ?? !!sessionId,
    staleTime: 10_000,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    refetch: result.refetch,
  };
}

// ============================================================================
// Send Message Hook
// ============================================================================

export interface SendMessageParams {
  sessionId: string;
  content: string;
  emotionalIntensity?: number;
  emotionalContext?: string;
}

/**
 * Send a message in a session.
 * Returns both the user message and AI response.
 */
export function useSendMessage(
  options?: Omit<
    UseMutationOptions<SendMessageResponse, ApiClientError, SendMessageParams>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      content,
      emotionalIntensity,
      emotionalContext,
    }: SendMessageParams) => {
      const request: SendMessageRequest = {
        sessionId,
        content,
        emotionalIntensity,
        emotionalContext,
      };
      return post<SendMessageResponse, SendMessageRequest>(
        `/sessions/${sessionId}/messages`,
        request
      );
    },
    onSuccess: (data, { sessionId }) => {
      // Get the stage from the response to update the correct cache
      const stage = data.userMessage.stage;

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return {
            messages: [data.userMessage, data.aiResponse],
            hasMore: false,
          };
        }
        // Filter out optimistic messages (they start with 'optimistic-')
        // and add the real messages from the API response
        const existingMessages = (old.messages || []).filter(
          (m) => !m.id.startsWith('optimistic-')
        );
        return {
          ...old,
          messages: [...existingMessages, data.userMessage, data.aiResponse],
        };
      };

      // Update infinite query cache (used by useUnifiedSession)
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) return old;
        // Update the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        const existingMessages = (firstPage.messages || []).filter(
          (m) => !m.id.startsWith('optimistic-')
        );
        updatedPages[0] = {
          ...firstPage,
          messages: [...existingMessages, data.userMessage, data.aiResponse],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache (what witness screen uses)
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );

      // Update infinite query caches
      if (stage !== undefined) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      // Invalidate to get fresh data
      if (stage !== undefined) {
        queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId, stage) });
        queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId, stage) });
      }
      queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });

      // Session might have progressed - invalidate session detail and progress
      // Progress invalidation is critical: when user sends first message at Stage 0,
      // backend auto-advances to Stage 1. Without this, useMessages would keep
      // querying for Stage 0 messages while new messages are saved at Stage 1.
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });

      // Invitation message might have been updated during invitation phase
      // This ensures the share button appears immediately when AI proposes a message
      queryClient.invalidateQueries({ queryKey: sessionKeys.sessionInvitation(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Emotional Barometer Hooks
// ============================================================================

/**
 * Get emotional reading history for a session.
 */
export function useEmotionalHistory(
  params: { sessionId: string; stage?: Stage; limit?: number },
  options?: Omit<
    UseQueryOptions<GetEmotionalHistoryResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const { sessionId, stage, limit } = params;

  return useQuery({
    queryKey: messageKeys.emotionHistory(sessionId, stage),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      if (limit) queryParams.set('limit', limit.toString());

      const queryString = queryParams.toString();
      const url = queryString
        ? `/sessions/${sessionId}/emotions?${queryString}`
        : `/sessions/${sessionId}/emotions`;

      return get<GetEmotionalHistoryResponse>(url);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Record an emotional reading.
 */
export function useRecordEmotion(
  options?: Omit<
    UseMutationOptions<
      RecordEmotionalReadingResponse,
      ApiClientError,
      RecordEmotionalReadingRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: RecordEmotionalReadingRequest) => {
      return post<RecordEmotionalReadingResponse, RecordEmotionalReadingRequest>(
        `/sessions/${request.sessionId}/emotions`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.emotionHistory(sessionId),
      });
    },
    ...options,
  });
}

/**
 * Complete an emotional support exercise (breathing, body scan, etc.).
 */
export function useCompleteExercise(
  options?: Omit<
    UseMutationOptions<CompleteExerciseResponse, ApiClientError, CompleteExerciseRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CompleteExerciseRequest) => {
      return post<CompleteExerciseResponse, CompleteExerciseRequest>(
        `/sessions/${request.sessionId}/exercises/complete`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.emotionHistory(sessionId),
      });
    },
    ...options,
  });
}

// ============================================================================
// Optimistic Update Helpers
// ============================================================================

/**
 * Add a message optimistically before the API call completes.
 * Used for immediate UI feedback.
 */
export function useOptimisticMessage() {
  const queryClient = useQueryClient();

  return {
    addOptimisticMessage: (sessionId: string, message: Partial<MessageDTO>) => {
      const stage = message.stage;
      const optimisticMessage: MessageDTO = {
        id: `optimistic-${Date.now()}`,
        sessionId,
        senderId: null,
        role: MessageRole.USER,
        content: message.content || '',
        stage: stage || Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
        ...message,
      };

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [optimisticMessage], hasMore: false };
        }
        return {
          ...old,
          messages: [...(old.messages || []), optimisticMessage],
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          // Create initial structure for infinite query
          return {
            pages: [{ messages: [optimisticMessage], hasMore: false }],
            pageParams: [undefined],
          };
        }
        // Update the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        updatedPages[0] = {
          ...firstPage,
          messages: [...(firstPage.messages || []), optimisticMessage],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache (what witness screen uses)
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      return optimisticMessage.id;
    },

    removeOptimisticMessage: (sessionId: string, optimisticId: string, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          messages: (old.messages || []).filter((m) => m.id !== optimisticId),
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) return old;
        const updatedPages = old.pages.map((page) => ({
          ...page,
          messages: (page.messages || []).filter((m) => m.id !== optimisticId),
        }));
        return { ...old, pages: updatedPages };
      };

      // Remove from stage-specific cache
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Remove from non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );
    },
  };
}

// ============================================================================
// Initial Message Hook
// ============================================================================

interface InitialMessageResponse {
  message: MessageDTO;
}

/**
 * Fetch AI-generated initial message for a session.
 * Called when starting a new session that has no messages yet.
 */
export function useFetchInitialMessage(
  options?: Omit<
    UseMutationOptions<InitialMessageResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      return post<InitialMessageResponse, Record<string, never>>(
        `/sessions/${sessionId}/messages/initial`,
        {}
      );
    },
    onSuccess: (data, { sessionId }) => {
      const stage = data.message.stage;

      // Add the AI message to the cache
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [data.message], hasMore: false };
        }
        return {
          ...old,
          messages: [...(old.messages || []), data.message],
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [data.message], hasMore: false }],
            pageParams: [undefined],
          };
        }
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        updatedPages[0] = {
          ...firstPage,
          messages: [data.message, ...(firstPage.messages || [])],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );
    },
    ...options,
  });
}
