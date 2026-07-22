/**
 * Streaming Message Hook
 *
 * Handles SSE streaming for AI responses with optimistic updates.
 * Uses react-native-sse for proper SSE support in React Native.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import Constants from 'expo-constants';
import EventSource from 'react-native-sse';
import { getAuthToken, isE2EAuthMode, getE2EAuthHeaders } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  Stage,
  parseStreamEventData,
  type StreamMetadata,
  type StreamEventName,
} from '@meet-without-fear/shared';
import { messageKeys } from './queryKeys';
import { getPersistedMessageRefreshQueryKeys } from '../utils/realtimeInvalidation';
import { bridgeAnimatedId } from '../utils/animationBridge';
import {
  createMessageCacheAdapter,
  type CachedStreamingMessage,
} from '../lib/chat/messageCacheAdapter';
import {
  initialStreamLifecycleState,
  needsCompletionFallback,
  streamLifecycleReducer,
  toPublicStatus,
  type StreamLifecycleEvent,
  type StreamLifecycleState,
  type StreamStatus,
} from '../lib/chat/streamLifecycle';
import { createStreamTimers } from '../lib/chat/streamTimers';
import {
  hardTimeoutInvalidationKeys,
  softTimeoutInvalidationKeys,
  textCompleteInvalidationKeys,
} from '../lib/chat/streamInvalidation';
import {
  metadataInvalidationKeys,
  streamMetadataCacheWrites,
} from '../lib/chat/streamMetadataCache';

// ============================================================================
// Types
// ============================================================================

/**
 * Structured metadata from the AI's tool call. Defined once in the shared
 * streaming contract (shared/src/contracts/stream.ts); re-exported here for
 * existing consumers of this hook.
 */
export type { StreamMetadata } from '@meet-without-fear/shared';

/** Status of a streaming message. Owned by the pure lifecycle module. */
export type { StreamStatus } from '../lib/chat/streamLifecycle';

/** Parameters for sending a streaming message */
export interface SendStreamingMessageParams {
  sessionId: string;
  content: string;
  currentStage?: Stage;
  refiningNeedId?: string | null;
}

/** Options for the streaming hook */
export interface UseStreamingMessageOptions {
  /** Callback when metadata is received from the AI */
  onMetadata?: (sessionId: string, metadata: StreamMetadata) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback when streaming completes successfully */
  onComplete?: () => void;
}

/** Result from the streaming hook */
export interface UseStreamingMessageResult {
  /** Current status of the stream */
  status: StreamStatus;
  /** Whether the hook is actively streaming a response */
  isStreaming: boolean;
  /** Whether the hook is in the process of sending (before streaming starts) */
  isSending: boolean;
  /** Send a message and stream the AI response */
  sendMessage: (params: SendStreamingMessageParams) => Promise<void>;
  /** Cancel the current stream */
  cancel: () => void;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** The content of the last failed message (for restoring to the input field) */
  failedMessageContent: string | null;
  /** Retry the last failed message */
  retry: () => void;
}

// ============================================================================
// Configuration
// ============================================================================

const rawApiUrl =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000';

const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

/** Longest gap between cache writes while chunks arrive. */
const CACHE_UPDATE_INTERVAL = 50;
/** Refetch persisted messages, but leave the stream open — it may still deliver. */
const SOFT_RECOVERY_TIMEOUT = 15000;
/** Give up on the stream and fall back to server truth. */
const HARD_STREAM_TIMEOUT = 90000;
/** Trailing refetch after reconciliation, to catch writes that landed late. */
const RECONCILIATION_REFETCH_DELAY = 1200;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for sending messages with SSE streaming responses.
 *
 * Features:
 * - Optimistic updates for user message
 * - Real-time text chunk updates for AI message
 * - Metadata handling from AI tool calls
 * - Error handling with retry support
 * - EventSource for cancellation
 *
 * @param options - Optional callbacks for metadata, error, and completion
 */
export function useStreamingMessage(
  options: UseStreamingMessageOptions = {}
): UseStreamingMessageResult {
  const { onMetadata, onError, onComplete } = options;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Typed seam to the message caches (add/update/replaceId/remove).
  const cache = useMemo(() => createMessageCacheAdapter(queryClient), [queryClient]);

  // Lifecycle: the ref is the synchronous source of truth (handlers branch on
  // it within the same tick), the state exists so React re-renders.
  const lifecycleRef = useRef<StreamLifecycleState>(initialStreamLifecycleState);
  const dispatch = useCallback((event: StreamLifecycleEvent): StreamLifecycleState => {
    const next = streamLifecycleReducer(lifecycleRef.current, event);
    lifecycleRef.current = next;
    setStatus(toPublicStatus(next.phase));
    return next;
  }, []);

  // Bumped on unmount and on each new send. Any async continuation that finds
  // a stale generation must abandon quietly instead of creating a stream that
  // nothing is left to close.
  const isMountedRef = useRef(true);
  const sendGenerationRef = useRef(0);

  // Refs for cleanup and retry
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastParamsRef = useRef<SendStreamingMessageParams | null>(null);

  // Ref to track accumulated text for AI message updates
  const accumulatedTextRef = useRef<string>('');
  const aiMessageIdRef = useRef<string>('');

  // Ref to track optimistic user message ID for replacement
  const optimisticUserIdRef = useRef<string>('');
  const activeUserMessageIdRef = useRef<string>('');
  // Real server ID received from the user_message event, used for ID bridging
  const realUserIdRef = useRef<string>('');

  // Throttled cache updates (reduces stuttering during chunk delivery)
  const lastCacheUpdateRef = useRef<number>(0);

  // Every timer this turn owns, cleared by name. See streamTimers.ts for why
  // this is a registry rather than four independent refs.
  const timers = useMemo(() => createStreamTimers(), []);

  // Unmount cleanup: an in-flight stream must not outlive the component.
  // Closes the EventSource and clears every pending timer so no socket,
  // timer, or stale identity alias survives (Phase 4 exit criterion; this
  // was a real leak before the chat-modernization work).
  //
  // Releasing the refs is necessary but not sufficient: `sendMessage` awaits
  // token retrieval before it has anything to release, so unmounting during
  // that await would otherwise let the resumed callback build a stream after
  // the component is gone. `isMountedRef` closes that race.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sendGenerationRef.current += 1;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      timers.clearAll();
    };
  }, [timers]);

  const cleanupFailedStream = useCallback(
    (sessionId: string, stage?: Stage) => {
      cache.remove(
        sessionId,
        [activeUserMessageIdRef.current, optimisticUserIdRef.current, aiMessageIdRef.current],
        stage
      );

      activeUserMessageIdRef.current = '';
      optimisticUserIdRef.current = '';
      aiMessageIdRef.current = '';
      accumulatedTextRef.current = '';

      queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
    },
    [queryClient, cache]
  );

  /** Invalidate a derived key set. The policy itself lives in streamInvalidation.ts. */
  const invalidateKeys = useCallback(
    (queryKeys: readonly QueryKey[]) => {
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient]
  );

  const reconcilePersistedMessages = useCallback(
    (sessionId: string) => {
      timers.clear('reconciliation');

      for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey });
      }

      timers.set(
        'reconciliation',
        () => {
          for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
            queryClient.refetchQueries({ queryKey });
          }
        },
        RECONCILIATION_REFETCH_DELAY
      );
    },
    [queryClient, timers]
  );

  const recoverTimedOutStream = useCallback(
    (sessionId: string, stage?: Stage) => {
      timers.clear('throttledCacheUpdate');

      // The backend may have persisted the message even if the client-side SSE
      // connection stopped producing events. Pull server truth instead of
      // forcing the user to manually reload the chat.
      reconcilePersistedMessages(sessionId);
      invalidateKeys(hardTimeoutInvalidationKeys(sessionId, stage));

      accumulatedTextRef.current = '';
      aiMessageIdRef.current = '';
      optimisticUserIdRef.current = '';
      activeUserMessageIdRef.current = '';
      realUserIdRef.current = '';
      dispatch({ type: 'hardTimeout' });
    },
    [invalidateKeys, reconcilePersistedMessages, timers, dispatch]
  );

  /**
   * Handle metadata from the AI response
   */
  const handleMetadata = useCallback(
    (sessionId: string, metadata: StreamMetadata) => {
      // Direct writes first, so panels open while text is still streaming.
      for (const { queryKey, update } of streamMetadataCacheWrites(sessionId, metadata)) {
        queryClient.setQueryData(queryKey, update);
      }

      // Then the narrow refetch set, for state only the server can produce.
      //
      // Broad invalidation here would be a bug, not a convenience: it races the
      // optimistic writes (invitation.messageConfirmedAt gets overwritten),
      // makes indicators and messages blink out during refetch, and breaks the
      // cache-first contract. Anything writable directly is written above;
      // see streamInvalidation.ts for what genuinely needs the server.
      invalidateKeys(metadataInvalidationKeys(sessionId, metadata));

      onMetadata?.(sessionId, metadata);
    },
    [queryClient, invalidateKeys, onMetadata]
  );

  /**
   * Send a message with SSE streaming using react-native-sse
   */
  const sendMessage = useCallback(
    async (params: SendStreamingMessageParams) => {
      const { sessionId, content, currentStage, refiningNeedId } = params;

      // Claim this send. Unmount (and any later send) bumps the generation, so
      // work resuming after an await can tell it has been superseded.
      const generation = ++sendGenerationRef.current;
      const isCurrentSend = () => isMountedRef.current && sendGenerationRef.current === generation;

      // Store params for retry
      lastParamsRef.current = params;

      // Close any existing EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Reset state
      dispatch({ type: 'send' });
      setErrorMessage(null);
      accumulatedTextRef.current = '';
      aiMessageIdRef.current = `streaming-${Date.now()}`;
      optimisticUserIdRef.current = `optimistic-user-${Date.now()}`;
      activeUserMessageIdRef.current = optimisticUserIdRef.current;
      realUserIdRef.current = '';

      // Create optimistic user message
      const optimisticUserMessage: CachedStreamingMessage = {
        id: optimisticUserIdRef.current,
        sessionId,
        senderId: null,
        role: MessageRole.USER,
        content,
        stage: currentStage ?? Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
        refiningNeedId: refiningNeedId ?? null,
        status: 'sending',
      };

      // Add optimistic user message to cache
      cache.add(sessionId, optimisticUserMessage, currentStage);

      try {
        // Build auth headers - either E2E headers or Bearer token
        let authHeaders: Record<string, string> = {};

        if (isE2EAuthMode()) {
          // E2E mode: use custom headers
          const e2eHeaders = getE2EAuthHeaders();
          if (e2eHeaders) {
            authHeaders = { ...e2eHeaders };
          }
        } else {
          // Normal mode: use Bearer token
          const token = await getAuthToken();
          if (!token) {
            throw new Error('Not authenticated');
          }
          authHeaders = { Authorization: `Bearer ${token}` };
        }

        // Token retrieval is async: the component may have unmounted, or a
        // newer send may have started, while it was pending. Creating the
        // stream now would leave a socket and timers nobody owns.
        if (!isCurrentSend()) {
          return;
        }

        const url = `${API_BASE_URL}/sessions/${sessionId}/messages/stream`;

        // Create EventSource with POST method
        const es = new EventSource<StreamEventName>(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ content, refiningNeedId: refiningNeedId ?? undefined }),
          pollingInterval: 0, // Disable polling, use SSE
        });

        eventSourceRef.current = es;

        // Start a soft recovery timer for slow streams. Some model calls take
        // longer than 15s before the first visible token; do not close the SSE
        // connection here or the final response can be lost after it persists.
        timers.set(
          'softRecovery',
          () => {
            if (!eventSourceRef.current) return;
            console.warn('[useStreamingMessage] 15s soft recovery - refetching persisted messages while stream remains open');
            reconcilePersistedMessages(sessionId);
            invalidateKeys(softTimeoutInvalidationKeys(sessionId, currentStage));
          },
          SOFT_RECOVERY_TIMEOUT
        );

        timers.set(
          'hardTimeout',
          () => {
            if (!eventSourceRef.current) return;
            console.warn('[useStreamingMessage] 90s hard timeout - closing stream and recovering persisted messages');
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            recoverTimedOutStream(sessionId, currentStage);
          },
          HARD_STREAM_TIMEOUT
        );

        // Create placeholder AI message once streaming starts
        let placeholderCreated = false;
        const createPlaceholder = () => {
          if (placeholderCreated) return;
          placeholderCreated = true;
          dispatch({ type: 'chunk' });
          const placeholderAIMessage: CachedStreamingMessage = {
            id: aiMessageIdRef.current,
            sessionId,
            senderId: null,
            role: MessageRole.AI,
            content: '',
            stage: currentStage ?? Stage.ONBOARDING,
            timestamp: new Date().toISOString(),
            refiningNeedId: refiningNeedId ?? null,
            status: 'streaming',
          };
          cache.add(sessionId, placeholderAIMessage, currentStage);
        };

        // Handle user_message event - update optimistic message with server data
        // We keep the same ID to avoid React key changes that cause visual jumps
        es.addEventListener('user_message', (event) => {
          if (!event.data) return;
          {
            const data = parseStreamEventData('user_message', event.data);
            if (!data) {
              console.error('[useStreamingMessage] Dropping invalid user_message frame');
              return;
            }
            realUserIdRef.current = data.id; // Store for ID bridging at completion
            // Update optimistic message with server timestamp (keep same ID for React key stability)
            if (optimisticUserIdRef.current) {
              activeUserMessageIdRef.current = optimisticUserIdRef.current;
              cache.update(sessionId, optimisticUserIdRef.current, {
                timestamp: data.timestamp,
                content: data.content, // In case server modified content
                refiningNeedId: data.refiningNeedId ?? null,
              }, currentStage);
              optimisticUserIdRef.current = ''; // Clear after update
            } else {
              // Fallback: add as new message if no optimistic message exists
              const realUserMessage: MessageDTO = {
                id: data.id,
                sessionId,
                senderId: null,
                role: MessageRole.USER,
                content: data.content,
                stage: currentStage ?? Stage.ONBOARDING,
                timestamp: data.timestamp,
                refiningNeedId: data.refiningNeedId ?? null,
              };
              cache.add(sessionId, realUserMessage, currentStage);
            }
          }
        });

        // Handle chunk event with throttled cache updates
        es.addEventListener('chunk', (event) => {
          if (!event.data) return;
          createPlaceholder();
          {
            const data = parseStreamEventData('chunk', event.data);
            if (!data) {
              console.error('[useStreamingMessage] Dropping invalid chunk frame');
              return;
            }
            accumulatedTextRef.current += data.text;

            // Throttle cache updates to reduce stuttering
            const now = Date.now();
            const timeSinceLastUpdate = now - lastCacheUpdateRef.current;

            timers.clear('throttledCacheUpdate');

            const updateCache = () => {
              const updatedAIMessage: CachedStreamingMessage = {
                id: aiMessageIdRef.current,
                sessionId,
                senderId: null,
                role: MessageRole.AI,
                content: accumulatedTextRef.current,
                stage: currentStage ?? Stage.ONBOARDING,
                timestamp: new Date().toISOString(),
                refiningNeedId: refiningNeedId ?? null,
                status: 'streaming',
              };
              cache.add(sessionId, updatedAIMessage, currentStage);
              lastCacheUpdateRef.current = Date.now();
            };

            if (timeSinceLastUpdate >= CACHE_UPDATE_INTERVAL) {
              // Enough time has passed, update immediately
              updateCache();
            } else {
              // Schedule update for when the interval is reached
              timers.set(
                'throttledCacheUpdate',
                updateCache,
                CACHE_UPDATE_INTERVAL - timeSinceLastUpdate
              );
            }
          }
        });

        // Handle metadata event - tool call received during streaming
        // This allows UI to show panels (invitation, empathy) immediately while text continues
        es.addEventListener('metadata', (event) => {
          if (!event.data) return;

          {
            const data = parseStreamEventData('metadata', event.data);
            if (!data) {
              console.error('[useStreamingMessage] Dropping invalid metadata frame');
              return;
            }
            console.log(`[useStreamingMessage] [TIMING] metadata event received at ${Date.now()}`);

            // Handle metadata for UI panels immediately
            handleMetadata(sessionId, data.metadata);
          }
        });

        // Handle text_complete event - streaming text is done (before DB saves)
        // This allows the UI to stop showing the blinking cursor immediately
        es.addEventListener('text_complete', (event) => {
          const receiveTime = Date.now();
          console.log(`[useStreamingMessage] [TIMING] text_complete received at ${receiveTime}`);
          if (!event.data) return;

          // Streaming completed, so the soft recovery timer and any pending
          // throttled write are moot. The hard timeout stays armed until the
          // complete event confirms persistence.
          timers.clear('softRecovery', 'throttledCacheUpdate');

          {
            const data = parseStreamEventData('text_complete', event.data);
            if (!data) {
              console.error('[useStreamingMessage] Dropping invalid text_complete frame');
              return;
            }
            console.log(`[useStreamingMessage] [TIMING] text_complete parsed`);

            // Update cache with final content
            const finalAIMessage: CachedStreamingMessage = {
              id: aiMessageIdRef.current,
              sessionId,
              senderId: null,
              role: MessageRole.AI,
              content: accumulatedTextRef.current,
              stage: currentStage ?? Stage.ONBOARDING,
              timestamp: new Date().toISOString(),
              refiningNeedId: refiningNeedId ?? null,
              status: 'sent',
            };
            cache.add(sessionId, finalAIMessage, currentStage);

            // Handle metadata for UI panels (invitation, empathy, etc.)
            if (data.metadata) {
              console.log(`[useStreamingMessage] [TIMING] Calling handleMetadata at ${Date.now()}`);
              handleMetadata(sessionId, data.metadata);
              console.log(`[useStreamingMessage] [TIMING] handleMetadata returned at ${Date.now()}`);
            }

            // Refresh empathy status after streaming completes during Stage 2
            // (picks up messageCountSinceSharedContext and other server-side
            // state that changes as the user sends messages during REFINING).
            // Stage 3 escalates to the full success set — see streamInvalidation.ts.
            invalidateKeys(textCompleteInvalidationKeys(sessionId, currentStage));

            // Mark streaming as complete - cursor stops immediately
            dispatch({ type: 'textComplete' });
            onComplete?.();
            console.log(`[useStreamingMessage] [TIMING] text_complete handler done at ${Date.now()}`);
          }
        });

        // Handle complete event - DB saves finished, close connection
        // The streaming UI has already stopped via text_complete
        es.addEventListener('complete', (event) => {
          // The turn is done. Reconciliation is deliberately left alone: the
          // reconcilePersistedMessages call below re-arms it, and clearing it
          // here would only cancel a timer we are about to replace.
          timers.clear('softRecovery', 'hardTimeout', 'throttledCacheUpdate');

          const data = event.data ? parseStreamEventData('complete', event.data) : null;
          if (event.data && !data) {
            console.error('[useStreamingMessage] Dropping invalid complete frame');
          }
          if (data) {
            // Read the fallback decision before the terminal transition below.
            const needsFallback = needsCompletionFallback(lifecycleRef.current);
            {
              handleMetadata(sessionId, data.metadata);

              // Bridge temporary IDs to real server IDs before reconciliation.
              // This prevents ChatInterface from re-animating messages whose IDs
              // change from streaming placeholders to real UUIDs during refetch.
              if (data.messageId && aiMessageIdRef.current.startsWith('streaming-')) {
                bridgeAnimatedId(aiMessageIdRef.current, data.messageId);
                cache.replaceId(sessionId, aiMessageIdRef.current, data.messageId, currentStage);
                aiMessageIdRef.current = data.messageId;
              }
              if (realUserIdRef.current && activeUserMessageIdRef.current.startsWith('optimistic-user-')) {
                bridgeAnimatedId(activeUserMessageIdRef.current, realUserIdRef.current);
                cache.replaceId(sessionId, activeUserMessageIdRef.current, realUserIdRef.current, currentStage);
                cache.update(sessionId, realUserIdRef.current, { status: 'sent' } as Partial<CachedStreamingMessage>, currentStage);
                activeUserMessageIdRef.current = realUserIdRef.current;
              }

              reconcilePersistedMessages(sessionId);

              // If text_complete wasn't received (fallback), handle completion here
              if (needsFallback) {
                const finalAIMessage: CachedStreamingMessage = {
                  id: aiMessageIdRef.current,
                  sessionId,
                  senderId: null,
                  role: MessageRole.AI,
                  content: accumulatedTextRef.current,
                  stage: currentStage ?? Stage.ONBOARDING,
                  timestamp: new Date().toISOString(),
                  refiningNeedId: refiningNeedId ?? null,
                  status: 'sent',
                };
                cache.add(sessionId, finalAIMessage, currentStage);

                // Refresh empathy status (fallback path)
                invalidateKeys(textCompleteInvalidationKeys(sessionId, currentStage));

                onComplete?.();
              }
            }
          }

          // Terminal: further frames on this turn are late and must not apply.
          dispatch({ type: 'complete' });

          // Close the EventSource
          es.close();
          eventSourceRef.current = null;
        });

        // Handle error event from SSE
        // react-native-sse error events have: ErrorEvent (message, xhrState, xhrStatus),
        // TimeoutEvent (type only), or ExceptionEvent (message, error)
        es.addEventListener('error', (event) => {
          // The turn failed; nothing scheduled for it should still run.
          timers.clearAll();

          const errorMsg = 'message' in event ? event.message : 'Connection error';
          console.error('[useStreamingMessage] SSE error:', errorMsg);
          cleanupFailedStream(sessionId, currentStage);
          setErrorMessage(errorMsg);
          dispatch({ type: 'error' });
          onError?.(new Error(errorMsg));
          es.close();
          eventSourceRef.current = null;
        });

        // Handle open event
        es.addEventListener('open', () => {
          // Connection opened, waiting for events
        });

      } catch (error) {
        // BEHAVIOUR CHANGE (deliberate, called out for review): the original
        // cleared only the reconciliation and hard-timeout timers here, leaving
        // the soft-recovery timer and any pending throttled write armed. Since
        // this path does not null `eventSourceRef`, a surviving soft timer
        // would see a live EventSource 15s later and fire a reconcile for a
        // turn that already failed. Reaching that state requires a throw after
        // the timers are armed, which is why it was never observed. Clearing
        // all of them is the same thing every other terminal path does.
        timers.clearAll();
        console.error('[useStreamingMessage] Error:', error);
        cleanupFailedStream(sessionId, currentStage);
        setErrorMessage((error as Error).message || 'Failed to send message');
        dispatch({ type: 'error' });
        onError?.(error as Error);
      }
    },
    [cache, dispatch, cleanupFailedStream, handleMetadata, invalidateKeys, reconcilePersistedMessages, recoverTimedOutStream, timers, onComplete, onError]
  );

  /**
   * Cancel the current stream
   */
  const cancel = useCallback(() => {
    timers.clearAll();

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    dispatch({ type: 'cancel' });
  }, [timers, dispatch]);

  /**
   * Retry the last failed message
   */
  const retry = useCallback(() => {
    if (lastParamsRef.current) {
      sendMessage(lastParamsRef.current);
    }
  }, [sendMessage]);

  const failedMessageContent = status === 'error' ? lastParamsRef.current?.content ?? null : null;

  return {
    status,
    isStreaming: status === 'streaming',
    isSending: status === 'sending',
    sendMessage,
    cancel,
    errorMessage,
    failedMessageContent,
    retry,
  };
}
