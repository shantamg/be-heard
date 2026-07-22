import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageRole, Stage } from '@meet-without-fear/shared';
import { useStreamingMessage } from '../useStreamingMessage';
import { messageKeys, sessionKeys, stageKeys } from '../queryKeys';
import { getAnimationIdentity } from '../../utils/animationBridge';

jest.mock('../../lib/api', () => ({
  getAuthToken: jest.fn().mockResolvedValue('test-token'),
  isE2EAuthMode: jest.fn().mockReturnValue(false),
  getE2EAuthHeaders: jest.fn().mockReturnValue(null),
}));

type MockSseEvent = { data?: string; message?: string };
type MockEventSourceInstance = {
  listeners: Record<string, Array<(event: MockSseEvent) => void>>;
  close: jest.Mock;
};

const mockEventSourceInstances: MockEventSourceInstance[] = [];

jest.mock('react-native-sse', () => {
  class MockEventSource {
    listeners: Record<string, Array<(event: MockSseEvent) => void>> = {};
    close = jest.fn();

    constructor() {
      mockEventSourceInstances.push(this);
    }

    addEventListener(
      eventName: string,
      listener: (event: MockSseEvent) => void
    ) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(listener);
    }
  }
  return { __esModule: true, default: MockEventSource };
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient): React.FC<{ children: React.ReactNode }> {
  return ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useStreamingMessage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockEventSourceInstances.length = 0;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('soft-recovers a slow stream by refetching persisted messages without closing the connection', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: 'session-123',
        content: 'This is still processing',
        currentStage: Stage.PERSPECTIVE_STRETCH,
      });
    });

    expect(result.current.status).toBe('sending');
    expect(mockEventSourceInstances).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(15000);
    });

    expect(mockEventSourceInstances[0].close).not.toHaveBeenCalled();
    expect(result.current.status).toBe('sending');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.failedMessageContent).toBeNull();

    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: messageKeys.list('session-123') });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: messageKeys.infinite('session-123') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.state('session-123') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: stageKeys.empathyStatus('session-123') });
    expect(warnSpy).toHaveBeenCalledWith('[useStreamingMessage] 15s soft recovery - refetching persisted messages while stream remains open');

    await act(async () => {
      jest.advanceTimersByTime(75000);
    });

    expect(mockEventSourceInstances[0].close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');

    unmount();
    queryClient.clear();
    warnSpy.mockRestore();
  });

  it('keeps cached AI messages marked streaming until text_complete', async () => {
    const queryClient = createQueryClient();

    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: 'session-123',
        content: 'Tell me more',
        currentStage: Stage.WITNESS,
      });
    });

    const eventSource = mockEventSourceInstances[0];

    act(() => {
      eventSource.listeners.chunk[0]({ data: JSON.stringify({ text: 'Hello' }) });
    });

    let cachedMessages = queryClient.getQueryData<{ messages: Array<{ role: MessageRole; status?: string; content: string }> }>(
      messageKeys.list('session-123')
    )?.messages;
    let cachedAIMessage = cachedMessages?.find((message) => message.role === MessageRole.AI);

    expect(cachedAIMessage).toMatchObject({
      content: 'Hello',
      status: 'streaming',
    });

    act(() => {
      eventSource.listeners.text_complete[0]({ data: JSON.stringify({ metadata: {} }) });
    });

    cachedMessages = queryClient.getQueryData<{ messages: Array<{ role: MessageRole; status?: string; content: string }> }>(
      messageKeys.list('session-123')
    )?.messages;
    cachedAIMessage = cachedMessages?.find((message) => message.role === MessageRole.AI);

    expect(cachedAIMessage).toMatchObject({
      content: 'Hello',
      status: 'sent',
    });

    act(() => {
      eventSource.listeners.complete[0]({
        data: JSON.stringify({ messageId: 'server-ai-message-1', metadata: {} }),
      });
    });

    cachedMessages = queryClient.getQueryData<{ messages: Array<{ id: string; role: MessageRole; status?: string; content: string }> }>(
      messageKeys.list('session-123')
    )?.messages;
    cachedAIMessage = cachedMessages?.find((message) => message.role === MessageRole.AI);

    expect(cachedAIMessage?.id).toBe('server-ai-message-1');
    expect(getAnimationIdentity('server-ai-message-1')).toMatch(/^streaming-/);

    unmount();
    queryClient.clear();
  });
});
