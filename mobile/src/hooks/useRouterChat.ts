/**
 * useRouterChat Hook
 *
 * Manages the chat-first interface for session creation and navigation.
 * Adapts the unified chat router API to work with the existing ChatInterface
 * component that expects MessageDTO format.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { post, get } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  Stage,
  SendUnifiedChatRequest,
  SendUnifiedChatResponse,
  GetChatContextResponse,
} from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

export interface UseRouterChatOptions {
  /** Called when a new session is created */
  onSessionCreated?: (sessionId: string) => void;
}

export interface UseRouterChatReturn {
  /** Messages in MessageDTO format for ChatInterface */
  messages: MessageDTO[];
  /** Whether a message is being sent */
  isSending: boolean;
  /** Whether context is loading */
  isLoading: boolean;
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
  const [messages, setMessages] = useState<MessageDTO[]>([]);

  // Fetch initial context to check for pending creation
  const { isLoading } = useQuery({
    queryKey: ['chat', 'context'],
    queryFn: async () => {
      const response = await get<GetChatContextResponse>('/chat/context');
      return response;
    },
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const request: SendUnifiedChatRequest = { content };
      return await post<SendUnifiedChatResponse>('/chat/message', request);
    },
    onSuccess: (response) => {
      // Convert response to MessageDTO format
      const userMessage: MessageDTO = {
        id: response.userMessage.id,
        sessionId: response.sessionChange?.sessionId || ROUTER_SESSION_ID,
        senderId: 'user', // Current user
        role: MessageRole.USER,
        content: response.userMessage.content,
        stage: Stage.ONBOARDING,
        timestamp: response.userMessage.timestamp,
      };

      const assistantMessage: MessageDTO = {
        id: response.assistantResponse.id,
        sessionId: response.sessionChange?.sessionId || ROUTER_SESSION_ID,
        senderId: null,
        role: MessageRole.AI,
        content: response.assistantResponse.content,
        stage: Stage.ONBOARDING,
        timestamp: response.assistantResponse.timestamp,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      // If a session was created, notify and navigate
      if (response.sessionChange?.type === 'created') {
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
  });

  const sendMessage = useCallback(
    async (content: string) => {
      await sendMutation.mutateAsync(content);
    },
    [sendMutation]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Cancel any pending creation
    post('/chat/cancel').catch(() => {});
  }, []);

  return {
    messages,
    isSending: sendMutation.isPending,
    isLoading,
    sendMessage,
    clearMessages,
  };
}
