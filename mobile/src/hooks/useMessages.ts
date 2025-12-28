/**
 * Message Hooks for BeHeard Mobile
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
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesResponse,
  EmotionalReadingDTO,
  RecordEmotionalReadingRequest,
  RecordEmotionalReadingResponse,
  GetEmotionalHistoryResponse,
  EmotionalSupportType,
  CompleteExerciseRequest,
  CompleteExerciseResponse,
  Stage,
} from '@be-heard/shared';
import { sessionKeys } from './useSessions';

// ============================================================================
// Query Keys
// ============================================================================

export const messageKeys = {
  all: ['messages'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (sessionId: string, stage?: Stage) =>
    [...messageKeys.lists(), sessionId, stage] as const,
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

/**
 * Fetch messages with infinite scroll pagination.
 */
export function useInfiniteMessages(
  params: Omit<GetMessagesParams, 'cursor'>,
  options?: Omit<
    UseInfiniteQueryOptions<GetMessagesResponse, ApiClientError>,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  const { sessionId, stage, limit } = params;

  return useInfiniteQuery({
    queryKey: messageKeys.list(sessionId, stage),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      if (limit) queryParams.set('limit', limit.toString());
      if (pageParam) queryParams.set('cursor', pageParam as string);

      const queryString = queryParams.toString();
      const url = queryString
        ? `/sessions/${sessionId}/messages?${queryString}`
        : `/sessions/${sessionId}/messages`;

      return get<GetMessagesResponse>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.cursor : undefined,
    enabled: !!sessionId,
    staleTime: 10_000,
    ...options,
  });
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
      // Optimistically add messages to cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        (old) => {
          if (!old) {
            return {
              messages: [data.userMessage, data.aiResponse],
              hasMore: false,
            };
          }
          return {
            ...old,
            messages: [...old.messages, data.userMessage, data.aiResponse],
          };
        }
      );

      // Invalidate to get fresh data
      queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId) });

      // Session might have progressed - invalidate session detail
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
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
      const optimisticMessage: MessageDTO = {
        id: `optimistic-${Date.now()}`,
        sessionId,
        senderId: null,
        role: MessageRole.USER,
        content: message.content || '',
        stage: message.stage || Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
        ...message,
      };

      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        (old) => {
          if (!old) {
            return { messages: [optimisticMessage], hasMore: false };
          }
          return {
            ...old,
            messages: [...old.messages, optimisticMessage],
          };
        }
      );

      return optimisticMessage.id;
    },

    removeOptimisticMessage: (sessionId: string, optimisticId: string) => {
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.filter((m) => m.id !== optimisticId),
          };
        }
      );
    },
  };
}
