/**
 * Chat render item types.
 *
 * These are the shapes the transcript renderer works with. They live here (not
 * in the view) so item assembly, ordering, and animation eligibility can be
 * tested without mounting React Native.
 */

import type { MessageDTO, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import type { MessageDeliveryStatus } from '../../../components/ChatBubble';
import type { ChatIndicatorType } from '../../../components/ChatIndicator';

export interface ChatMessage extends MessageDTO {
  status?: MessageDeliveryStatus;
  /** Delivery status for shared content (empathy statements, shared context) */
  sharedContentDeliveryStatus?: SharedContentDeliveryStatus;
  /** Whether the shared artifact was sent by the current user or received from partner */
  sharedContentDirection?: 'sent' | 'received';
}

export interface ChatIndicatorItem {
  type: 'indicator';
  indicatorType: ChatIndicatorType;
  id: string;
  timestamp?: string;
  /** Optional metadata for dynamic indicator text */
  metadata?: {
    /** Whether this content is from the current user (vs partner) */
    isFromMe?: boolean;
    /** Partner's display name (for "Context from {name}" text) */
    partnerName?: string;
    /** Stage name for stage-chapter indicators */
    stageName?: string;
    /** Stage accent color for stage-chapter bar background */
    stageColor?: string;
  };
}

export interface CustomEmptyStateItem {
  type: 'custom-empty-state';
  id: string;
}

export interface ChatValidationCardItem {
  type: 'validation-card';
  id: string;
  timestamp: string;
  partnerName: string;
  empathyContent: string;
  status: 'pending' | 'validated' | 'feedback-given' | 'superseded';
  attemptId: string;
}

export interface ChatCustomCardItem {
  type: 'custom-card';
  id: string;
  timestamp: string;
  /** Whether this card participates in the same animation queue as AI messages. */
  animate?: boolean;
  render: (options?: {
    skipAnimation: boolean;
    onAnimationComplete?: () => void;
  }) => React.ReactNode;
}

export type ChatListItem =
  | ChatMessage
  | ChatIndicatorItem
  | ChatValidationCardItem
  | ChatCustomCardItem
  | CustomEmptyStateItem;

export const CUSTOM_EMPTY_STATE_ITEM_ID = 'custom-empty-state-item';

export function isIndicator(item: ChatListItem): item is ChatIndicatorItem {
  return 'type' in item && item.type === 'indicator';
}

export function isValidationCard(item: ChatListItem): item is ChatValidationCardItem {
  return 'type' in item && item.type === 'validation-card';
}

export function isCustomCard(item: ChatListItem): item is ChatCustomCardItem {
  return 'type' in item && item.type === 'custom-card';
}

export function isCustomEmptyState(item: ChatListItem): item is CustomEmptyStateItem {
  return 'type' in item && item.type === 'custom-empty-state';
}

/**
 * True for the items that carry chat-message semantics (role, content). Every
 * item that is not one of the four structural card kinds is a message.
 */
export function isChatMessage(item: ChatListItem): item is ChatMessage {
  return (
    !isIndicator(item) &&
    !isValidationCard(item) &&
    !isCustomCard(item) &&
    !isCustomEmptyState(item)
  );
}
