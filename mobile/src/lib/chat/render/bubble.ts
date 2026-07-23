/**
 * Pure derivations for a single transcript bubble.
 *
 * A bubble's role decides three separate things — how it is laid out, which
 * animation it uses, and what label frames it — and the original component
 * recomputed all three from a spread of overlapping booleans. Naming the kind
 * once makes those decisions checkable, and keeps the "which animation, if any"
 * question testable without mounting anything.
 */

import { MessageRole } from '@meet-without-fear/shared';
import type { SharedContentDeliveryStatus } from '@meet-without-fear/shared';

export type ChatBubbleKind =
  | 'user'
  | 'system'
  | 'empathy-statement'
  | 'shared-context'
  | 'validation-feedback'
  | 'share-suggestion'
  | 'ai';

/** Prefix of the client-side id given to a user turn before the server sees it. */
const OPTIMISTIC_USER_ID_PREFIX = 'optimistic-user-';

/**
 * Classify a bubble by role. Anything not explicitly recognised is treated as
 * assistant prose, which is the only kind that uses the typewriter.
 */
export function classifyChatBubble(role: MessageRole | string): ChatBubbleKind {
  switch (role as string) {
    case MessageRole.USER:
      return 'user';
    case MessageRole.SYSTEM:
      return 'system';
    case MessageRole.EMPATHY_STATEMENT:
      return 'empathy-statement';
    case 'SHARED_CONTEXT':
      return 'shared-context';
    case 'VALIDATION_FEEDBACK':
      return 'validation-feedback';
    case 'SHARE_SUGGESTION':
      return 'share-suggestion';
    default:
      return 'ai';
  }
}

/**
 * Kinds that render in the centred "envelope" treatment used for content that
 * crossed between partners, rather than as a private chat bubble.
 */
export function isSharedFrameKind(kind: ChatBubbleKind): boolean {
  return (
    kind === 'empathy-statement' ||
    kind === 'shared-context' ||
    kind === 'validation-feedback'
  );
}

export interface UserEntranceInput {
  kind: ChatBubbleKind;
  /** Whether animation is enabled for this bubble at all. */
  enableTypewriter: boolean;
  status?: string;
  id: string;
}

/**
 * Whether the user's own turn should slide and fade in as it leaves the
 * composer. This is deliberately independent of the reveal queue and of any
 * per-mount animation bookkeeping: it depends only on whether the turn is still
 * in flight, so the caller can evaluate it before that bookkeeping is settled.
 */
export function deriveUserEntranceAnimation({
  kind,
  enableTypewriter,
  status,
  id,
}: UserEntranceInput): boolean {
  return (
    kind === 'user' &&
    enableTypewriter &&
    (status === 'sending' || id.startsWith(OPTIMISTIC_USER_ID_PREFIX))
  );
}

export interface BubbleRevealInput {
  kind: ChatBubbleKind;
  /** Whether animation is enabled for this bubble at all. */
  enableTypewriter: boolean;
  /** Caller says this row is history and must render instantly. */
  skipTypewriter: boolean;
  /** This row has already finished its reveal during this mount. */
  hasAnimated: boolean;
  /** This row has already begun its reveal during this mount. */
  hasStarted: boolean;
  /** The queue has handed this row its turn (an onAnimationStart was supplied). */
  isNextToAnimate: boolean;
}

export interface BubbleRevealState {
  /** Reveal assistant prose character by character. */
  useTypewriter: boolean;
  /** Fade in non-assistant, non-user content. */
  useFadeIn: boolean;
  /** Currently running the fade, as opposed to merely being eligible for it. */
  isFadeInActive: boolean;
  /**
   * Animatable but not yet this row's turn. It renders nothing rather than
   * popping in fully formed ahead of the queue.
   */
  isWaitingForTurn: boolean;
}

/**
 * Decide which reveal, if any, a bubble should be running.
 *
 * `hasAnimated` and `hasStarted` are per-mount bookkeeping that the caller
 * resets when a row's animation identity changes, so this must be evaluated
 * after any such reset — otherwise a row whose identity just changed would be
 * judged on the previous identity's history.
 */
export function deriveBubbleReveal({
  kind,
  enableTypewriter,
  skipTypewriter,
  hasAnimated,
  hasStarted,
  isNextToAnimate,
}: BubbleRevealInput): BubbleRevealState {
  const isUser = kind === 'user';
  const isAI = kind === 'ai';
  const isAnimatable = enableTypewriter && !skipTypewriter;

  // Non-assistant, non-user content fades in as a block; assistant prose types.
  const willFadeIn = !isUser && !isAI && isAnimatable;

  return {
    useTypewriter: isAI && isAnimatable && !hasAnimated,
    useFadeIn: willFadeIn && !hasAnimated,
    isFadeInActive: willFadeIn && !hasAnimated && isNextToAnimate,
    isWaitingForTurn:
      !isUser && isAnimatable && !hasAnimated && !isNextToAnimate && !hasStarted,
  };
}

export interface SharedFrameLabelInput {
  kind: ChatBubbleKind;
  direction: 'sent' | 'received';
  partnerName?: string;
}

/**
 * The rule label above a shared frame. The voice differs per content type, and
 * falls back to "your partner" when the name is not loaded yet.
 */
export function getSharedFrameLabel({
  kind,
  direction,
  partnerName,
}: SharedFrameLabelInput): string {
  if (kind === 'empathy-statement') {
    if (direction === 'received') {
      return partnerName ? `Empathy from ${partnerName}` : 'Empathy from your partner';
    }
    return partnerName ? `Empathy shared with ${partnerName}` : 'Empathy shared';
  }

  if (kind === 'validation-feedback') {
    return partnerName ? `Feedback from ${partnerName}` : 'Feedback from your partner';
  }

  if (direction === 'sent') {
    return partnerName ? `Context shared with ${partnerName}` : 'Context shared';
  }
  return partnerName ? `Context from ${partnerName}` : 'Context from your partner';
}

/** Delivery line under a shared frame the current user sent. */
export function getSharedContentStatusText(
  status: SharedContentDeliveryStatus | undefined,
): string {
  switch (status) {
    case 'sending':
      return 'Sending...';
    case 'pending':
      return 'Submitted for review';
    case 'delivered':
      return 'Delivered';
    case 'seen':
      return '✓ Seen';
    case 'superseded':
      return 'Updated version below';
    default:
      return 'Submitted for review';
  }
}
