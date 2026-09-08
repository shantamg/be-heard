import { MessageRole, Stage } from '@meet-without-fear/shared';
import {
  deriveTypingIndicatorState,
  selectNewestChatFlowMessage,
  TYPING_INDICATOR_DELAY_MS,
} from '../typingIndicator';
import type { ChatMessage } from '../types';

const BASE = new Date('2026-05-11T00:00:00.000Z').getTime();

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

describe('selectNewestChatFlowMessage', () => {
  it('returns null for an empty transcript', () => {
    expect(selectNewestChatFlowMessage([])).toBeNull();
  });

  it('returns null when no chat-flow turns exist', () => {
    const messages = [
      message({ id: 'e', role: MessageRole.EMPATHY_STATEMENT }),
      message({ id: 's', role: MessageRole.SYSTEM }),
    ];

    expect(selectNewestChatFlowMessage(messages)).toBeNull();
  });

  it('skips a synthetic row appended after the chat-flow turns', () => {
    // The role filter decides this one, before any timestamp is compared.
    const messages = [
      message({ id: 'user', role: MessageRole.USER, timestamp: at(0) }),
      message({ id: 'synthetic', role: MessageRole.EMPATHY_STATEMENT, timestamp: at(-5000) }),
    ];

    expect(selectNewestChatFlowMessage(messages)?.id).toBe('user');
  });

  it('picks by timestamp rather than array position', () => {
    // Both rows are chat-flow turns, so only the timestamp can decide it.
    const messages = [
      message({ id: 'ai', role: MessageRole.AI, timestamp: at(3000) }),
      message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
    ];

    expect(selectNewestChatFlowMessage(messages)?.id).toBe('ai');
  });

  it('resolves an exact timestamp tie to the later element', () => {
    const messages = [
      message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
      message({ id: 'ai', role: MessageRole.AI, timestamp: at(1000) }),
    ];

    expect(selectNewestChatFlowMessage(messages)?.id).toBe('ai');
  });
});

describe('deriveTypingIndicatorState', () => {
  it('hides the indicator on an empty transcript', () => {
    expect(deriveTypingIndicatorState([])).toEqual({
      newestChatFlowMessage: null,
      isWaitingForAI: false,
      showTypingIndicator: false,
      shouldDelay: false,
    });
  });

  it('shows the indicator when the newest chat-flow turn is the user', () => {
    const state = deriveTypingIndicatorState([
      message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
    ]);

    expect(state.isWaitingForAI).toBe(true);
    expect(state.showTypingIndicator).toBe(true);
  });

  it('hides the indicator once the assistant has replied', () => {
    const state = deriveTypingIndicatorState([
      message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
      message({ id: 'ai', role: MessageRole.AI, timestamp: at(2000) }),
    ]);

    expect(state.isWaitingForAI).toBe(false);
    expect(state.showTypingIndicator).toBe(false);
  });

  it('keeps showing the indicator when a synthetic row lands after the user turn', () => {
    // Regression: reading the last array element instead of the newest
    // timestamp would suppress the indicator here.
    const state = deriveTypingIndicatorState([
      message({ id: 'user', role: MessageRole.USER, timestamp: at(0) }),
      message({ id: 'synthetic', role: MessageRole.EMPATHY_STATEMENT, timestamp: at(-5000) }),
    ]);

    expect(state.showTypingIndicator).toBe(true);
  });

  it('ignores a system message newer than the user turn', () => {
    // SYSTEM is transcript furniture; it does not mean the AI has answered.
    const state = deriveTypingIndicatorState([
      message({ id: 'user', role: MessageRole.USER, timestamp: at(1000) }),
      message({ id: 'system', role: MessageRole.SYSTEM, timestamp: at(2000) }),
    ]);

    expect(state.newestChatFlowMessage?.id).toBe('user');
    expect(state.showTypingIndicator).toBe(true);
  });

  describe('explicit isLoading', () => {
    it('forces the indicator on for a transcript that would not show it', () => {
      const state = deriveTypingIndicatorState(
        [message({ id: 'ai', role: MessageRole.AI, timestamp: at(1000) })],
        { isLoading: true },
      );

      expect(state.isWaitingForAI).toBe(false);
      expect(state.showTypingIndicator).toBe(true);
    });

    it('shows the indicator on an empty transcript', () => {
      expect(deriveTypingIndicatorState([], { isLoading: true }).showTypingIndicator).toBe(true);
    });

    it('does not by itself claim the AI owes a reply', () => {
      expect(deriveTypingIndicatorState([], { isLoading: true }).isWaitingForAI).toBe(false);
    });
  });

  describe('delay while the user turn is still in flight', () => {
    it('delays for a turn still marked sending', () => {
      const state = deriveTypingIndicatorState([
        message({ id: 'user', role: MessageRole.USER, status: 'sending', timestamp: at(1000) }),
      ]);

      expect(state.shouldDelay).toBe(true);
    });

    it('delays for an optimistic user id even without a status', () => {
      const state = deriveTypingIndicatorState([
        message({ id: 'optimistic-user-1', role: MessageRole.USER, timestamp: at(1000) }),
      ]);

      expect(state.shouldDelay).toBe(true);
    });

    it('does not delay once the turn is persisted', () => {
      const state = deriveTypingIndicatorState([
        message({ id: 'server-uuid', role: MessageRole.USER, status: 'sent', timestamp: at(1000) }),
      ]);

      expect(state.showTypingIndicator).toBe(true);
      expect(state.shouldDelay).toBe(false);
    });

    it('does not delay when an explicit load is in progress', () => {
      const state = deriveTypingIndicatorState(
        [message({ id: 'optimistic-user-1', role: MessageRole.USER, timestamp: at(1000) })],
        { isLoading: true },
      );

      expect(state.shouldDelay).toBe(false);
    });

    it('does not delay when the AI has already replied', () => {
      const state = deriveTypingIndicatorState([
        message({ id: 'optimistic-user-1', role: MessageRole.USER, timestamp: at(1000) }),
        message({ id: 'ai', role: MessageRole.AI, timestamp: at(2000) }),
      ]);

      expect(state.shouldDelay).toBe(false);
    });

    it('does not confuse an optimistic assistant id for a user turn', () => {
      const state = deriveTypingIndicatorState([
        message({ id: 'optimistic-user-1', role: MessageRole.AI, timestamp: at(1000) }),
      ]);

      expect(state.isWaitingForAI).toBe(false);
      expect(state.shouldDelay).toBe(false);
    });
  });

  it('exposes the delay used by the view', () => {
    expect(TYPING_INDICATOR_DELAY_MS).toBe(420);
  });
});
