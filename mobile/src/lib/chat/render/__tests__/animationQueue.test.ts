import { MessageRole, Stage } from '@meet-without-fear/shared';
import {
  AnimationEligibilityContext,
  hasUserMessageAfter,
  isAtOrBeforeSeenBoundary,
  resolveAnimationLock,
  selectItemIdsToMarkSeen,
  selectNextAnimatableIdentity,
  shouldAnimateItem,
} from '../animationQueue';
import type {
  ChatCustomCardItem,
  ChatIndicatorItem,
  ChatListItem,
  ChatMessage,
  ChatValidationCardItem,
} from '../types';

const BASE = new Date('2026-05-05T03:00:00.000Z').getTime();

function at(offsetMs: number): string {
  return new Date(BASE + offsetMs).toISOString();
}

function message(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    sessionId: 'session-1',
    senderId: 'user-1',
    role: MessageRole.AI,
    content: 'content',
    stage: Stage.WITNESS,
    timestamp: at(0),
    ...overrides,
  };
}

function indicator(id: string, timestamp = at(0)): ChatIndicatorItem {
  return { type: 'indicator', id, indicatorType: 'stage-chapter', timestamp };
}

function validationCard(id: string, timestamp = at(0)): ChatValidationCardItem {
  return {
    type: 'validation-card',
    id,
    timestamp,
    partnerName: 'Sam',
    empathyContent: 'You felt unheard.',
    status: 'pending',
    attemptId: 'attempt-1',
  };
}

function customCard(
  id: string,
  overrides: Partial<ChatCustomCardItem> = {},
): ChatCustomCardItem {
  return { type: 'custom-card', id, timestamp: at(0), render: () => null, ...overrides };
}

function context(
  items: ChatListItem[],
  overrides: Partial<AnimationEligibilityContext> = {},
): AnimationEligibilityContext {
  return {
    items,
    animatedItemIds: new Set<string>(),
    seenAnimatedItemIds: new Set<string>(),
    mountSnapshotIds: new Set<string>(),
    lastSeenItemIndex: -1,
    lastViewedAtTime: null,
    getAnimationIdentity: (id) => id,
    isPreRegisteredAnimatedId: () => false,
    ...overrides,
  };
}

describe('hasUserMessageAfter', () => {
  it('is false at the end of the list', () => {
    const items = [message({ id: 'ai' })];
    expect(hasUserMessageAfter(items, 0)).toBe(false);
  });

  it('is true when a later user turn exists', () => {
    const items = [message({ id: 'ai' }), message({ id: 'user', role: MessageRole.USER })];
    expect(hasUserMessageAfter(items, 0)).toBe(true);
  });

  it('sees through indicators, validation cards, and custom cards', () => {
    const items: ChatListItem[] = [
      message({ id: 'ai' }),
      indicator('i'),
      validationCard('v'),
      customCard('c'),
      message({ id: 'user', role: MessageRole.USER }),
    ];
    expect(hasUserMessageAfter(items, 0)).toBe(true);
  });

  it('ignores user turns that came before', () => {
    const items = [message({ id: 'user', role: MessageRole.USER }), message({ id: 'ai' })];
    expect(hasUserMessageAfter(items, 1)).toBe(false);
  });
});

describe('isAtOrBeforeSeenBoundary', () => {
  it('is false with no boundary information', () => {
    expect(
      isAtOrBeforeSeenBoundary(message({ id: 'm' }), 3, {
        lastSeenItemIndex: -1,
        lastViewedAtTime: null,
      }),
    ).toBe(false);
  });

  it('is true at and before the last seen index', () => {
    const boundary = { lastSeenItemIndex: 2, lastViewedAtTime: null };
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm' }), 2, boundary)).toBe(true);
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm' }), 1, boundary)).toBe(true);
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm' }), 3, boundary)).toBe(false);
  });

  it('is true at and before the server read timestamp', () => {
    const boundary = { lastSeenItemIndex: -1, lastViewedAtTime: BASE + 1000 };
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm', timestamp: at(1000) }), 0, boundary)).toBe(true);
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm', timestamp: at(999) }), 0, boundary)).toBe(true);
    expect(isAtOrBeforeSeenBoundary(message({ id: 'm', timestamp: at(1001) }), 0, boundary)).toBe(false);
  });

  it('ignores an unparseable timestamp', () => {
    expect(
      isAtOrBeforeSeenBoundary(message({ id: 'm', timestamp: 'not-a-date' }), 0, {
        lastSeenItemIndex: -1,
        lastViewedAtTime: BASE,
      }),
    ).toBe(false);
  });
});

describe('shouldAnimateItem', () => {
  it.each([
    ['an indicator', indicator('i')],
    ['a validation card', validationCard('v')],
    ['the empty-state row', { type: 'custom-empty-state', id: 'e' } as ChatListItem],
  ])('never animates %s', (_label, item) => {
    expect(shouldAnimateItem(item, 0, context([item]))).toBe(false);
  });

  it('animates a genuinely new assistant message', () => {
    const items = [message({ id: 'ai' })];
    expect(shouldAnimateItem(items[0], 0, context(items))).toBe(true);
  });

  it('never animates a user turn', () => {
    const items = [message({ id: 'u', role: MessageRole.USER })];
    expect(shouldAnimateItem(items[0], 0, context(items))).toBe(false);
  });

  it('never animates an optimistic turn', () => {
    const items = [message({ id: 'optimistic-user-1' })];
    expect(shouldAnimateItem(items[0], 0, context(items))).toBe(false);
  });

  it('never animates history captured in the mount snapshot', () => {
    const items = [message({ id: 'ai' })];
    expect(
      shouldAnimateItem(items[0], 0, context(items, { mountSnapshotIds: new Set(['ai']) })),
    ).toBe(false);
  });

  it('never animates an assistant turn the user has already replied past', () => {
    const items = [message({ id: 'ai' }), message({ id: 'u', role: MessageRole.USER })];
    expect(shouldAnimateItem(items[0], 0, context(items))).toBe(false);
  });

  it('does not animate an item already revealed this mount', () => {
    const items = [message({ id: 'ai' })];
    expect(
      shouldAnimateItem(items[0], 0, context(items, { animatedItemIds: new Set(['ai']) })),
    ).toBe(false);
  });

  it('does not animate an item already revealed in this scope', () => {
    const items = [message({ id: 'ai' })];
    expect(
      shouldAnimateItem(items[0], 0, context(items, { seenAnimatedItemIds: new Set(['ai']) })),
    ).toBe(false);
  });

  describe('temp-to-server identity', () => {
    const aliased = (items: ChatListItem[], seen: string[]) =>
      context(items, {
        seenAnimatedItemIds: new Set(seen),
        getAnimationIdentity: (id) => (id === 'server-uuid' ? 'streaming-abc' : id),
      });

    it('does not re-animate a row whose temp id was already revealed', () => {
      const items = [message({ id: 'server-uuid' })];
      expect(shouldAnimateItem(items[0], 0, aliased(items, ['streaming-abc']))).toBe(false);
    });

    it('does not re-animate a row already revealed under its own id', () => {
      const items = [message({ id: 'server-uuid' })];
      expect(shouldAnimateItem(items[0], 0, aliased(items, ['server-uuid']))).toBe(false);
    });

    it('honours pre-registration recorded against the temp id', () => {
      const items = [message({ id: 'server-uuid' })];
      expect(
        shouldAnimateItem(
          items[0],
          0,
          context(items, {
            getAnimationIdentity: (id) => (id === 'server-uuid' ? 'streaming-abc' : id),
            isPreRegisteredAnimatedId: (id) => id === 'streaming-abc',
          }),
        ),
      ).toBe(false);
    });

    it('honours pre-registration recorded against the server id', () => {
      const items = [message({ id: 'server-uuid' })];
      expect(
        shouldAnimateItem(
          items[0],
          0,
          context(items, { isPreRegisteredAnimatedId: (id) => id === 'server-uuid' }),
        ),
      ).toBe(false);
    });
  });

  describe('custom cards', () => {
    it('animates only when the card opted in', () => {
      const optedIn = [customCard('c', { animate: true })];
      const optedOut = [customCard('c', { animate: false })];
      const unset = [customCard('c')];

      expect(shouldAnimateItem(optedIn[0], 0, context(optedIn))).toBe(true);
      expect(shouldAnimateItem(optedOut[0], 0, context(optedOut))).toBe(false);
      expect(shouldAnimateItem(unset[0], 0, context(unset))).toBe(false);
    });

    it('does not animate a card at or before the read boundary', () => {
      const items = [customCard('c', { animate: true, timestamp: at(0) })];
      expect(
        shouldAnimateItem(items[0], 0, context(items, { lastViewedAtTime: BASE + 1000 })),
      ).toBe(false);
    });

    it('animates an opted-in card even when the user has replied after it', () => {
      // Custom cards deliberately skip the reply lookahead in eligibility; the
      // queue head applies it instead.
      const items: ChatListItem[] = [
        customCard('c', { animate: true }),
        message({ id: 'u', role: MessageRole.USER }),
      ];
      expect(shouldAnimateItem(items[0], 0, context(items))).toBe(true);
    });
  });
});

describe('selectNextAnimatableIdentity', () => {
  const queue = (items: ChatListItem[], animatingItemId: string | null = null) =>
    selectNextAnimatableIdentity(items, {
      animatingItemId,
      shouldAnimate: (item, index) => shouldAnimateItem(item, index, context(items)),
      getAnimationIdentity: (id) => id,
    });

  it('returns null when nothing is pending', () => {
    expect(queue([message({ id: 'u', role: MessageRole.USER })])).toBeNull();
  });

  it('returns null while another item is animating', () => {
    expect(queue([message({ id: 'ai' })], 'other')).toBeNull();
  });

  it('picks the oldest pending item so reveals run in order', () => {
    const items = [
      message({ id: 'ai-1', timestamp: at(1000) }),
      message({ id: 'ai-2', timestamp: at(2000) }),
    ];
    expect(queue(items)).toBe('ai-1');
  });

  it('skips an item the user has already replied past and takes the next', () => {
    const items = [
      message({ id: 'ai-1', timestamp: at(1000) }),
      message({ id: 'u', role: MessageRole.USER, timestamp: at(2000) }),
      message({ id: 'ai-2', timestamp: at(3000) }),
    ];
    expect(queue(items)).toBe('ai-2');
  });

  it('skips an opted-in custom card the user has replied past', () => {
    const items: ChatListItem[] = [
      customCard('c', { animate: true, timestamp: at(1000) }),
      message({ id: 'u', role: MessageRole.USER, timestamp: at(2000) }),
      message({ id: 'ai', timestamp: at(3000) }),
    ];
    expect(queue(items)).toBe('ai');
  });

  it('returns the aliased identity, not the raw server id', () => {
    const items = [message({ id: 'server-uuid' })];
    expect(
      selectNextAnimatableIdentity(items, {
        animatingItemId: null,
        shouldAnimate: () => true,
        getAnimationIdentity: (id) => (id === 'server-uuid' ? 'streaming-abc' : id),
      }),
    ).toBe('streaming-abc');
  });
});

describe('resolveAnimationLock', () => {
  const identity = (id: string) => id;

  it('keeps a free queue untouched', () => {
    expect(
      resolveAnimationLock([message({ id: 'ai' })], {
        animatingItemId: null,
        getAnimationIdentity: identity,
      }),
    ).toEqual({ action: 'keep' });
  });

  it('releases when the animating row has left the list', () => {
    expect(
      resolveAnimationLock([message({ id: 'other' })], {
        animatingItemId: 'gone',
        getAnimationIdentity: identity,
      }),
    ).toEqual({ action: 'release' });
  });

  it('keeps the lock while the row is still streaming', () => {
    const items = [
      message({ id: 'ai', status: 'streaming' }),
      message({ id: 'u', role: MessageRole.USER }),
    ];
    expect(
      resolveAnimationLock(items, { animatingItemId: 'ai', getAnimationIdentity: identity }),
    ).toEqual({ action: 'keep' });
  });

  it('keeps the lock while no user reply has landed', () => {
    const items = [message({ id: 'ai' })];
    expect(
      resolveAnimationLock(items, { animatingItemId: 'ai', getAnimationIdentity: identity }),
    ).toEqual({ action: 'keep' });
  });

  it('releases and marks seen once the user replies past a finished reveal', () => {
    const items = [message({ id: 'ai' }), message({ id: 'u', role: MessageRole.USER })];
    expect(
      resolveAnimationLock(items, { animatingItemId: 'ai', getAnimationIdentity: identity }),
    ).toEqual({ action: 'release-and-mark-seen' });
  });

  it('resolves the lock through a reconciled server id', () => {
    const items = [message({ id: 'server-uuid' }), message({ id: 'u', role: MessageRole.USER })];
    expect(
      resolveAnimationLock(items, {
        animatingItemId: 'streaming-abc',
        getAnimationIdentity: (id) => (id === 'server-uuid' ? 'streaming-abc' : id),
      }),
    ).toEqual({ action: 'release-and-mark-seen' });
  });

  it('keeps the lock when the animating row is a structural card', () => {
    const items: ChatListItem[] = [validationCard('v'), message({ id: 'u', role: MessageRole.USER })];
    expect(
      resolveAnimationLock(items, { animatingItemId: 'v', getAnimationIdentity: identity }),
    ).toEqual({ action: 'keep' });
  });
});

describe('selectItemIdsToMarkSeen', () => {
  const marks = (
    items: ChatListItem[],
    overrides: Partial<AnimationEligibilityContext> = {},
    queue: { animatingItemId?: string | null; nextAnimatableIdentity?: string | null } = {},
  ) =>
    selectItemIdsToMarkSeen(items, {
      animatingItemId: queue.animatingItemId ?? null,
      nextAnimatableIdentity: queue.nextAnimatableIdentity ?? null,
      shouldAnimate: (item, index) => shouldAnimateItem(item, index, context(items, overrides)),
      getAnimationIdentity: overrides.getAnimationIdentity ?? ((id) => id),
    });

  it('marks history so a later refetch cannot replay it', () => {
    const items = [message({ id: 'ai' })];
    expect(marks(items, { mountSnapshotIds: new Set(['ai']) })).toEqual(['ai']);
  });

  it('leaves the queued and animating rows alone', () => {
    const items = [
      message({ id: 'ai-1', timestamp: at(1000) }),
      message({ id: 'ai-2', timestamp: at(2000) }),
      message({ id: 'ai-3', timestamp: at(3000) }),
    ];
    expect(
      marks(
        items,
        { mountSnapshotIds: new Set(['ai-1', 'ai-2', 'ai-3']) },
        { nextAnimatableIdentity: 'ai-1', animatingItemId: 'ai-2' },
      ),
    ).toEqual(['ai-3']);
  });

  it('never marks user or optimistic turns', () => {
    const items = [
      message({ id: 'u', role: MessageRole.USER }),
      message({ id: 'optimistic-user-1' }),
    ];
    expect(marks(items, { mountSnapshotIds: new Set(['u', 'optimistic-user-1']) })).toEqual([]);
  });

  it('never marks structural rows', () => {
    const items: ChatListItem[] = [
      indicator('i'),
      validationCard('v'),
      { type: 'custom-empty-state', id: 'e' },
    ];
    expect(marks(items)).toEqual([]);
  });

  it('marks an opted-in custom card only once it is no longer eligible', () => {
    const eligible = [customCard('c', { animate: true })];
    expect(marks(eligible)).toEqual([]);

    const settled = [customCard('c', { animate: true })];
    expect(marks(settled, { seenAnimatedItemIds: new Set(['c']) })).toEqual(['c']);
  });

  it('leaves opt-out custom cards untouched', () => {
    const items = [customCard('c', { animate: false })];
    expect(marks(items)).toEqual([]);
  });

  it('does not mark a live pending assistant message', () => {
    const items = [message({ id: 'ai' })];
    expect(marks(items, {}, { nextAnimatableIdentity: null })).toEqual([]);
  });
});
