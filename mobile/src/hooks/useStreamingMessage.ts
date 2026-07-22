/**
 * Streaming Message Hook
 *
 * Handles SSE streaming for AI responses with optimistic updates.
 * Uses react-native-sse for proper SSE support in React Native.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import Constants from 'expo-constants';
import EventSource from 'react-native-sse';
import { getAuthToken, isE2EAuthMode, getE2EAuthHeaders } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  GetMessagesResponse,
  Stage,
  parseStreamEventData,
  type StreamMetadata,
  type StreamEventName,
} from '@meet-without-fear/shared';
import { messageKeys, sessionKeys, stageKeys } from './queryKeys';
import { getPersistedMessageRefreshQueryKeys } from '../utils/realtimeInvalidation';
import { bridgeAnimatedId } from '../utils/animationBridge';

// ============================================================================
// Types
// ============================================================================

/**
 * Structured metadata from the AI's tool call. Defined once in the shared
 * streaming contract (shared/src/contracts/stream.ts); re-exported here for
 * existing consumers of this hook.
 */
export type { StreamMetadata } from '@meet-without-fear/shared';

/** Status of a streaming message */
export type StreamStatus = 'idle' | 'sending' | 'streaming' | 'complete' | 'error';

type CachedStreamingMessage = MessageDTO & {
  status?: 'sending' | 'streaming' | 'sent' | 'error';
};

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

  // Refs for throttled cache updates (reduces stuttering)
  const lastCacheUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CACHE_UPDATE_INTERVAL = 50; // Update cache every 50ms max

  // Ref to track if text_complete was received (for complete event fallback)
  const textCompleteReceivedRef = useRef<boolean>(false);

  // Ref for 15-second fallback timer to handle stuck connections
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SOFT_RECOVERY_TIMEOUT = 15000; // 15 seconds
  const HARD_STREAM_TIMEOUT = 90000; // 90 seconds
  const reconciliationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmount cleanup: an in-flight stream must not outlive the component.
  // Closes the EventSource and clears every pending timer so no socket,
  // timer, or stale identity alias survives (Phase 4 exit criterion; this
  // was a real leak before the chat-modernization work).
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      for (const timerRef of [fallbackTimerRef, hardTimeoutTimerRef, reconciliationTimerRef, pendingUpdateRef]) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };
  }, []);

  /**
   * Add a message to the cache
   */
  const addMessageToCache = useCallback(
    (sessionId: string, message: CachedStreamingMessage, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [message], hasMore: false };
        }
        // Check for duplicates
        const existingIds = new Set((old.messages || []).map((m) => m.id));
        if (existingIds.has(message.id)) {
          // Update existing message (for streaming updates)
          return {
            ...old,
            messages: (old.messages || []).map((m) =>
              m.id === message.id ? message : m
            ),
          };
        }
        return {
          ...old,
          messages: [...(old.messages || []), message],
        };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [message], hasMore: false }],
            pageParams: [undefined],
          };
        }
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        const existingIds = new Set((firstPage.messages || []).map((m) => m.id));

        if (existingIds.has(message.id)) {
          // Update existing message (for streaming updates)
          updatedPages[0] = {
            ...firstPage,
            messages: (firstPage.messages || []).map((m) =>
              m.id === message.id ? message : m
            ),
          };
        } else {
          updatedPages[0] = {
            ...firstPage,
            messages: [...(firstPage.messages || []), message],
          };
        }
        return { ...old, pages: updatedPages };
      };

      // Update caches
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

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
    },
    [queryClient]
  );

  /**
   * Update a message in cache by ID without changing the ID.
   * Used to update optimistic messages with server data while keeping
   * the same ID for React's key reconciliation (prevents visual jumps).
   */
  const updateMessageInCache = useCallback(
    (sessionId: string, messageId: string, updates: Partial<Omit<MessageDTO, 'id'>>, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) return old;
        const messages = old.messages || [];
        const index = messages.findIndex((m) => m.id === messageId);
        if (index === -1) return old;

        const updatedMessages = [...messages];
        updatedMessages[index] = { ...updatedMessages[index], ...updates };
        return { ...old, messages: updatedMessages };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) return old;

        const updatedPages = old.pages.map((page) => {
          const index = (page.messages || []).findIndex((m) => m.id === messageId);
          if (index === -1) return page;

          const updatedMessages = [...(page.messages || [])];
          updatedMessages[index] = { ...updatedMessages[index], ...updates };
          return { ...page, messages: updatedMessages };
        });

        return { ...old, pages: updatedPages };
      };

      // Update caches
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

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
    },
    [queryClient]
  );

  /**
   * Replace a message ID in cache. Used to bridge temporary streaming/optimistic
   * IDs to real server UUIDs before reconciliation, so refetch matches by ID
   * instead of treating messages as new.
   */
  const replaceMessageIdInCache = useCallback(
    (sessionId: string, oldId: string, newId: string, stage?: Stage) => {
      const replaceInPage = (page: GetMessagesResponse): GetMessagesResponse => ({
        ...page,
        messages: (page.messages || []).map((m) =>
          m.id === oldId ? { ...m, id: newId } : m
        ),
      });

      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        (old) => old ? replaceInPage(old) : old
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        (old) => {
          if (!old) return old;
          return { ...old, pages: old.pages.map(replaceInPage) };
        }
      );

      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          (old) => old ? replaceInPage(old) : old
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          (old) => {
            if (!old) return old;
            return { ...old, pages: old.pages.map(replaceInPage) };
          }
        );
      }
    },
    [queryClient]
  );

  /**
   * Remove optimistic/placeholder messages from the cache after a failed stream.
   */
  const removeMessagesFromCache = useCallback(
    (sessionId: string, messageIds: string[], stage?: Stage) => {
      const ids = new Set(messageIds.filter(Boolean));
      if (ids.size === 0) return;

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          messages: (old.messages || []).filter((message) => !ids.has(message.id)),
        };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: (page.messages || []).filter((message) => !ids.has(message.id)),
          })),
        };
      };

      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

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
    },
    [queryClient]
  );

  const cleanupFailedStream = useCallback(
    (sessionId: string, stage?: Stage) => {
      removeMessagesFromCache(
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
    [queryClient, removeMessagesFromCache]
  );

  const invalidateAfterSuccessfulStream = useCallback(
    (sessionId: string, stage?: Stage) => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      if (stage === Stage.PERSPECTIVE_STRETCH) {
        queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }
      if (stage === Stage.NEED_MAPPING) {
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      }
      if (stage === Stage.STRATEGIC_REPAIR) {
        queryClient.invalidateQueries({ queryKey: stageKeys.stage4(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      }
    },
    [queryClient]
  );

  const reconcilePersistedMessages = useCallback(
    (sessionId: string) => {
      if (reconciliationTimerRef.current) {
        clearTimeout(reconciliationTimerRef.current);
        reconciliationTimerRef.current = null;
      }

      for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey });
      }

      reconciliationTimerRef.current = setTimeout(() => {
        for (const queryKey of getPersistedMessageRefreshQueryKeys(sessionId)) {
          queryClient.refetchQueries({ queryKey });
        }
        reconciliationTimerRef.current = null;
      }, 1200);
    },
    [queryClient]
  );

  const recoverTimedOutStream = useCallback(
    (sessionId: string, stage?: Stage) => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }

      // The backend may have persisted the message even if the client-side SSE
      // connection stopped producing events. Pull server truth instead of
      // forcing the user to manually reload the chat.
      reconcilePersistedMessages(sessionId);
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      if (stage === Stage.PERSPECTIVE_STRETCH) {
        queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      }
      if (stage === Stage.NEED_MAPPING) {
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      }
      if (stage === Stage.STRATEGIC_REPAIR) {
        queryClient.invalidateQueries({ queryKey: stageKeys.stage4(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      }

      accumulatedTextRef.current = '';
      aiMessageIdRef.current = '';
      optimisticUserIdRef.current = '';
      activeUserMessageIdRef.current = '';
      realUserIdRef.current = '';
      setStatus('idle');
    },
    [queryClient, reconcilePersistedMessages]
  );

  /**
   * Handle metadata from the AI response
   */
  const handleMetadata = useCallback(
    (sessionId: string, metadata: StreamMetadata) => {
      // Update session state cache for feel-heard check
      // Must update nested path: progress.myProgress.gatesSatisfied.feelHeardCheckOffered
      if (metadata.offerFeelHeardCheck) {
        queryClient.setQueryData(
          sessionKeys.state(sessionId),
          (old: Record<string, unknown> | undefined) => {
            if (!old) return old;
            const progress = old.progress as Record<string, unknown> | undefined;
            const myProgress = progress?.myProgress as Record<string, unknown> | undefined;
            const gates = (myProgress?.gatesSatisfied as Record<string, unknown>) ?? {};
            return {
              ...old,
              progress: {
                ...progress,
                myProgress: {
                  ...myProgress,
                  gatesSatisfied: {
                    ...gates,
                    feelHeardCheckOffered: true,
                  },
                },
              },
            };
          }
        );
      }

      // Update empathy draft cache (must use stageKeys to match useEmpathyDraft reader)
      if (metadata.proposedEmpathyStatement) {
        queryClient.setQueryData(
          stageKeys.empathyDraft(sessionId),
          (old: Record<string, unknown> | undefined) => ({
            ...old,
            draft: {
              ...(old as Record<string, unknown>)?.draft as Record<string, unknown> | undefined,
              content: metadata.proposedEmpathyStatement,
              readyToShare: false,
            },
            canConsent: true,
            alreadyConsented: false,
          })
        );
      }

      if (metadata.proposedNeeds && metadata.proposedNeeds.length > 0) {
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      }

      if (
        metadata.stage4Proposals ||
        metadata.stage4WalkthroughAction ||
        metadata.stage4Capture
      ) {
        queryClient.invalidateQueries({ queryKey: stageKeys.stage4(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
        queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      }

      // NOTE: We intentionally avoid broad invalidation here.
      // Invalidating sessionKeys.state or other queries during streaming causes race conditions:
      // - Optimistic updates (e.g., invitation.messageConfirmedAt) get overwritten
      // - UI elements (indicators, messages) briefly disappear during refetch
      // - The cache-first pattern is violated, causing visual glitches
      //
      // Instead, most updates are done via setQueryData above. Stage 3 needs are
      // an exception because the structured card is persisted server-side.
      // If fresh data is needed, the mutation's onSuccess handler should handle it,
      // or the component can trigger a refetch on mount.

      // Call the onMetadata callback if provided
      onMetadata?.(sessionId, metadata);
    },
    [queryClient, onMetadata]
  );

  /**
   * Send a message with SSE streaming using react-native-sse
   */
  const sendMessage = useCallback(
    async (params: SendStreamingMessageParams) => {
      const { sessionId, content, currentStage, refiningNeedId } = params;

      // Store params for retry
      lastParamsRef.current = params;

      // Close any existing EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Reset state
      setStatus('sending');
      setErrorMessage(null);
      accumulatedTextRef.current = '';
      aiMessageIdRef.current = `streaming-${Date.now()}`;
      optimisticUserIdRef.current = `optimistic-user-${Date.now()}`;
      activeUserMessageIdRef.current = optimisticUserIdRef.current;
      realUserIdRef.current = '';
      textCompleteReceivedRef.current = false;

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
      addMessageToCache(sessionId, optimisticUserMessage, currentStage);

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
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
        }
        fallbackTimerRef.current = setTimeout(() => {
          if (eventSourceRef.current) {
            console.warn('[useStreamingMessage] 15s soft recovery - refetching persisted messages while stream remains open');
            fallbackTimerRef.current = null;
            reconcilePersistedMessages(sessionId);
            queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
            if (currentStage === Stage.PERSPECTIVE_STRETCH) {
              queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
            }
            if (currentStage === Stage.NEED_MAPPING) {
              queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
            }
          }
        }, SOFT_RECOVERY_TIMEOUT);

        if (hardTimeoutTimerRef.current) {
          clearTimeout(hardTimeoutTimerRef.current);
        }
        hardTimeoutTimerRef.current = setTimeout(() => {
          if (eventSourceRef.current) {
            console.warn('[useStreamingMessage] 90s hard timeout - closing stream and recovering persisted messages');
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            hardTimeoutTimerRef.current = null;
            recoverTimedOutStream(sessionId, currentStage);
          }
        }, HARD_STREAM_TIMEOUT);

        // Create placeholder AI message once streaming starts
        let placeholderCreated = false;
        const createPlaceholder = () => {
          if (placeholderCreated) return;
          placeholderCreated = true;
          setStatus('streaming');
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
          addMessageToCache(sessionId, placeholderAIMessage, currentStage);
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
              updateMessageInCache(sessionId, optimisticUserIdRef.current, {
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
              addMessageToCache(sessionId, realUserMessage, currentStage);
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

            // Clear any pending update
            if (pendingUpdateRef.current) {
              clearTimeout(pendingUpdateRef.current);
              pendingUpdateRef.current = null;
            }

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
              addMessageToCache(sessionId, updatedAIMessage, currentStage);
              lastCacheUpdateRef.current = Date.now();
            };

            if (timeSinceLastUpdate >= CACHE_UPDATE_INTERVAL) {
              // Enough time has passed, update immediately
              updateCache();
            } else {
              // Schedule update for when the interval is reached
              pendingUpdateRef.current = setTimeout(
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

          // Clear fallback timer since streaming completed successfully
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }

          // Clear any pending throttled update
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

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
            addMessageToCache(sessionId, finalAIMessage, currentStage);

            // Handle metadata for UI panels (invitation, empathy, etc.)
            if (data.metadata) {
              console.log(`[useStreamingMessage] [TIMING] Calling handleMetadata at ${Date.now()}`);
              handleMetadata(sessionId, data.metadata);
              console.log(`[useStreamingMessage] [TIMING] handleMetadata returned at ${Date.now()}`);
            }

            // Refresh empathy status after streaming completes during Stage 2
            // This picks up messageCountSinceSharedContext and other server-side state
            // that changes when user sends messages during REFINING
            if (currentStage === Stage.PERSPECTIVE_STRETCH) {
              queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
            }
            if (currentStage === Stage.NEED_MAPPING) {
              invalidateAfterSuccessfulStream(sessionId, currentStage);
            }

            // Mark streaming as complete - cursor stops immediately
            textCompleteReceivedRef.current = true;
            setStatus('complete');
            onComplete?.();
            console.log(`[useStreamingMessage] [TIMING] text_complete handler done at ${Date.now()}`);
          }
        });

        // Handle complete event - DB saves finished, close connection
        // The streaming UI has already stopped via text_complete
        es.addEventListener('complete', (event) => {
          // Clear any pending throttled update (in case text_complete wasn't received)
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          if (hardTimeoutTimerRef.current) {
            clearTimeout(hardTimeoutTimerRef.current);
            hardTimeoutTimerRef.current = null;
          }
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

          const data = event.data ? parseStreamEventData('complete', event.data) : null;
          if (event.data && !data) {
            console.error('[useStreamingMessage] Dropping invalid complete frame');
          }
          if (data) {
            {
              handleMetadata(sessionId, data.metadata);

              // Bridge temporary IDs to real server IDs before reconciliation.
              // This prevents ChatInterface from re-animating messages whose IDs
              // change from streaming placeholders to real UUIDs during refetch.
              if (data.messageId && aiMessageIdRef.current.startsWith('streaming-')) {
                bridgeAnimatedId(aiMessageIdRef.current, data.messageId);
                replaceMessageIdInCache(sessionId, aiMessageIdRef.current, data.messageId, currentStage);
                aiMessageIdRef.current = data.messageId;
              }
              if (realUserIdRef.current && activeUserMessageIdRef.current.startsWith('optimistic-user-')) {
                bridgeAnimatedId(activeUserMessageIdRef.current, realUserIdRef.current);
                replaceMessageIdInCache(sessionId, activeUserMessageIdRef.current, realUserIdRef.current, currentStage);
                updateMessageInCache(sessionId, realUserIdRef.current, { status: 'sent' } as Partial<CachedStreamingMessage>, currentStage);
                activeUserMessageIdRef.current = realUserIdRef.current;
              }

              reconcilePersistedMessages(sessionId);

              // If text_complete wasn't received (fallback), handle completion here
              if (!textCompleteReceivedRef.current) {
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
                addMessageToCache(sessionId, finalAIMessage, currentStage);

                // Refresh empathy status (fallback path)
                if (currentStage === Stage.PERSPECTIVE_STRETCH) {
                  queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
                }
                if (currentStage === Stage.NEED_MAPPING) {
                  invalidateAfterSuccessfulStream(sessionId, currentStage);
                }

                setStatus('complete');
                onComplete?.();
              }
            }
          }

          // Close the EventSource
          es.close();
          eventSourceRef.current = null;
        });

        // Handle error event from SSE
        // react-native-sse error events have: ErrorEvent (message, xhrState, xhrStatus),
        // TimeoutEvent (type only), or ExceptionEvent (message, error)
        es.addEventListener('error', (event) => {
          // Clear fallback timer since we're handling error
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          if (hardTimeoutTimerRef.current) {
            clearTimeout(hardTimeoutTimerRef.current);
            hardTimeoutTimerRef.current = null;
          }
          if (reconciliationTimerRef.current) {
            clearTimeout(reconciliationTimerRef.current);
            reconciliationTimerRef.current = null;
          }

          // Clear any pending throttled update
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }

          const errorMsg = 'message' in event ? event.message : 'Connection error';
          console.error('[useStreamingMessage] SSE error:', errorMsg);
          cleanupFailedStream(sessionId, currentStage);
          setErrorMessage(errorMsg);
          setStatus('error');
          onError?.(new Error(errorMsg));
          es.close();
          eventSourceRef.current = null;
        });

        // Handle open event
        es.addEventListener('open', () => {
          // Connection opened, waiting for events
        });

      } catch (error) {
        if (reconciliationTimerRef.current) {
          clearTimeout(reconciliationTimerRef.current);
          reconciliationTimerRef.current = null;
        }
        if (hardTimeoutTimerRef.current) {
          clearTimeout(hardTimeoutTimerRef.current);
          hardTimeoutTimerRef.current = null;
        }
        console.error('[useStreamingMessage] Error:', error);
        cleanupFailedStream(sessionId, currentStage);
        setErrorMessage((error as Error).message || 'Failed to send message');
        setStatus('error');
        onError?.(error as Error);
      }
    },
    [addMessageToCache, updateMessageInCache, cleanupFailedStream, handleMetadata, invalidateAfterSuccessfulStream, reconcilePersistedMessages, recoverTimedOutStream, queryClient, onComplete, onError]
  );

  /**
   * Cancel the current stream
   */
  const cancel = useCallback(() => {
    // Clear fallback timer
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (hardTimeoutTimerRef.current) {
      clearTimeout(hardTimeoutTimerRef.current);
      hardTimeoutTimerRef.current = null;
    }
    if (reconciliationTimerRef.current) {
      clearTimeout(reconciliationTimerRef.current);
      reconciliationTimerRef.current = null;
    }

    // Clear any pending throttled update
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('idle');
  }, []);

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
