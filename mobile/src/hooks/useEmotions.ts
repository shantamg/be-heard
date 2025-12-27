/**
 * Legacy Emotions Hook
 *
 * This hook provides a simplified interface for emotion recording.
 * For full functionality, prefer using the hooks from useMessages.ts:
 * - useEmotionalHistory
 * - useRecordEmotion
 * - useCompleteExercise
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { get, post, ApiClientError } from '../lib/api';
import {
  RecordEmotionalReadingRequest,
  RecordEmotionalReadingResponse,
  GetEmotionalHistoryResponse,
  CompleteExerciseRequest as SharedCompleteExerciseRequest,
  CompleteExerciseResponse as SharedCompleteExerciseResponse,
  EmotionalReadingDTO,
  EmotionalSupportType,
} from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Emotion check-in record
 */
export interface EmotionRecord {
  id: string;
  sessionId: string;
  intensity: number;
  context?: string;
  createdAt: string;
}

/**
 * Exercise completion record
 */
export interface ExerciseRecord {
  id: string;
  sessionId: string;
  exerciseType: 'breathing' | 'grounding' | 'other';
  intensityBefore: number;
  intensityAfter: number;
  durationSeconds: number;
  completedAt: string;
}

/**
 * Input for recording an emotion
 */
export interface RecordEmotionInput {
  sessionId: string;
  intensity: number;
  context?: string;
}

/**
 * Input for completing an exercise
 */
export interface CompleteExerciseInput {
  sessionId: string;
  exerciseType: 'breathing' | 'grounding' | 'other';
  intensityBefore: number;
  intensityAfter: number;
  durationSeconds: number;
}

// ============================================================================
// Query Keys
// ============================================================================

const EMOTION_QUERY_KEYS = {
  all: ['emotions'] as const,
  bySession: (sessionId: string) => ['emotions', 'session', sessionId] as const,
  exercises: ['exercises'] as const,
  exercisesBySession: (sessionId: string) =>
    ['exercises', 'session', sessionId] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchEmotions(sessionId: string): Promise<EmotionRecord[]> {
  const response = await get<GetEmotionalHistoryResponse>(
    `/sessions/${sessionId}/emotions`
  );
  return response.readings.map((reading) => ({
    id: reading.id,
    sessionId,
    intensity: reading.intensity,
    context: reading.context ?? undefined,
    createdAt: reading.timestamp,
  }));
}

async function recordEmotionApi(
  input: RecordEmotionInput
): Promise<EmotionRecord> {
  const request: RecordEmotionalReadingRequest = {
    sessionId: input.sessionId,
    intensity: input.intensity,
    context: input.context,
  };
  const response = await post<RecordEmotionalReadingResponse>(
    `/sessions/${input.sessionId}/emotions`,
    request
  );
  return {
    id: response.reading.id,
    sessionId: input.sessionId,
    intensity: response.reading.intensity,
    context: response.reading.context ?? undefined,
    createdAt: response.reading.timestamp,
  };
}

async function fetchExercises(sessionId: string): Promise<ExerciseRecord[]> {
  // Note: This endpoint may not exist yet - adjust when available
  try {
    const response = await get<{ exercises: ExerciseRecord[] }>(
      `/sessions/${sessionId}/exercises`
    );
    return response.exercises;
  } catch (error) {
    // Return empty array if endpoint not available
    console.warn('Exercises endpoint not available:', error);
    return [];
  }
}

async function completeExerciseApi(
  input: CompleteExerciseInput
): Promise<ExerciseRecord> {
  // Map local exercise type to shared EmotionalSupportType
  const exerciseTypeMap: Record<CompleteExerciseInput['exerciseType'], EmotionalSupportType> = {
    breathing: EmotionalSupportType.BREATHING_EXERCISE,
    grounding: EmotionalSupportType.GROUNDING,
    other: EmotionalSupportType.BODY_SCAN, // Map 'other' to body scan
  };

  const request: SharedCompleteExerciseRequest = {
    sessionId: input.sessionId,
    exerciseType: exerciseTypeMap[input.exerciseType],
    completed: true,
    intensityBefore: input.intensityBefore,
    intensityAfter: input.intensityAfter,
  };

  const response = await post<SharedCompleteExerciseResponse>(
    `/sessions/${input.sessionId}/exercises`,
    request
  );

  // Generate an ID and timestamp since the shared response doesn't include them
  return {
    id: `exercise-${Date.now()}`,
    sessionId: input.sessionId,
    exerciseType: input.exerciseType,
    intensityBefore: input.intensityBefore,
    intensityAfter: input.intensityAfter,
    durationSeconds: input.durationSeconds,
    completedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing emotion check-ins and regulation exercises
 *
 * Provides queries and mutations for:
 * - Recording emotion intensity levels
 * - Fetching emotion history for a session
 * - Completing regulation exercises
 * - Fetching exercise history for a session
 *
 * @deprecated Prefer using individual hooks from useMessages.ts:
 * - useEmotionalHistory
 * - useRecordEmotion
 * - useCompleteExercise
 */
export function useEmotions(sessionId?: string) {
  const queryClient = useQueryClient();

  // Query for fetching emotions by session
  const emotionsQuery = useQuery({
    queryKey: EMOTION_QUERY_KEYS.bySession(sessionId || ''),
    queryFn: () => fetchEmotions(sessionId!),
    enabled: !!sessionId,
    staleTime: 30000, // 30 seconds
  });

  // Query for fetching exercises by session
  const exercisesQuery = useQuery({
    queryKey: EMOTION_QUERY_KEYS.exercisesBySession(sessionId || ''),
    queryFn: () => fetchExercises(sessionId!),
    enabled: !!sessionId,
    staleTime: 30000, // 30 seconds
  });

  // Mutation for recording an emotion
  const recordEmotionMutation = useMutation({
    mutationFn: recordEmotionApi,
    onSuccess: (newEmotion) => {
      // Invalidate and refetch emotions for this session
      queryClient.invalidateQueries({
        queryKey: EMOTION_QUERY_KEYS.bySession(newEmotion.sessionId),
      });
    },
  });

  // Mutation for completing an exercise
  const completeExerciseMutation = useMutation({
    mutationFn: completeExerciseApi,
    onSuccess: (newExercise) => {
      // Invalidate and refetch exercises for this session
      queryClient.invalidateQueries({
        queryKey: EMOTION_QUERY_KEYS.exercisesBySession(newExercise.sessionId),
      });
    },
  });

  /**
   * Record an emotion check-in
   */
  const recordEmotion = useCallback(
    async (intensity: number, context?: string) => {
      if (!sessionId) {
        throw new Error('Session ID is required to record emotion');
      }
      return recordEmotionMutation.mutateAsync({
        sessionId,
        intensity,
        context,
      });
    },
    [sessionId, recordEmotionMutation]
  );

  /**
   * Complete a regulation exercise
   */
  const completeExercise = useCallback(
    async (
      exerciseType: CompleteExerciseInput['exerciseType'],
      intensityBefore: number,
      intensityAfter: number,
      durationSeconds: number
    ) => {
      if (!sessionId) {
        throw new Error('Session ID is required to complete exercise');
      }
      return completeExerciseMutation.mutateAsync({
        sessionId,
        exerciseType,
        intensityBefore,
        intensityAfter,
        durationSeconds,
      });
    },
    [sessionId, completeExerciseMutation]
  );

  return {
    // Emotion data
    emotions: emotionsQuery.data || [],
    isLoadingEmotions: emotionsQuery.isLoading,
    emotionsError: emotionsQuery.error,

    // Exercise data
    exercises: exercisesQuery.data || [],
    isLoadingExercises: exercisesQuery.isLoading,
    exercisesError: exercisesQuery.error,

    // Mutations
    recordEmotion,
    isRecordingEmotion: recordEmotionMutation.isPending,
    recordEmotionError: recordEmotionMutation.error,

    completeExercise,
    isCompletingExercise: completeExerciseMutation.isPending,
    completeExerciseError: completeExerciseMutation.error,

    // Refetch functions
    refetchEmotions: emotionsQuery.refetch,
    refetchExercises: exercisesQuery.refetch,
  };
}

export default useEmotions;
