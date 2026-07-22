/**
 * Message Cache Adapter
 *
 * The single typed seam between the streaming client and the React Query
 * message caches. Extracted (behavior-preserving) from `useStreamingMessage`.
 *
 * Every operation writes the same four keys the chat reads from — the
 * unscoped list/infinite pair and, when a stage is known, the stage-scoped
 * pair — so the visible timeline and any stage-filtered view stay in step.
 *
 * This module is a plain factory over a QueryClient: no React, no hooks, so
 * cache behavior can be tested directly.
 */

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { GetMessagesResponse, MessageDTO, Stage } from '@meet-without-fear/shared';
import { messageKeys } from '../../hooks/queryKeys';

/** A message plus its client-side delivery status while streaming. */
export type CachedStreamingMessage = MessageDTO & {
  status?: 'sending' | 'streaming' | 'sent' | 'error';
};

type PageUpdater = (old: GetMessagesResponse | undefined) => GetMessagesResponse | undefined;
type InfiniteUpdater = (
  old: InfiniteData<GetMessagesResponse> | undefined
) => InfiniteData<GetMessagesResponse> | undefined;

export interface MessageCacheAdapter {
  /** Insert a message, or replace it wholesale when the ID already exists. */
  add(sessionId: string, message: CachedStreamingMessage, stage?: Stage): void;
  /** Patch fields of an existing message, keeping its ID (no React key churn). */
  update(
    sessionId: string,
    messageId: string,
    updates: Partial<Omit<CachedStreamingMessage, 'id'>>,
    stage?: Stage
  ): void;
  /** Re-key a message from a temporary ID to its server ID, in place. */
  replaceId(sessionId: string, oldId: string, newId: string, stage?: Stage): void;
  /** Drop messages by ID (rollback of optimistic/placeholder rows). */
  remove(sessionId: string, messageIds: string[], stage?: Stage): void;
}

export function createMessageCacheAdapter(queryClient: QueryClient): MessageCacheAdapter {
  /**
   * Apply a list updater and its infinite-list counterpart to the unscoped
   * keys and, when a stage is given, the stage-scoped keys.
   */
  function writeAll(
    sessionId: string,
    stage: Stage | undefined,
    updateList: PageUpdater,
    updateInfinite: InfiniteUpdater
  ): void {
    queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId), updateList);
    queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
      messageKeys.infinite(sessionId),
      updateInfinite
    );

    if (stage !== undefined) {
      queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId, stage), updateList);
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId, stage),
        updateInfinite
      );
    }
  }

  return {
    add(sessionId, message, stage) {
      const updateList: PageUpdater = (old) => {
        if (!old) {
          return { messages: [message], hasMore: false };
        }
        const existingIds = new Set((old.messages || []).map((m) => m.id));
        if (existingIds.has(message.id)) {
          // Update existing message (for streaming updates)
          return {
            ...old,
            messages: (old.messages || []).map((m) => (m.id === message.id ? message : m)),
          };
        }
        return {
          ...old,
          messages: [...(old.messages || []), message],
        };
      };

      const updateInfinite: InfiniteUpdater = (old) => {
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
          updatedPages[0] = {
            ...firstPage,
            messages: (firstPage.messages || []).map((m) => (m.id === message.id ? message : m)),
          };
        } else {
          updatedPages[0] = {
            ...firstPage,
            messages: [...(firstPage.messages || []), message],
          };
        }
        return { ...old, pages: updatedPages };
      };

      writeAll(sessionId, stage, updateList, updateInfinite);
    },

    update(sessionId, messageId, updates, stage) {
      const updateList: PageUpdater = (old) => {
        if (!old) return old;
        const messages = old.messages || [];
        const index = messages.findIndex((m) => m.id === messageId);
        if (index === -1) return old;

        const updatedMessages = [...messages];
        updatedMessages[index] = { ...updatedMessages[index], ...updates };
        return { ...old, messages: updatedMessages };
      };

      const updateInfinite: InfiniteUpdater = (old) => {
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

      writeAll(sessionId, stage, updateList, updateInfinite);
    },

    replaceId(sessionId, oldId, newId, stage) {
      const replaceInPage = (page: GetMessagesResponse): GetMessagesResponse => ({
        ...page,
        messages: (page.messages || []).map((m) => (m.id === oldId ? { ...m, id: newId } : m)),
      });

      const updateList: PageUpdater = (old) => (old ? replaceInPage(old) : old);
      const updateInfinite: InfiniteUpdater = (old) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map(replaceInPage) };
      };

      writeAll(sessionId, stage, updateList, updateInfinite);
    },

    remove(sessionId, messageIds, stage) {
      const ids = new Set(messageIds.filter(Boolean));
      if (ids.size === 0) return;

      const updateList: PageUpdater = (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: (old.messages || []).filter((message) => !ids.has(message.id)),
        };
      };

      const updateInfinite: InfiniteUpdater = (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: (page.messages || []).filter((message) => !ids.has(message.id)),
          })),
        };
      };

      writeAll(sessionId, stage, updateList, updateInfinite);
    },
  };
}
