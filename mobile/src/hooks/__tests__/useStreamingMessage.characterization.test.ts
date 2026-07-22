/**
 * Characterization tests for the mobile streaming client (useStreamingMessage).
 *
 * Phase 0 of the chat modernization program
 * (.planning/ASK_LOVELY_CHAT_MODERNIZATION.md): pins CURRENT behavior of the
 * send/stream lifecycle — optimistic turns, temp→server ID reconciliation,
 * error cleanup, retry compensation, duplicate/malformed frame tolerance —
 * before the Phase 4 split into transport/reducer/cache adapters.
 *
 * Wire payloads come from the same fixtures the backend characterization
 * suite asserts against (shared/src/testing/sse-fixtures.ts), so both sides
 * pin the same protocol.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageDTO, MessageRole, Stage } from '@meet-without-fear/shared';
import { useStreamingMessage } from '../useStreamingMessage';
import { messageKeys, stageKeys } from '../queryKeys';
import { getAnimationIdentity } from '../../utils/animationBridge';
import {
  streamEventFixtures,
  streamMetadataFixtures,
} from '../../../../shared/src/testing/sse-fixtures';

jest.mock('../../lib/api', () => ({
  getAuthToken: jest.fn().mockResolvedValue('test-token'),
  isE2EAuthMode: jest.fn().mockReturnValue(false),
  getE2EAuthHeaders: jest.fn().mockReturnValue(null),
}));

type MockSseEvent = { data?: string; message?: string };
type MockEventSourceInstance = {
  listeners: Record<string, Array<(event: MockSseEvent) => void>>;
  close: jest.Mock;
  url: string;
  options: Record<string, unknown>;
};

const mockEventSourceInstances: MockEventSourceInstance[] = [];

jest.mock('react-native-sse', () => {
  class MockEventSource {
    listeners: Record<string, Array<(event: MockSseEvent) => void>> = {};
    close = jest.fn();
    url: string;
    options: Record<string, unknown>;

    constructor(url: string, options: Record<string, unknown>) {
      this.url = url;
      this.options = options;
      mockEventSourceInstances.push(this);
    }

    addEventListener(eventName: string, listener: (event: MockSseEvent) => void) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(listener);
    }
  }
  return { __esModule: true, default: MockEventSource };
});

const SESSION_ID = 'session-123';

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

type CachedMessage = MessageDTO & { status?: string };

function cachedMessages(queryClient: QueryClient, stage?: Stage): CachedMessage[] {
  return (
    queryClient.getQueryData<{ messages: CachedMessage[] }>(
      stage === undefined ? messageKeys.list(SESSION_ID) : messageKeys.list(SESSION_ID, stage)
    )?.messages ?? []
  );
}

function emit(
  es: MockEventSourceInstance,
  eventName: string,
  data: unknown
) {
  for (const listener of es.listeners[eventName] ?? []) {
    listener({ data: JSON.stringify(data) });
  }
}

describe('useStreamingMessage characterization', () => {
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

  it('runs the full normal turn: optimistic user turn, streamed AI turn, temp→server ID bridging, exactly one of each', async () => {
    const queryClient = createQueryClient();
    const onComplete = jest.fn();
    const { result, unmount } = renderHook(() => useStreamingMessage({ onComplete }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: streamEventFixtures.userMessage.data.content,
        currentStage: Stage.WITNESS,
      });
    });

    // Optimistic user message is in cache immediately, marked sending.
    let users = cachedMessages(queryClient).filter((m) => m.role === MessageRole.USER);
    expect(users).toHaveLength(1);
    expect(users[0].id).toMatch(/^optimistic-user-/);
    expect(users[0].status).toBe('sending');
    expect(result.current.isSending).toBe(true);

    const es = mockEventSourceInstances[0];
    // Transport characterization: POST to the streaming endpoint with auth.
    expect(es.url).toContain(`/sessions/${SESSION_ID}/messages/stream`);
    expect(es.options.method).toBe('POST');

    // Server acknowledges the user message: same optimistic ID kept (no key churn).
    act(() => {
      emit(es, 'user_message', streamEventFixtures.userMessage.data);
    });
    users = cachedMessages(queryClient).filter((m) => m.role === MessageRole.USER);
    expect(users).toHaveLength(1);
    expect(users[0].id).toMatch(/^optimistic-user-/);
    expect(users[0].timestamp).toBe(streamEventFixtures.userMessage.data.timestamp);

    // Chunks accumulate into a single streaming AI placeholder.
    act(() => {
      emit(es, 'chunk', { text: 'I hear you — ' });
    });
    act(() => {
      jest.advanceTimersByTime(60); // flush the 50ms cache-update throttle
    });
    act(() => {
      emit(es, 'chunk', { text: 'that sounds heavy.' });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    let ais = cachedMessages(queryClient).filter((m) => m.role === MessageRole.AI);
    expect(ais).toHaveLength(1);
    expect(ais[0].id).toMatch(/^streaming-/);
    expect(ais[0].content).toBe('I hear you — that sounds heavy.');
    expect(ais[0].status).toBe('streaming');
    expect(result.current.isStreaming).toBe(true);

    // text_complete finalizes the visible text and completes the UI lifecycle.
    act(() => {
      emit(es, 'text_complete', { metadata: {} });
    });
    ais = cachedMessages(queryClient).filter((m) => m.role === MessageRole.AI);
    expect(ais[0].status).toBe('sent');
    expect(result.current.status).toBe('complete');
    expect(onComplete).toHaveBeenCalledTimes(1);

    // complete bridges both temp IDs to server IDs — same rows, new IDs.
    act(() => {
      emit(es, 'complete', { messageId: 'msg-ai-1', metadata: {} });
    });
    const finalMessages = cachedMessages(queryClient);
    const finalUsers = finalMessages.filter((m) => m.role === MessageRole.USER);
    const finalAis = finalMessages.filter((m) => m.role === MessageRole.AI);
    expect(finalUsers).toHaveLength(1);
    expect(finalAis).toHaveLength(1);
    expect(finalUsers[0].id).toBe(streamEventFixtures.userMessage.data.id);
    expect(finalAis[0].id).toBe('msg-ai-1');
    // Animation identity maps server IDs back to their temp IDs (no reanimation).
    expect(getAnimationIdentity('msg-ai-1')).toMatch(/^streaming-/);
    expect(getAnimationIdentity(streamEventFixtures.userMessage.data.id)).toMatch(/^optimistic-user-/);
    // EventSource closed after complete.
    expect(es.close).toHaveBeenCalled();

    unmount();
    queryClient.clear();
  });

  it('receiving complete twice does not duplicate messages or re-bridge IDs', async () => {
    const queryClient = createQueryClient();
    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'hello',
        currentStage: Stage.WITNESS,
      });
    });
    const es = mockEventSourceInstances[0];

    act(() => {
      emit(es, 'user_message', streamEventFixtures.userMessage.data);
      emit(es, 'chunk', { text: 'Reply.' });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    act(() => {
      emit(es, 'text_complete', { metadata: {} });
      emit(es, 'complete', { messageId: 'msg-ai-1', metadata: {} });
    });
    act(() => {
      emit(es, 'complete', { messageId: 'msg-ai-1', metadata: {} });
    });

    const messages = cachedMessages(queryClient);
    expect(messages.filter((m) => m.role === MessageRole.USER)).toHaveLength(1);
    expect(messages.filter((m) => m.role === MessageRole.AI)).toHaveLength(1);

    unmount();
    queryClient.clear();
  });

  it('malformed JSON in stream frames is swallowed without corrupting the cache or throwing', async () => {
    const queryClient = createQueryClient();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'hello',
        currentStage: Stage.WITNESS,
      });
    });
    const es = mockEventSourceInstances[0];

    act(() => {
      for (const listener of es.listeners.user_message ?? []) {
        listener({ data: '{not json' });
      }
      for (const listener of es.listeners.chunk ?? []) {
        listener({ data: '{"text": ' });
      }
    });

    // Stream still usable afterwards.
    act(() => {
      emit(es, 'chunk', { text: 'Recovered.' });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    const ais = cachedMessages(queryClient).filter((m) => m.role === MessageRole.AI);
    expect(ais).toHaveLength(1);
    expect(ais[0].content).toBe('Recovered.');
    expect(result.current.status).toBe('streaming');
    expect(errorSpy).toHaveBeenCalled();

    unmount();
    queryClient.clear();
    errorSpy.mockRestore();
  });

  it('error event rolls back the optimistic turn, exposes retry state, and a retry yields exactly one user and one AI turn', async () => {
    const queryClient = createQueryClient();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = jest.fn();
    const { result, unmount } = renderHook(() => useStreamingMessage({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'first try',
        currentStage: Stage.WITNESS,
      });
    });
    const firstEs = mockEventSourceInstances[0];

    act(() => {
      emit(firstEs, 'chunk', { text: 'partial that will fail' });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    act(() => {
      for (const listener of firstEs.listeners.error ?? []) {
        listener({ message: 'Connection error' });
      }
    });

    // Optimistic user message and streaming AI placeholder are gone.
    expect(cachedMessages(queryClient)).toHaveLength(0);
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Connection error');
    expect(result.current.failedMessageContent).toBe('first try');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(firstEs.close).toHaveBeenCalled();

    // Retry re-sends the same content on a fresh EventSource.
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });
    expect(mockEventSourceInstances).toHaveLength(2);
    const retryEs = mockEventSourceInstances[1];

    act(() => {
      emit(retryEs, 'user_message', { ...streamEventFixtures.userMessage.data, content: 'first try' });
      emit(retryEs, 'chunk', { text: 'Full reply.' });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    act(() => {
      emit(retryEs, 'text_complete', { metadata: {} });
      emit(retryEs, 'complete', { messageId: 'msg-ai-retry', metadata: {} });
    });

    const messages = cachedMessages(queryClient);
    expect(messages.filter((m) => m.role === MessageRole.USER)).toHaveLength(1);
    expect(messages.filter((m) => m.role === MessageRole.USER)[0].content).toBe('first try');
    expect(messages.filter((m) => m.role === MessageRole.AI)).toHaveLength(1);
    expect(messages.filter((m) => m.role === MessageRole.AI)[0].content).toBe('Full reply.');
    expect(result.current.status).toBe('complete');

    unmount();
    queryClient.clear();
    errorSpy.mockRestore();
  });

  it('metadata frames project structured state into the stage caches while streaming continues', async () => {
    const queryClient = createQueryClient();
    const onMetadata = jest.fn();
    const { result, unmount } = renderHook(() => useStreamingMessage({ onMetadata }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'stage 2 message',
        currentStage: Stage.PERSPECTIVE_STRETCH,
      });
    });
    const es = mockEventSourceInstances[0];

    act(() => {
      emit(es, 'metadata', { metadata: streamMetadataFixtures.stage2EmpathyDraft });
    });

    // Empathy draft cache updated from metadata (cache-first projection).
    const draftCache = queryClient.getQueryData<{ draft?: { content?: string } }>(
      stageKeys.empathyDraft(SESSION_ID)
    );
    expect(draftCache?.draft?.content).toBe(
      streamMetadataFixtures.stage2EmpathyDraft.proposedEmpathyStatement
    );
    expect(onMetadata).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ offerReadyToShare: true })
    );

    unmount();
    queryClient.clear();
  });

  it('cancel closes the transport and returns to idle, leaving optimistic messages in cache (current behavior)', async () => {
    const queryClient = createQueryClient();
    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'to be cancelled',
        currentStage: Stage.WITNESS,
      });
    });
    const es = mockEventSourceInstances[0];

    act(() => {
      result.current.cancel();
    });

    expect(es.close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    // Current behavior: cancel does NOT roll back the optimistic user message.
    // (Phase 4 will make this an explicit lifecycle decision.)
    const users = cachedMessages(queryClient).filter((m) => m.role === MessageRole.USER);
    expect(users).toHaveLength(1);
    expect(users[0].status).toBe('sending');

    unmount();
    queryClient.clear();
  });

  it('stage-scoped caches receive the same optimistic writes as the unscoped cache', async () => {
    const queryClient = createQueryClient();
    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'stage-scoped',
        currentStage: Stage.NEED_MAPPING,
      });
    });

    const unscoped = cachedMessages(queryClient);
    const scoped = cachedMessages(queryClient, Stage.NEED_MAPPING);
    expect(unscoped).toHaveLength(1);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].id).toBe(unscoped[0].id);

    unmount();
    queryClient.clear();
  });
});

describe('useStreamingMessage unmount cleanup (defect fix)', () => {
  it('closes the transport and clears all timers when the component unmounts mid-stream', async () => {
    const queryClient = createQueryClient();
    const { result, unmount } = renderHook(() => useStreamingMessage(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage({
        sessionId: SESSION_ID,
        content: 'in-flight at unmount',
        currentStage: Stage.WITNESS,
      });
    });
    const es = mockEventSourceInstances[0];
    act(() => {
      emit(es, 'chunk', { text: 'partial' }); // schedules the throttle timer
    });

    unmount();

    // No socket, no timers survive the unmount.
    expect(es.close).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    queryClient.clear();
  });
});
