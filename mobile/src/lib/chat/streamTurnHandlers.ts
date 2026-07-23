/**
 * Handlers for one streaming turn.
 *
 * These are the bodies that used to live inline inside `sendMessage`, closing
 * over that function's locals. Inline, they were unreachable from a test
 * without mounting the hook and driving a mock EventSource, and the turn's
 * mutable state was invisible — it was just whatever refs happened to be in
 * scope.
 *
 * The state is now an explicit parameter. That is the whole point of the
 * extraction: what a turn mutates is declared in `StreamTurnRefs` instead of
 * being implied by closure capture.
 *
 * Refs rather than a plain object, deliberately: the same refs are read by the
 * hook's recovery and cleanup paths, so the sharing has to be by identity. A
 * copied snapshot would silently desynchronise from the turn it describes.
 */

import type { MutableRefObject } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { MessageDTO, MessageRole, Stage, type StreamMetadata } from '@meet-without-fear/shared';
import { bridgeAnimatedId } from '../../utils/animationBridge';
import type { CachedStreamingMessage, MessageCacheAdapter } from './messageCacheAdapter';
import type { StreamTimers } from './streamTimers';
import { textCompleteInvalidationKeys } from './streamInvalidation';
import { needsCompletionFallback, type StreamLifecycleEvent, type StreamLifecycleState } from './streamLifecycle';
import type { StreamTransportHandlers } from './streamTransport';

/** Longest gap between cache writes while chunks arrive. */
const CACHE_UPDATE_INTERVAL = 50;

/** Mutable state a turn advances. Shared by identity with the hook. */
export interface StreamTurnRefs {
  /** Text accumulated across chunk frames. */
  accumulatedText: MutableRefObject<string>;
  /** Placeholder id until `complete` bridges it to the server id. */
  aiMessageId: MutableRefObject<string>;
  /** Optimistic user id, cleared once the server echoes the message. */
  optimisticUserId: MutableRefObject<string>;
  /** Whichever user id currently identifies the row on screen. */
  activeUserMessageId: MutableRefObject<string>;
  /** Server id from `user_message`, used for ID bridging at completion. */
  realUserId: MutableRefObject<string>;
  /** Timestamp of the last cache write, for throttling. */
  lastCacheUpdate: MutableRefObject<number>;
  /** Synchronous lifecycle truth; handlers branch on it within a tick. */
  lifecycle: MutableRefObject<StreamLifecycleState>;
}

export interface StreamTurnContext {
  sessionId: string;
  currentStage?: Stage;
  refiningNeedId?: string | null;
  refs: StreamTurnRefs;
  cache: MessageCacheAdapter;
  timers: StreamTimers;
  dispatch: (event: StreamLifecycleEvent) => StreamLifecycleState;
  handleMetadata: (sessionId: string, metadata: StreamMetadata) => void;
  invalidateKeys: (queryKeys: readonly QueryKey[]) => void;
  reconcilePersistedMessages: (sessionId: string) => void;
  cleanupFailedStream: (sessionId: string, stage?: Stage) => void;
  setErrorMessage: (message: string | null) => void;
  /** Closes this turn's transport. Idempotent. */
  closeTransport: () => void;
  /**
   * Whether this turn still owns the shared state.
   *
   * Every ref, the timer registry and the caches are singletons shared with
   * the hook, so a late frame from a superseded turn would otherwise clear the
   * current turn's timers, rewrite its ids, and drive its lifecycle to a
   * terminal phase. Transport identity alone cannot prevent that: by the time
   * `closeTransport` declines to touch a newer transport, the handler body has
   * already done the damage. Ownership is therefore checked FIRST in every
   * handler.
   */
  isCurrent: () => boolean;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function createStreamTurnHandlers(ctx: StreamTurnContext): StreamTransportHandlers {
  const {
    isCurrent,
    sessionId,
    currentStage,
    refiningNeedId,
    refs,
    cache,
    timers,
    dispatch,
    handleMetadata,
    invalidateKeys,
    reconcilePersistedMessages,
    cleanupFailedStream,
    setErrorMessage,
    closeTransport,
    onComplete,
    onError,
  } = ctx;

  // The AI placeholder appears on the first validated chunk, once per turn.
  let placeholderCreated = false;
  const createPlaceholder = () => {
    if (placeholderCreated) return;
    placeholderCreated = true;
    dispatch({ type: 'chunk' });
    const placeholderAIMessage: CachedStreamingMessage = {
      id: refs.aiMessageId.current,
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

  return {
    // Update the optimistic message with server data, keeping the same ID
    // so React does not remount the row and make it visually jump.
    user_message: (data) => {
      // A superseded turn must not touch shared state. See `isCurrent`.
      if (!isCurrent()) return;
      {
        refs.realUserId.current = data.id; // Store for ID bridging at completion
        // Update optimistic message with server timestamp (keep same ID for React key stability)
        if (refs.optimisticUserId.current) {
          refs.activeUserMessageId.current = refs.optimisticUserId.current;
          cache.update(sessionId, refs.optimisticUserId.current, {
            timestamp: data.timestamp,
            content: data.content, // In case server modified content
            refiningNeedId: data.refiningNeedId ?? null,
          }, currentStage);
          refs.optimisticUserId.current = ''; // Clear after update
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
    },

    // Throttled cache updates, to keep the reveal from stuttering.
    //
    // BEHAVIOUR CHANGE (deliberate, flagged for review): the placeholder
    // used to be created before the frame was validated, so a frame that
    // was about to be dropped still pushed an empty AI bubble into the
    // cache and moved the lifecycle to `streaming`. That is unvalidated
    // data mutating state, which this program explicitly disallows. The
    // placeholder now appears only once a frame has passed the schema.
    // Observable only if every chunk of a turn is invalid; a single valid
    // chunk produces the same result as before.
    chunk: (data) => {
      // A superseded turn must not touch shared state. See `isCurrent`.
      if (!isCurrent()) return;
      createPlaceholder();
      {
        refs.accumulatedText.current += data.text;

        // Throttle cache updates to reduce stuttering
        const now = Date.now();
        const timeSinceLastUpdate = now - refs.lastCacheUpdate.current;

        timers.clear('throttledCacheUpdate');

        const updateCache = () => {
          const updatedAIMessage: CachedStreamingMessage = {
            id: refs.aiMessageId.current,
            sessionId,
            senderId: null,
            role: MessageRole.AI,
            content: refs.accumulatedText.current,
            stage: currentStage ?? Stage.ONBOARDING,
            timestamp: new Date().toISOString(),
            refiningNeedId: refiningNeedId ?? null,
            status: 'streaming',
          };
          cache.add(sessionId, updatedAIMessage, currentStage);
          refs.lastCacheUpdate.current = Date.now();
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
    },

    // Tool call received mid-stream. Applied immediately so panels
    // (invitation, empathy) open while text is still arriving.
    metadata: (data) => {
      // A superseded turn must not touch shared state. See `isCurrent`.
      if (!isCurrent()) return;
      {
        console.log(`[useStreamingMessage] [TIMING] metadata event received at ${Date.now()}`);

        // Handle metadata for UI panels immediately
        handleMetadata(sessionId, data.metadata);
      }
    },

    // Streaming text is done, but the DB writes are not. Stops the blinking
    // cursor without waiting for persistence to confirm.
    //
    // BEHAVIOUR CHANGE (deliberate, flagged for review): the recovery
    // timers used to be cleared before this frame was validated, so an
    // invalid text_complete disarmed recovery for a turn that had not
    // actually completed. They are now cleared only once the frame parses,
    // which is what recovery is for.
    text_complete: (data) => {
      // A superseded turn must not touch shared state. See `isCurrent`.
      if (!isCurrent()) return;
      console.log(`[useStreamingMessage] [TIMING] text_complete received at ${Date.now()}`);

      // Streaming completed, so the soft recovery timer and any pending
      // throttled write are moot. The hard timeout stays armed until the
      // complete event confirms persistence.
      timers.clear('softRecovery', 'throttledCacheUpdate');

      {
        console.log(`[useStreamingMessage] [TIMING] text_complete parsed`);

        // Update cache with final content
        const finalAIMessage: CachedStreamingMessage = {
          id: refs.aiMessageId.current,
          sessionId,
          senderId: null,
          role: MessageRole.AI,
          content: refs.accumulatedText.current,
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
    },

    // DB saves finished; close the connection. The streaming UI already
    // stopped at text_complete. `data` is null when the frame carried no
    // valid payload — the turn still has to be closed out either way.
    complete: (data) => {
      // Terminal frame: always close THIS turn's transport, even when
      // superseded. `closeTransport` is idempotent and identity-safe, so it
      // cannot touch a newer turn's socket — and skipping it would strand this
      // turn's socket open.
      if (!isCurrent()) {
        closeTransport();
        return;
      }
      // The turn is done. Reconciliation is deliberately left alone: the
      // reconcilePersistedMessages call below re-arms it, and clearing it
      // here would only cancel a timer we are about to replace.
      timers.clear('softRecovery', 'hardTimeout', 'throttledCacheUpdate');

      // `handleMetadata` invokes the caller-supplied `onMetadata`, and
      // `onComplete` is caller-supplied too. Either can throw. The finally
      // guarantees the socket closes regardless — the recovery timers have
      // just been disarmed, so nothing else would ever close it.
      try {
      if (data) {
        // Read the fallback decision before the terminal transition below.
        const needsFallback = needsCompletionFallback(refs.lifecycle.current);
        {
          handleMetadata(sessionId, data.metadata);

          // Bridge temporary IDs to real server IDs before reconciliation.
          // This prevents ChatInterface from re-animating messages whose IDs
          // change from streaming placeholders to real UUIDs during refetch.
          if (data.messageId && refs.aiMessageId.current.startsWith('streaming-')) {
            bridgeAnimatedId(refs.aiMessageId.current, data.messageId);
            cache.replaceId(sessionId, refs.aiMessageId.current, data.messageId, currentStage);
            refs.aiMessageId.current = data.messageId;
          }
          if (refs.realUserId.current && refs.activeUserMessageId.current.startsWith('optimistic-user-')) {
            bridgeAnimatedId(refs.activeUserMessageId.current, refs.realUserId.current);
            cache.replaceId(sessionId, refs.activeUserMessageId.current, refs.realUserId.current, currentStage);
            cache.update(sessionId, refs.realUserId.current, { status: 'sent' } as Partial<CachedStreamingMessage>, currentStage);
            refs.activeUserMessageId.current = refs.realUserId.current;
          }

          reconcilePersistedMessages(sessionId);

          // If text_complete wasn't received (fallback), handle completion here
          if (needsFallback) {
            const finalAIMessage: CachedStreamingMessage = {
              id: refs.aiMessageId.current,
              sessionId,
              senderId: null,
              role: MessageRole.AI,
              content: refs.accumulatedText.current,
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
      } finally {
        closeTransport();
      }
    },

    // Transport failure (ErrorEvent / TimeoutEvent / ExceptionEvent), not a
    // protocol error frame.
    error: (errorMsg) => {
      // Terminal frame: close this turn's transport regardless of ownership,
      // for the same reason as `complete`.
      if (!isCurrent()) {
        closeTransport();
        return;
      }
      // The turn failed; nothing scheduled for it should still run.
      timers.clearAll();

      // `onError` is caller-supplied and may throw. Without the finally, a
      // throwing callback would leave this socket open forever with its
      // recovery timers already disarmed — the worst combination.
      try {
        console.error('[useStreamingMessage] SSE error:', errorMsg);
        cleanupFailedStream(sessionId, currentStage);
        setErrorMessage(errorMsg);
        dispatch({ type: 'error' });
        onError?.(new Error(errorMsg));
      } finally {
        closeTransport();
      }
    },
  };
}
