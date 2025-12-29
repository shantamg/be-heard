/**
 * useRouterChat Hook
 *
 * Manages the chat-first interface for session creation and navigation.
 * Adapts the unified chat router API to work with the existing ChatInterface
 * component that expects MessageDTO format.
 *
 * Uses optimistic updates to show user messages immediately while waiting
 * for the AI response.
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { post, get } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  Stage,
  SendUnifiedChatRequest,
  SendUnifiedChatResponse,
  GetChatContextResponse,
} from '@meet-without-fear/shared';
import type { ChatMessage } from '../components/ChatInterface';

// ============================================================================
// Types
// ============================================================================

export interface UseRouterChatOptions {
  /** Called when a new session is created */
  onSessionCreated?: (sessionId: string) => void;
}

export interface UseRouterChatReturn {
  /** Messages in ChatMessage format for ChatInterface (includes delivery status) */
  messages: ChatMessage[];
  /** Whether a message is being sent */
  isSending: boolean;
  /** Whether context is loading */
  isLoading: boolean;
  /** AI-generated welcome message based on recent activity */
  welcomeMessage?: string;
  /** Send a message through the router */
  sendMessage: (content: string) => Promise<void>;
  /** Clear the conversation */
  clearMessages: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const ROUTER_SESSION_ID = 'router';

// ============================================================================
// Hook
// ============================================================================

export function useRouterChat(options: UseRouterChatOptions = {}): UseRouterChatReturn {
  const { onSessionCreated } = options;
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Track optimistic message ID so we can update it when response arrives
  const optimisticIdRef = useRef<string | null>(null);

  // Track current session ID after switching
  const currentSessionIdRef = useRef<string | null>(null);

  // Fetch initial context to check for pending creation and get welcome message
  const { isLoading, data: contextData } = useQuery({
    queryKey: ['chat', 'context'],
    queryFn: async () => {
      const response = await get<GetChatContextResponse>('/chat/context');
      return response;
    },
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const request: SendUnifiedChatRequest = {
        content,
        currentSessionId: currentSessionIdRef.current || undefined,
      };
      return await post<SendUnifiedChatResponse>('/chat/message', request);
    },
    onMutate: async (content: string) => {
      // Create optimistic user message with 'sending' status
      const optimisticId = `optimistic-${Date.now()}`;
      optimisticIdRef.current = optimisticId;

      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        sessionId: ROUTER_SESSION_ID,
        senderId: 'user',
        role: MessageRole.USER,
        content,
        stage: Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
        status: 'sending',
      };

      // Add optimistic message immediately
      setMessages((prev) => [...prev, optimisticMessage]);

      return { optimisticId };
    },
    onSuccess: (response, _content, context) => {
      // Replace optimistic message with real user message, add AI response
      const userMessage: ChatMessage = {
        id: response.userMessage.id,
        sessionId: response.sessionChange?.sessionId || ROUTER_SESSION_ID,
        senderId: 'user',
        role: MessageRole.USER,
        content: response.userMessage.content,
        stage: Stage.ONBOARDING,
        timestamp: response.userMessage.timestamp,
        status: 'sent',
      };

      const assistantMessage: ChatMessage = {
        id: response.assistantResponse.id,
        sessionId: response.sessionChange?.sessionId || ROUTER_SESSION_ID,
        senderId: null,
        role: MessageRole.AI,
        content: response.assistantResponse.content,
        stage: Stage.ONBOARDING,
        timestamp: response.assistantResponse.timestamp,
      };

      setMessages((prev) => {
        // Remove the optimistic message and add the real messages
        const withoutOptimistic = prev.filter(
          (m) => m.id !== context?.optimisticId
        );
        return [...withoutOptimistic, userMessage, assistantMessage];
      });

      optimisticIdRef.current = null;

      // Track session switches to maintain context
      if (response.sessionChange?.type === 'switched') {
        currentSessionIdRef.current = response.sessionChange.sessionId;
      }

      // If a session was created, notify and navigate
      if (response.sessionChange?.type === 'created') {
        // Track the new session
        currentSessionIdRef.current = response.sessionChange.sessionId;

        // Invalidate queries to refresh session lists
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['chat', 'context'] });

        // Notify parent after a short delay to show success message
        if (onSessionCreated) {
          setTimeout(() => {
            onSessionCreated(response.sessionChange!.sessionId);
          }, 1500);
        }
      }
    },
    onError: (_error, _content, context) => {
      // Update optimistic message to show error status
      if (context?.optimisticId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === context.optimisticId
              ? { ...m, status: 'error' as const }
              : m
          )
        );
      }
      optimisticIdRef.current = null;
    },
  });

  const sendMessage = useCallback(
    async (content: string) => {
      await sendMutation.mutateAsync(content);
    },
    [sendMutation]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    optimisticIdRef.current = null;
    currentSessionIdRef.current = null;
    // Cancel any pending creation
    post('/chat/cancel').catch(() => {});
  }, []);

  return {
    messages,
    isSending: sendMutation.isPending,
    isLoading,
    welcomeMessage: contextData?.welcomeMessage,
    sendMessage,
    clearMessages,
  };
}
