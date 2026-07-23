/**
 * Pure chat-item assembly and chronological ordering.
 *
 * The transcript is a single chronological stream built from four independent
 * server-derived sources (messages, indicators, validation cards, custom cards)
 * plus one synthetic empty-state row. Ordering is behaviourally load-bearing:
 * the animation queue's "user already replied" guard depends on messages
 * keeping exact chronological order, and sticky stage-chapter headers depend on
 * indicators sorting above same-moment content.
 *
 * This module contains no React and no side effects.
 */

import {
  ChatCustomCardItem,
  ChatIndicatorItem,
  ChatListItem,
  ChatMessage,
  ChatValidationCardItem,
  CUSTOM_EMPTY_STATE_ITEM_ID,
  isCustomCard,
  isIndicator,
  isValidationCard,
} from './types';

/** Items whose timestamps land within this window are ordered by kind, not time. */
export const SAME_MOMENT_WINDOW_MS = 1000;

/**
 * Rank used to order items that share (approximately) the same timestamp.
 * Lower ranks render above higher ones.
 */
export function getSameMomentSortRank(item: ChatListItem): number {
  if (isIndicator(item)) {
    switch (item.indicatorType) {
      case 'invitation-sent':
      case 'invitation-accepted':
      case 'feel-heard':
        return 0;
      case 'stage-chapter':
        return 1;
      default:
        return 1;
    }
  }

  // Validation cards should appear before the same-moment AI explanation so
  // the user sees the thing being reviewed first, then the framing text.
  if (isValidationCard(item)) return 1.5;
  if (isCustomCard(item)) return 3;
  return 2;
}

function getItemTime(item: ChatListItem): number {
  return 'timestamp' in item && item.timestamp ? new Date(item.timestamp).getTime() : 0;
}

/**
 * Total ordering over transcript items. Exported so ordering can be tested
 * pair-by-pair independently of list assembly.
 */
export function compareChatItems(a: ChatListItem, b: ChatListItem): number {
  const aTime = getItemTime(a);
  const bTime = getItemTime(b);

  // Primary sort: Time (oldest first). Chat messages must keep exact
  // chronological order; otherwise a fast AI reply can land before the
  // user message that triggered it and get suppressed by the animation
  // queue's "user already replied" guard.
  const timeDiff = aTime - bTime;

  const rankDiff = getSameMomentSortRank(a) - getSameMomentSortRank(b);
  if (Math.abs(timeDiff) <= SAME_MOMENT_WINDOW_MS && rankDiff !== 0) return rankDiff;
  if (timeDiff !== 0) return timeDiff;

  // For items within 1 second: indicators should appear above messages at
  // the same time.
  const aIsIndicator = isIndicator(a);
  const bIsIndicator = isIndicator(b);
  if (aIsIndicator && !bIsIndicator) return -1;
  if (bIsIndicator && !aIsIndicator) return 1;

  // Validation cards should appear ABOVE messages at the same time.
  // The follow-up AI copy explains the card after the user sees it.
  const aIsValidation = isValidationCard(a);
  const bIsValidation = isValidationCard(b);
  if (aIsValidation && !bIsValidation) return -1;
  if (bIsValidation && !aIsValidation) return 1;

  // Custom cards should appear below the prompt/message that introduced them.
  const aIsCustomCard = isCustomCard(a);
  const bIsCustomCard = isCustomCard(b);
  if (aIsCustomCard && !bIsCustomCard) return 1;
  if (bIsCustomCard && !aIsCustomCard) return -1;

  // Fallback: ID comparison for stability
  return a.id.localeCompare(b.id);
}

export interface AssembleChatItemsInput {
  messages: ChatMessage[];
  indicators?: ChatIndicatorItem[];
  validationCards?: ChatValidationCardItem[];
  customCards?: ChatCustomCardItem[];
  /**
   * Whether the caller supplied a custom empty-state element. When there are no
   * messages the synthetic empty-state row is appended last so it lands below
   * any invitation indicators.
   */
  hasCustomEmptyState?: boolean;
}

/**
 * Build the ordered transcript. Never mutates its inputs.
 */
export function assembleChatItems({
  messages,
  indicators,
  validationCards,
  customCards,
  hasCustomEmptyState = false,
}: AssembleChatItemsInput): ChatListItem[] {
  const items: ChatListItem[] = [
    ...messages,
    ...(indicators || []),
    ...(validationCards || []),
    ...(customCards || []),
  ];

  // Sort Oldest First so native sticky headers own the visual start of each
  // section. New messages are kept at the bottom via explicit scroll.
  items.sort(compareChatItems);

  // Inject the compact/custom empty state when there is a custom element and no
  // messages. This handles both new sessions (no indicators, compact is the
  // first row) and accepted invitations (compact lands below the indicators).
  if (hasCustomEmptyState && messages.length === 0) {
    items.push({
      type: 'custom-empty-state',
      id: CUSTOM_EMPTY_STATE_ITEM_ID,
    });
  }

  return items;
}
