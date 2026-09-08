/**
 * Pure sequential-reveal queue for the transcript.
 *
 * Exactly one item animates at a time, oldest first. Everything here is a
 * decision function over an already-ordered item list plus the caller's
 * bookkeeping sets — no React, no timers, no mutation of the inputs.
 *
 * The rules this encodes, in the order they matter:
 *
 * - Structural rows (indicators, validation cards, the empty-state row) never
 *   participate in the typewriter queue.
 * - An item that has already been revealed — under either its raw id or its
 *   aliased animation identity — never animates again.
 * - History never animates: anything present in the mount snapshot, or at or
 *   before the server read boundary, renders instantly.
 * - An assistant turn the user has already replied past is not a live reveal
 *   candidate; hiding it would leave a blank gap in the transcript.
 */

import {
  ChatListItem,
  isCustomCard,
  isCustomEmptyState,
  isIndicator,
  isValidationCard,
} from './types';
import { MessageRole } from '@meet-without-fear/shared';

/** Prefix of the client-side ids used for turns not yet persisted by the server. */
const OPTIMISTIC_ID_PREFIX = 'optimistic-';

export interface SeenBoundary {
  /** Index of the last item the user has seen, or -1 when unknown. */
  lastSeenItemIndex: number;
  /** Server-backed read boundary in epoch ms, or null when unknown. */
  lastViewedAtTime: number | null;
}

export interface AnimationEligibilityContext extends SeenBoundary {
  /** The ordered transcript; needed for the "user already replied" lookahead. */
  items: ChatListItem[];
  /** Ids/identities that finished animating during this mount. */
  animatedItemIds: ReadonlySet<string>;
  /** Ids/identities already revealed in this animation scope. */
  seenAnimatedItemIds: ReadonlySet<string>;
  /** Ids captured on the first meaningful render — history for this screen open. */
  mountSnapshotIds: ReadonlySet<string>;
  /** Temp-to-server identity alias lookup. */
  getAnimationIdentity: (id: string) => string;
  /** Ids the streaming layer already revealed before the renderer saw them. */
  isPreRegisteredAnimatedId: (id: string) => boolean;
}

/**
 * True when the item sits at or before the user's read boundary, by list
 * position or by timestamp.
 */
export function isAtOrBeforeSeenBoundary(
  item: ChatListItem,
  index: number,
  { lastSeenItemIndex, lastViewedAtTime }: SeenBoundary,
): boolean {
  if (lastSeenItemIndex >= 0 && index <= lastSeenItemIndex) {
    return true;
  }

  if (lastViewedAtTime !== null && 'timestamp' in item && item.timestamp) {
    const itemTime = new Date(item.timestamp).getTime();
    if (Number.isFinite(itemTime) && itemTime <= lastViewedAtTime) {
      return true;
    }
  }

  return false;
}

/**
 * True when a user turn appears after `index`. Structural rows and custom cards
 * are transparent to this lookahead — only chat turns count as a reply.
 */
export function hasUserMessageAfter(items: ChatListItem[], index: number): boolean {
  for (let i = index + 1; i < items.length; i++) {
    const laterItem = items[i];
    if (
      isIndicator(laterItem) ||
      isValidationCard(laterItem) ||
      isCustomEmptyState(laterItem) ||
      isCustomCard(laterItem)
    ) {
      continue;
    }
    if (laterItem.role === MessageRole.USER) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this item is still a live reveal candidate.
 */
export function shouldAnimateItem(
  item: ChatListItem,
  index: number,
  context: AnimationEligibilityContext,
): boolean {
  if (isIndicator(item) || isValidationCard(item) || isCustomEmptyState(item)) return false;

  const animationIdentity = context.getAnimationIdentity(item.id);
  if (context.animatedItemIds.has(item.id) || context.animatedItemIds.has(animationIdentity)) {
    return false;
  }
  if (
    context.seenAnimatedItemIds.has(item.id) ||
    context.seenAnimatedItemIds.has(animationIdentity)
  ) {
    return false;
  }
  if (
    context.isPreRegisteredAnimatedId(item.id) ||
    context.isPreRegisteredAnimatedId(animationIdentity)
  ) {
    return false;
  }

  if (isCustomCard(item)) {
    if (isAtOrBeforeSeenBoundary(item, index, context)) return false;
    return item.animate === true;
  }

  if (item.role === MessageRole.USER) return false;
  if (item.id.startsWith(OPTIMISTIC_ID_PREFIX)) return false;

  // Anything present in the first rendered transcript is history for this
  // screen open. Keep the unread separator if needed, but do not replay
  // persisted messages one-by-one on entry; that makes restored sessions
  // appear to load progressively and shifts the viewport.
  if (context.mountSnapshotIds.has(item.id)) return false;

  // If the user has already replied after this assistant/system message, the
  // message must be visible immediately. It is no longer a live pending
  // animation candidate, and hiding it leaves blank transcript gaps.
  if (hasUserMessageAfter(context.items, index)) return false;

  return true;
}

export interface AnimationQueueContext {
  /** The identity currently mid-animation, or null when the queue is free. */
  animatingItemId: string | null;
  shouldAnimate: (item: ChatListItem, index: number) => boolean;
  getAnimationIdentity: (id: string) => string;
}

/**
 * The identity that should start animating next, or null when the queue is
 * busy or nothing is pending. Items are scanned oldest first so reveals run in
 * chronological order.
 */
export function selectNextAnimatableIdentity(
  items: ChatListItem[],
  { animatingItemId, shouldAnimate, getAnimationIdentity }: AnimationQueueContext,
): string | null {
  if (animatingItemId !== null) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!shouldAnimate(item, i)) continue;

    // Skip if a user message exists after this AI message chronologically
    // (user already saw and responded — no need to animate).
    if (hasUserMessageAfter(items, i)) continue;

    return getAnimationIdentity(item.id);
  }
  return null;
}

export type AnimationLockResolution =
  /** The current animation is still valid. */
  | { action: 'keep' }
  /** The animating row is gone from the list; drop the lock without marking it. */
  | { action: 'release' }
  /** The reveal is finished and the user has moved past it; mark it seen. */
  | { action: 'release-and-mark-seen' };

/**
 * Decide whether a held animation lock should be released. Without this the
 * queue can stall on a row that was removed, or on a finished assistant turn
 * the user has already replied past.
 */
export function resolveAnimationLock(
  items: ChatListItem[],
  {
    animatingItemId,
    getAnimationIdentity,
  }: { animatingItemId: string | null; getAnimationIdentity: (id: string) => string },
): AnimationLockResolution {
  if (animatingItemId === null) return { action: 'keep' };

  const animatingIndex = items.findIndex(
    (item) => getAnimationIdentity(item.id) === animatingItemId,
  );
  if (animatingIndex < 0) return { action: 'release' };

  const animatingItem = items[animatingIndex];
  if (
    isIndicator(animatingItem) ||
    isValidationCard(animatingItem) ||
    isCustomEmptyState(animatingItem) ||
    isCustomCard(animatingItem)
  ) {
    return { action: 'keep' };
  }

  if (animatingItem.status !== 'streaming' && hasUserMessageAfter(items, animatingIndex)) {
    return { action: 'release-and-mark-seen' };
  }

  return { action: 'keep' };
}

export interface MarkSeenContext extends AnimationQueueContext {
  /** The identity queued to animate next; it must not be marked seen. */
  nextAnimatableIdentity: string | null;
}

/**
 * Ids that should be recorded as revealed on this pass. Once a non-user row has
 * rendered in full it must never become eligible for a later typewriter pass,
 * otherwise refetches and status changes after button-only actions replay older
 * visible messages one by one.
 *
 * Every `shouldAnimate` call here sees the caller's bookkeeping as it was at the
 * start of the pass; the caller records the whole returned batch afterwards.
 * That differs from marking each id as it is found only if one row's id or
 * identity can also be another row's id or identity. Under the registry's
 * canonical mapping — `getAnimationIdentity` is idempotent, so every id resolves
 * to one fixed identity — that means two rows sharing a FlatList key, which is
 * already broken. A caller supplying a non-idempotent mapping would not have
 * that guarantee.
 */
export function selectItemIdsToMarkSeen(
  items: ChatListItem[],
  { animatingItemId, nextAnimatableIdentity, shouldAnimate, getAnimationIdentity }: MarkSeenContext,
): string[] {
  const ids: string[] = [];

  items.forEach((item, index) => {
    if (isIndicator(item) || isValidationCard(item) || isCustomEmptyState(item)) return;

    const animationIdentity = getAnimationIdentity(item.id);
    if (animationIdentity === nextAnimatableIdentity || animationIdentity === animatingItemId) {
      return;
    }

    if (isCustomCard(item)) {
      if (item.animate === true && !shouldAnimate(item, index)) {
        ids.push(item.id);
      }
      return;
    }

    if (item.role === MessageRole.USER) return;
    if (item.id.startsWith(OPTIMISTIC_ID_PREFIX)) return;
    if (!shouldAnimate(item, index)) {
      ids.push(item.id);
    }
  });

  return ids;
}
