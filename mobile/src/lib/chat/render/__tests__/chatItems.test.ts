import { MessageRole, Stage } from '@meet-without-fear/shared';
import {
  assembleChatItems,
  compareChatItems,
  getSameMomentSortRank,
} from '../chatItems';
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
    role: MessageRole.USER,
    content: 'content',
    stage: Stage.WITNESS,
    timestamp: at(0),
    ...overrides,
  };
}

function indicator(
  id: string,
  indicatorType: ChatIndicatorItem['indicatorType'],
  timestamp?: string,
): ChatIndicatorItem {
  return { type: 'indicator', id, indicatorType, timestamp };
}

function validationCard(id: string, timestamp: string): ChatValidationCardItem {
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

function customCard(id: string, timestamp: string, animate = false): ChatCustomCardItem {
  return { type: 'custom-card', id, timestamp, animate, render: () => null };
}

function ids(items: ChatListItem[]): string[] {
  return items.map((item) => item.id);
}

describe('assembleChatItems', () => {
  it('returns an empty list when nothing is supplied', () => {
    expect(assembleChatItems({ messages: [] })).toEqual([]);
  });

  it('orders messages oldest first regardless of input order', () => {
    const items = assembleChatItems({
      messages: [
        message({ id: 'third', timestamp: at(3000) }),
        message({ id: 'first', timestamp: at(1000) }),
        message({ id: 'second', timestamp: at(2000) }),
      ],
    });

    expect(ids(items)).toEqual(['first', 'second', 'third']);
  });

  it('keeps a fast AI reply after the user message that triggered it', () => {
    // The animation queue's "user already replied" guard depends on this.
    const items = assembleChatItems({
      messages: [
        message({ id: 'ai', role: MessageRole.AI, timestamp: at(1200) }),
        message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
      ],
    });

    expect(ids(items)).toEqual(['user', 'ai']);
  });

  it('does not mutate the caller arrays', () => {
    const messages = [
      message({ id: 'b', timestamp: at(2000) }),
      message({ id: 'a', timestamp: at(1000) }),
    ];
    const indicators = [indicator('i', 'stage-chapter', at(0))];
    assembleChatItems({ messages, indicators });

    expect(ids(messages)).toEqual(['b', 'a']);
    expect(ids(indicators)).toEqual(['i']);
  });

  it('merges all four sources into one chronological stream', () => {
    const items = assembleChatItems({
      messages: [message({ id: 'm', timestamp: at(4000) })],
      indicators: [indicator('i', 'stage-chapter', at(2000))],
      validationCards: [validationCard('v', at(6000))],
      customCards: [customCard('c', at(8000))],
    });

    expect(ids(items)).toEqual(['i', 'm', 'v', 'c']);
  });

  describe('same-moment ordering', () => {
    it('places invitation and feel-heard indicators above everything', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'm', timestamp: at(0) })],
        indicators: [
          indicator('invite', 'invitation-accepted', at(500)),
          indicator('chapter', 'stage-chapter', at(200)),
        ],
      });

      expect(ids(items)).toEqual(['invite', 'chapter', 'm']);
    });

    it('places a validation card above the same-moment AI explanation', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'ai', role: MessageRole.AI, timestamp: at(0) })],
        validationCards: [validationCard('card', at(400))],
      });

      expect(ids(items)).toEqual(['card', 'ai']);
    });

    it('places a custom card below the same-moment message that introduced it', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'ai', role: MessageRole.AI, timestamp: at(900) })],
        customCards: [customCard('card', at(0))],
      });

      expect(ids(items)).toEqual(['ai', 'card']);
    });

    it('reverts to pure chronology once items are more than a second apart', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'ai', role: MessageRole.AI, timestamp: at(0) })],
        // 1500ms later: outside the same-moment window, so time wins over rank.
        indicators: [indicator('chapter', 'stage-chapter', at(1500))],
      });

      expect(ids(items)).toEqual(['ai', 'chapter']);
    });

    it('falls back to id comparison for identical timestamps and kinds', () => {
      const items = assembleChatItems({
        messages: [
          message({ id: 'b', timestamp: at(0) }),
          message({ id: 'a', timestamp: at(0) }),
        ],
      });

      expect(ids(items)).toEqual(['a', 'b']);
    });

    it('treats an indicator without a timestamp as the oldest item', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'm', timestamp: at(60_000) })],
        indicators: [indicator('undated', 'context-shared')],
      });

      expect(ids(items)).toEqual(['undated', 'm']);
    });
  });

  describe('custom empty state', () => {
    it('appends the synthetic row when there are no messages', () => {
      const items = assembleChatItems({ messages: [], hasCustomEmptyState: true });

      expect(items).toEqual([{ type: 'custom-empty-state', id: 'custom-empty-state-item' }]);
    });

    it('appends it below indicators so an accepted invitation reads first', () => {
      const items = assembleChatItems({
        messages: [],
        indicators: [indicator('invite', 'invitation-accepted', at(0))],
        hasCustomEmptyState: true,
      });

      expect(ids(items)).toEqual(['invite', 'custom-empty-state-item']);
    });

    it('omits it as soon as a message exists', () => {
      const items = assembleChatItems({
        messages: [message({ id: 'm' })],
        hasCustomEmptyState: true,
      });

      expect(ids(items)).toEqual(['m']);
    });

    it('omits it when the caller has no custom element', () => {
      expect(assembleChatItems({ messages: [], hasCustomEmptyState: false })).toEqual([]);
    });
  });
});

describe('getSameMomentSortRank', () => {
  it.each([
    ['invitation-sent', 0],
    ['invitation-accepted', 0],
    ['feel-heard', 0],
    ['stage-chapter', 1],
    ['context-shared', 1],
  ] as const)('ranks the %s indicator at %d', (indicatorType, rank) => {
    expect(getSameMomentSortRank(indicator('x', indicatorType))).toBe(rank);
  });

  it('ranks validation cards between indicators and messages', () => {
    expect(getSameMomentSortRank(validationCard('v', at(0)))).toBe(1.5);
  });

  it('ranks messages above custom cards', () => {
    expect(getSameMomentSortRank(message({ id: 'm' }))).toBe(2);
    expect(getSameMomentSortRank(customCard('c', at(0)))).toBe(3);
  });
});

describe('compareChatItems', () => {
  it('is antisymmetric for every kind pairing at the same moment', () => {
    const samples: ChatListItem[] = [
      indicator('i', 'stage-chapter', at(0)),
      validationCard('v', at(0)),
      message({ id: 'm', timestamp: at(0) }),
      customCard('c', at(0)),
    ];

    for (const a of samples) {
      for (const b of samples) {
        // `+ 0` normalises the -0 that Math.sign returns for equal items.
        expect(Math.sign(compareChatItems(a, b)) + 0).toBe(-Math.sign(compareChatItems(b, a)) + 0);
      }
    }
  });
});
