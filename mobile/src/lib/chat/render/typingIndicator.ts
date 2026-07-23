/**
 * Pure typing-indicator derivation.
 *
 * The indicator is never a boolean the sender flips. It is read back out of the
 * transcript: if the newest chat-flow turn is the user's, the assistant owes a
 * reply and the dots are showing. That is what makes the indicator survive a
 * remount, a refetch, and a partner's realtime update without any local flag to
 * get out of sync (see the cache-first rules in CLAUDE.md).
 *
 * Two details are load-bearing:
 *
 * - "Newest" means newest *by timestamp*, not last in the array. Synthetic rows
 *   (empathy statements, shared context) are appended at the end of the message
 *   list while carrying older timestamps; reading array position would hide the
 *   indicator the moment a partner shared something.
 * - Only USER and AI turns count. Everything else is transcript furniture and
 *   says nothing about whose turn it is.
 */

import { MessageRole } from '@meet-without-fear/shared';
import type { ChatMessage } from './types';

/**
 * How long the indicator is held back while the user's own turn is still in
 * flight, so it does not flash under a bubble that is itself still animating in.
 */
export const TYPING_INDICATOR_DELAY_MS = 420;

/** Prefix of the client-side id given to a user turn before the server sees it. */
const OPTIMISTIC_USER_ID_PREFIX = 'optimistic-user-';

/**
 * The newest USER or AI turn by timestamp, or null when the transcript has no
 * chat-flow turns yet. Ties resolve to the later element, matching how a reply
 * that shares a timestamp with its prompt is treated as the newer turn.
 */
export function selectNewestChatFlowMessage(messages: ChatMessage[]): ChatMessage | null {
  let newest: ChatMessage | null = null;
  let newestTime = 0;

  for (const message of messages) {
    if (message.role !== MessageRole.USER && message.role !== MessageRole.AI) continue;
    const time = new Date(message.timestamp).getTime();
    if (time >= newestTime) {
      newestTime = time;
      newest = message;
    }
  }

  return newest;
}

export interface TypingIndicatorState {
  /** The turn the decision was read from, for callers that need its status. */
  newestChatFlowMessage: ChatMessage | null;
  /** Derived: the newest chat-flow turn is the user's, so the AI owes a reply. */
  isWaitingForAI: boolean;
  /** Whether the indicator belongs on screen at all. */
  showTypingIndicator: boolean;
  /**
   * Whether showing it should be held back by TYPING_INDICATOR_DELAY_MS. True
   * only while the user's own turn is still in flight and no explicit loading
   * state was passed.
   */
  shouldDelay: boolean;
}

/**
 * Derive the whole indicator state from the transcript.
 *
 * `isLoading` remains supported for non-message loading (initial fetch,
 * confirmation flows) and, when set, both forces the indicator on and skips the
 * delay — an explicit load is not the user's own turn animating in.
 */
export function deriveTypingIndicatorState(
  messages: ChatMessage[],
  { isLoading = false }: { isLoading?: boolean } = {},
): TypingIndicatorState {
  const newestChatFlowMessage = selectNewestChatFlowMessage(messages);
  const isWaitingForAI = newestChatFlowMessage?.role === MessageRole.USER;

  const shouldDelay =
    isWaitingForAI &&
    !isLoading &&
    (newestChatFlowMessage?.status === 'sending' ||
      newestChatFlowMessage?.id.startsWith(OPTIMISTIC_USER_ID_PREFIX) === true);

  return {
    newestChatFlowMessage,
    isWaitingForAI,
    showTypingIndicator: isLoading || isWaitingForAI,
    shouldDelay,
  };
}
