/**
 * useMessages Hook Tests
 *
 * Tests for message-related API hooks including fetching, sending, and emotional barometer.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useMessages,
  useSendMessage,
  useEmotionalHistory,
  useRecordEmotion,
  useCompleteExercise,
  useOptimisticMessage,
  messageKeys,
} from '../useMessages';
import { MessageRole, Stage, EmotionalSupportType } from '@be-heard/shared';

// Mock the API module
jest.mock('../../lib/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(error: { code: string; message: string }, status: number) {
      super(error.message);
      this.code = error.code;
      this.status = status;
    }
  },
}));

// Import mocked functions
import * as api from '../../lib/api';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Sample message data
const mockMessage = {
  id: 'msg-123',
  sessionId: 'session-123',
  senderId: 'user-123',
  role: MessageRole.USER,
  content: 'Test message content',
  stage: Stage.ONBOARDING,
  timestamp: '2024-01-01T00:00:00.000Z',
};

const mockAiMessage = {
  id: 'msg-124',
  sessionId: 'session-123',
  senderId: null,
  role: MessageRole.AI,
  content: 'AI response',
  stage: Stage.ONBOARDING,
  timestamp: '2024-01-01T00:00:01.000Z',
};

const mockEmotionalReading = {
  id: 'emotion-123',
  sessionId: 'session-123',
  userId: 'user-123',
  intensity: 7,
  context: 'Feeling anxious',
  stage: Stage.ONBOARDING,
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('useMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useMessages hook', () => {
    it('fetches messages for a session', async () => {
      mockGet.mockResolvedValueOnce({
        messages: [mockMessage],
        hasMore: false,
      });

      const { result } = renderHook(
        () => useMessages({ sessionId: 'session-123' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.messages).toHaveLength(1);
      expect(result.current.data?.messages[0].content).toBe('Test message content');
      expect(mockGet).toHaveBeenCalledWith('/sessions/session-123/messages');
    });

    it('fetches messages with stage filter', async () => {
      mockGet.mockResolvedValueOnce({
        messages: [mockMessage],
        hasMore: false,
      });

      const { result } = renderHook(
        () => useMessages({ sessionId: 'session-123', stage: Stage.WITNESS }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGet).toHaveBeenCalledWith('/sessions/session-123/messages?stage=1');
    });

    it('fetches messages with pagination params', async () => {
      mockGet.mockResolvedValueOnce({
        messages: [mockMessage],
        hasMore: true,
        cursor: 'next-cursor',
      });

      const { result } = renderHook(
        () => useMessages({ sessionId: 'session-123', limit: 20, cursor: 'prev-cursor' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGet).toHaveBeenCalledWith(
        '/sessions/session-123/messages?limit=20&cursor=prev-cursor'
      );
    });

    it('does not fetch when sessionId is empty', async () => {
      const { result } = renderHook(
        () => useMessages({ sessionId: '' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('useSendMessage hook', () => {
    it('sends message successfully', async () => {
      mockPost.mockResolvedValueOnce({
        userMessage: mockMessage,
        aiResponse: mockAiMessage,
      });

      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({
        sessionId: 'session-123',
        content: 'Test message content',
      });

      await act(async () => {
        await mutationPromise;
      });

      expect(mockPost).toHaveBeenCalledWith('/sessions/session-123/messages', {
        sessionId: 'session-123',
        content: 'Test message content',
        emotionalIntensity: undefined,
        emotionalContext: undefined,
      });
      const mutationResult = await mutationPromise;
      expect(mutationResult.userMessage.content).toBe('Test message content');
      expect(mutationResult.aiResponse.role).toBe(MessageRole.AI);
    });

    it('sends message with emotional context', async () => {
      mockPost.mockResolvedValueOnce({
        userMessage: mockMessage,
        aiResponse: mockAiMessage,
      });

      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          sessionId: 'session-123',
          content: 'I feel overwhelmed',
          emotionalIntensity: 8,
          emotionalContext: 'Very stressed about this',
        });
      });

      expect(mockPost).toHaveBeenCalledWith('/sessions/session-123/messages', {
        sessionId: 'session-123',
        content: 'I feel overwhelmed',
        emotionalIntensity: 8,
        emotionalContext: 'Very stressed about this',
      });
    });

    it('handles error when sending message', async () => {
      const error = new (api.ApiClientError as any)(
        { code: 'VALIDATION_ERROR', message: 'Message content is required' },
        400
      );
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(),
      });

      let caughtError: Error | undefined;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            sessionId: 'session-123',
            content: '',
          });
        } catch (e) {
          caughtError = e as Error;
        }
      });

      expect(caughtError?.message).toBe('Message content is required');
    });
  });

  describe('useEmotionalHistory hook', () => {
    it('fetches emotional history for a session', async () => {
      mockGet.mockResolvedValueOnce({
        readings: [mockEmotionalReading],
        averageIntensity: 7,
        trend: 'stable',
      });

      const { result } = renderHook(
        () => useEmotionalHistory({ sessionId: 'session-123' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.readings).toHaveLength(1);
      expect(result.current.data?.averageIntensity).toBe(7);
      expect(mockGet).toHaveBeenCalledWith('/sessions/session-123/emotions');
    });

    it('fetches emotional history with stage filter', async () => {
      mockGet.mockResolvedValueOnce({
        readings: [],
        averageIntensity: 0,
        trend: 'none',
      });

      const { result } = renderHook(
        () => useEmotionalHistory({ sessionId: 'session-123', stage: Stage.WITNESS }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGet).toHaveBeenCalledWith('/sessions/session-123/emotions?stage=1');
    });
  });

  describe('useRecordEmotion hook', () => {
    it('records emotional reading successfully', async () => {
      mockPost.mockResolvedValueOnce({
        reading: mockEmotionalReading,
        offerSupport: false,
        supportType: null,
      });

      const { result } = renderHook(() => useRecordEmotion(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({
        sessionId: 'session-123',
        intensity: 7,
        context: 'Feeling anxious',
      });

      await act(async () => {
        await mutationPromise;
      });

      expect(mockPost).toHaveBeenCalledWith('/sessions/session-123/emotions', {
        sessionId: 'session-123',
        intensity: 7,
        context: 'Feeling anxious',
      });
      const mutationResult = await mutationPromise;
      expect(mutationResult.reading.intensity).toBe(7);
    });

    it('receives exercise suggestion for high intensity', async () => {
      mockPost.mockResolvedValueOnce({
        reading: { ...mockEmotionalReading, intensity: 9 },
        offerSupport: true,
        supportType: EmotionalSupportType.BREATHING_EXERCISE,
      });

      const { result } = renderHook(() => useRecordEmotion(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({
        sessionId: 'session-123',
        intensity: 9,
        context: 'Very stressed',
      });

      await act(async () => {
        await mutationPromise;
      });

      const mutationResult = await mutationPromise;
      expect(mutationResult.offerSupport).toBe(true);
    });
  });

  describe('useCompleteExercise hook', () => {
    it('completes exercise successfully', async () => {
      mockPost.mockResolvedValueOnce({
        logged: true,
        postExerciseCheckIn: false,
      });

      const { result } = renderHook(() => useCompleteExercise(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({
        sessionId: 'session-123',
        exerciseType: EmotionalSupportType.BREATHING_EXERCISE,
        completed: true,
        intensityBefore: 8,
        intensityAfter: 5,
      });

      await act(async () => {
        await mutationPromise;
      });

      expect(mockPost).toHaveBeenCalledWith('/sessions/session-123/exercises', {
        sessionId: 'session-123',
        exerciseType: EmotionalSupportType.BREATHING_EXERCISE,
        completed: true,
        intensityBefore: 8,
        intensityAfter: 5,
      });
      const mutationResult = await mutationPromise;
      expect(mutationResult.logged).toBe(true);
    });
  });

  describe('useOptimisticMessage hook', () => {
    it('adds and removes optimistic message', async () => {
      const queryClient = new QueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useOptimisticMessage(), { wrapper });

      // Add optimistic message
      let optimisticId: string | undefined;
      act(() => {
        optimisticId = result.current.addOptimisticMessage('session-123', {
          content: 'Optimistic message',
          stage: Stage.ONBOARDING,
        });
      });

      expect(optimisticId).toBeDefined();
      expect(optimisticId).toContain('optimistic-');

      // Check message was added to cache
      const cachedMessages = queryClient.getQueryData(messageKeys.list('session-123'));
      expect(cachedMessages).toBeDefined();

      // Remove optimistic message
      act(() => {
        result.current.removeOptimisticMessage('session-123', optimisticId!);
      });

      // Message should be removed from cache
      const updatedCache = queryClient.getQueryData(messageKeys.list('session-123'));
      if (updatedCache && typeof updatedCache === 'object' && 'messages' in updatedCache) {
        const messages = (updatedCache as { messages: Array<{ id: string }> }).messages;
        expect(messages.find((m) => m.id === optimisticId)).toBeUndefined();
      }
    });
  });

  describe('messageKeys', () => {
    it('generates correct query keys', () => {
      expect(messageKeys.all).toEqual(['messages']);
      expect(messageKeys.lists()).toEqual(['messages', 'list']);
      expect(messageKeys.list('session-123')).toEqual(['messages', 'list', 'session-123', undefined]);
      expect(messageKeys.list('session-123', Stage.WITNESS)).toEqual([
        'messages',
        'list',
        'session-123',
        Stage.WITNESS,
      ]);
      expect(messageKeys.emotions()).toEqual(['messages', 'emotions']);
      expect(messageKeys.emotionHistory('session-123')).toEqual([
        'messages',
        'emotions',
        'session-123',
        undefined,
      ]);
    });
  });
});
