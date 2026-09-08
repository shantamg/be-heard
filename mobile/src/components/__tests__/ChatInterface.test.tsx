/**
 * ChatInterface Component Tests
 *
 * Tests for the complete chat interface including message rendering,
 * input handling, and typing indicator behavior.
 */

import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text } from 'react-native';
import { act, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { render } from '../../utils/test-utils';
import { ChatInterface, ChatMessage } from '../ChatInterface';
import { ChatBubble } from '../ChatBubble';
import { EmotionSlider } from '../EmotionSlider';
import { MessageDTO, MessageRole, Stage } from '@meet-without-fear/shared';
import { bridgeAnimatedId } from '../../utils/animationBridge';

// ============================================================================
// Mocks
// ============================================================================

/**
 * One entry per SpeakerButton mount. Every assistant bubble renders exactly one
 * SpeakerButton, so this counts assistant-bubble mounts: React reuses the
 * subtree on a re-render and appends nothing, but a remount unmounts and
 * remounts the button. The typewriter counter below cannot stand in for this —
 * a remounted bubble whose reveal is already settled renders plain text and
 * mounts no typewriter at all.
 */
const mockSpeakerButtonMounts: string[] = [];

// Mock SpeakerButton to avoid icon issues
jest.mock('../SpeakerButton', () => {
  const React = require('react');
  return {
    SpeakerButton: ({ testID }: { testID?: string }) => {
      React.useEffect(() => {
        mockSpeakerButtonMounts.push(testID ?? 'speaker');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

jest.mock('../../hooks/useSpeech', () => ({
  useSpeech: () => ({
    isSpeaking: false,
    currentId: null,
    toggle: jest.fn(),
  }),
  useAutoSpeech: () => ({
    isAutoSpeechEnabled: false,
  }),
}));

/**
 * Every text a typewriter has been mounted for, in order. A re-render does not
 * append; only a fresh mount does, which is how the tests below tell a stable
 * row apart from one that was remounted and re-animated.
 */
const mockTypewriterMounts: string[] = [];

jest.mock('../TypewriterText', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TypewriterText: ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
      React.useEffect(() => {
        mockTypewriterMounts.push(text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      React.useEffect(() => {
        if (text.includes('[hold-animation]')) return;
        onComplete?.();
      }, [onComplete, text]);
      return <Text testID="typewriter-text">{text}</Text>;
    },
  };
});

// ============================================================================
// Helpers
// ============================================================================

function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage & { skipTypewriter?: boolean } {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    sessionId: 'session-1',
    senderId: 'user-1',
    role: MessageRole.USER,
    content: 'Test message',
    stage: Stage.WITNESS,
    timestamp: new Date().toISOString(),
    // Skip typewriter animation in tests so messages render immediately
    skipTypewriter: true,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  mockTypewriterMounts.length = 0;
  mockSpeakerButtonMounts.length = 0;
});

describe('ChatInterface', () => {
  const mockOnSendMessage = jest.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  describe('Message Rendering', () => {
    it('renders message history', () => {
      const messages = [
        createMockMessage({ id: '1', role: MessageRole.USER, content: 'Hello' }),
        createMockMessage({ id: '2', role: MessageRole.AI, content: 'Hi there' }),
      ];

      // Pass readBoundary={{ lastSeenChatItemId: null }} to mark all messages as "history" (no typewriter animation)
      render(<ChatInterface messages={messages} onSendMessage={mockOnSendMessage} readBoundary={{ lastSeenChatItemId: null }} />);

      expect(screen.getByText('Hello')).toBeTruthy();
      expect(screen.getByText('Hi there')).toBeTruthy();
    });

    it('renders empty state when no messages', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      expect(screen.getByTestId('chat-message-list')).toBeTruthy();
      expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
    });

    it('shows custom empty state message', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          emptyStateTitle="Welcome"
          emptyStateMessage="Start typing..."
        />
      );

      expect(screen.getByText('Welcome')).toBeTruthy();
      expect(screen.getByText('Start typing...')).toBeTruthy();
    });

    it('hides empty state when messages exist', () => {
      const messages = [createMockMessage({ id: '1', content: 'Hello' })];
      render(<ChatInterface messages={messages} onSendMessage={mockOnSendMessage} />);

      expect(screen.queryByTestId('chat-empty-state')).toBeNull();
    });

    it('renders multiple messages in correct order', () => {
      const messages = [
        createMockMessage({ id: '1', content: 'First message' }),
        createMockMessage({ id: '2', content: 'Second message' }),
        createMockMessage({ id: '3', content: 'Third message' }),
      ];

      render(<ChatInterface messages={messages} onSendMessage={mockOnSendMessage} />);

      expect(screen.getByText('First message')).toBeTruthy();
      expect(screen.getByText('Second message')).toBeTruthy();
      expect(screen.getByText('Third message')).toBeTruthy();
    });
  });

  describe('Message Input', () => {
    it('sends message on submit', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.changeText(input, 'Test message');
      fireEvent.press(screen.getByTestId('send-button'));

      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    });

    it('clears input after sending', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.changeText(input, 'Test message');
      fireEvent.press(screen.getByTestId('send-button'));

      expect(input.props.value).toBe('');
    });

    it('does not send empty messages', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.changeText(input, '   ');
      fireEvent.press(screen.getByTestId('send-button'));

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('trims whitespace from messages', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.changeText(input, '  Hello World  ');
      fireEvent.press(screen.getByTestId('send-button'));

      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello World');
    });

    it('caps input corner radius when the text wraps onto multiple lines', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      fireEvent(screen.getByTestId('chat-input'), 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 300, height: 72 } },
      });

      const inputWrapperStyle = StyleSheet.flatten(screen.getByTestId('chat-input-wrapper').props.style);
      expect(inputWrapperStyle.borderRadius).toBe(24);
    });

    it('disables input when disabled prop is true', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} disabled />);

      const input = screen.getByTestId('chat-input');
      expect(input.props.editable).toBe(false);
    });

    it('disables input when isLoading is true', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} isLoading />);

      const input = screen.getByTestId('chat-input');
      expect(input.props.editable).toBe(false);
    });

    it('keeps guided action panels above the chat input', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          slots={{ aboveInput: () => <Text testID="guided-panel">Guided action</Text> }}
        />
      );

      const input = screen.getByTestId('chat-input');
      const panel = screen.getByTestId('guided-panel');
      const contains = (root: any, child: any): boolean => (
        root === child ||
        root.children?.some((candidate: any) => typeof candidate !== 'string' && contains(candidate, child)) === true
      );

      let ancestor: any = input.parent;
      while (ancestor && !contains(ancestor, panel)) {
        ancestor = ancestor.parent;
      }

      const inputBranch = ancestor?.children.find((child: any) => typeof child !== 'string' && contains(child, input));
      const panelBranch = ancestor?.children.find((child: any) => typeof child !== 'string' && contains(child, panel));

      expect(ancestor).toBeTruthy();
      expect(ancestor.children.indexOf(panelBranch)).toBeLessThan(ancestor.children.indexOf(inputBranch));
    });
  });

  describe('Typing Indicator', () => {
    it('shows typing indicator when isLoading is true', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} isLoading />);

      expect(screen.getByTestId('typing-indicator')).toBeTruthy();
    });

    it('hides typing indicator when isLoading is false', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} isLoading={false} />);

      expect(screen.queryByTestId('typing-indicator')).toBeNull();
    });
  });

  describe('Typewriter Animation', () => {
    it('does not replay already rendered AI messages after message updates', async () => {
      const baseTime = new Date('2026-05-05T03:00:00.000Z').getTime();
      const userMessage = createMockMessage({
        id: 'user-1',
        role: MessageRole.USER,
        content: 'I replied',
        timestamp: new Date(baseTime).toISOString(),
      });
      const firstAIMessage = createMockMessage({
        id: 'ai-1',
        role: MessageRole.AI,
        content: 'First AI response',
        timestamp: new Date(baseTime + 1000).toISOString(),
      });
      const secondAIMessage = createMockMessage({
        id: 'ai-2',
        role: MessageRole.AI,
        content: 'Second AI response',
        timestamp: new Date(baseTime + 2000).toISOString(),
      });
      const thirdAIMessage = createMockMessage({
        id: 'ai-3',
        role: MessageRole.AI,
        content: 'Third AI response',
        timestamp: new Date(baseTime + 3000).toISOString(),
      });

      const { rerender } = render(
        <ChatInterface
          sessionId="animation-regression-session"
          messages={[userMessage]}
          onSendMessage={mockOnSendMessage}
          skipInitialHistory
        />
      );

      rerender(
        <ChatInterface
          sessionId="animation-regression-session"
          messages={[userMessage, firstAIMessage, secondAIMessage]}
          onSendMessage={mockOnSendMessage}
          skipInitialHistory
        />
      );

      await waitFor(() => {
        expect(screen.queryAllByTestId('typewriter-text').length).toBeLessThanOrEqual(1);
      });

      rerender(
        <ChatInterface
          sessionId="animation-regression-session"
          messages={[userMessage, firstAIMessage, secondAIMessage, thirdAIMessage]}
          onSendMessage={mockOnSendMessage}
          skipInitialHistory
        />
      );

      await waitFor(() => {
        const animatedTexts = screen.queryAllByTestId('typewriter-text').map((node) => node.props.children);
        expect(animatedTexts).not.toContain('Second AI response');
      });
    });
  });

  describe('Grouped props', () => {
    it('hides the emotion slider when no emotionSlider group is passed', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      expect(screen.queryByTestId('chat-emotion-slider')).toBeNull();
    });

    it('shows the emotion slider whenever the group is passed', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          emotionSlider={{ onChange: jest.fn() }}
        />
      );

      expect(screen.getByTestId('chat-emotion-slider')).toBeTruthy();
    });

    it('defaults the emotion value to 5 and compact to false', () => {
      const { UNSAFE_getByType } = render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          emotionSlider={{ onChange: jest.fn() }}
        />
      );

      const slider = UNSAFE_getByType(EmotionSlider);
      expect(slider.props.value).toBe(5);
      expect(slider.props.compact).toBe(false);
    });

    it('passes the supplied emotion value, compact flag, and callbacks through', () => {
      const onChange = jest.fn();
      const onHighEmotion = jest.fn();

      const { UNSAFE_getByType } = render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          emotionSlider={{ value: 8, onChange, onHighEmotion, compact: true }}
        />
      );

      const slider = UNSAFE_getByType(EmotionSlider);
      expect(slider.props.value).toBe(8);
      expect(slider.props.compact).toBe(true);
      expect(slider.props.onChange).toBe(onChange);
      expect(slider.props.onHighEmotion).toBe(onHighEmotion);
    });

    it('renders no history spinner when pagination omits isLoadingMore', () => {
      const { UNSAFE_queryAllByType } = render(
        <ChatInterface
          messages={[createMockMessage({ id: '1', content: 'Only message' })]}
          onSendMessage={mockOnSendMessage}
          pagination={{ onLoadMore: jest.fn() }}
        />
      );

      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    });

    it('renders the history spinner when pagination reports a load in flight', () => {
      const { UNSAFE_queryAllByType } = render(
        <ChatInterface
          messages={[createMockMessage({ id: '1', content: 'Only message' })]}
          onSendMessage={mockOnSendMessage}
          pagination={{ onLoadMore: jest.fn(), isLoadingMore: true }}
        />
      );

      expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    });

    it('renders validation cards supplied through the validation group', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          validation={{
            cards: [
              {
                type: 'validation-card',
                id: 'card-1',
                timestamp: new Date().toISOString(),
                partnerName: 'Sam',
                empathyContent: 'You felt unheard.',
                status: 'pending',
                attemptId: 'attempt-1',
              },
            ],
          }}
        />
      );

      expect(screen.getByTestId('validation-card-card-1')).toBeTruthy();
    });

    it('renders composer affordances supplied through the composer group', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          composer={{ failedMessage: 'Message that failed to send' }}
        />
      );

      expect(screen.getByTestId('chat-input').props.value).toBe('Message that failed to send');
    });

    it('renders the belowChat slot inside the transcript', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          slots={{ belowChat: () => <Text testID="below-chat-slot">Below chat</Text> }}
        />
      );

      expect(screen.getByTestId('below-chat-slot')).toBeTruthy();
    });
  });

  describe('History never animates', () => {
    function historyTranscript(baseTime: number) {
      return [
        createMockMessage({
          id: 'history-user-1',
          role: MessageRole.USER,
          content: 'Opening turn',
          timestamp: new Date(baseTime).toISOString(),
        }),
        createMockMessage({
          id: 'history-ai-1',
          role: MessageRole.AI,
          content: 'First persisted reply',
          timestamp: new Date(baseTime + 1000).toISOString(),
        }),
        createMockMessage({
          id: 'history-user-2',
          role: MessageRole.USER,
          content: 'Second turn',
          timestamp: new Date(baseTime + 2000).toISOString(),
        }),
        createMockMessage({
          id: 'history-ai-2',
          role: MessageRole.AI,
          content: 'Second persisted reply',
          timestamp: new Date(baseTime + 3000).toISOString(),
        }),
      ];
    }

    it('starts zero typewriters when a persisted transcript is opened', () => {
      const baseTime = new Date('2026-06-03T08:00:00.000Z').getTime();

      render(
        <ChatInterface
          sessionId="history-open-session"
          messages={historyTranscript(baseTime)}
          onSendMessage={mockOnSendMessage}
          readBoundary={{ lastViewedAt: new Date(baseTime + 5000).toISOString() }}
        />
      );

      expect(screen.getByText('First persisted reply')).toBeTruthy();
      expect(screen.getByText('Second persisted reply')).toBeTruthy();
      expect(mockTypewriterMounts).toEqual([]);
    });

    it('starts zero typewriters when older history is paged in', () => {
      // This must reach the pagination snapshot specifically, so the paged-in
      // assistant reply is the newest turn with no user turn after it. Were a
      // user turn to follow it, the "user already replied" lookahead would
      // reject it first and the pagination path would never be under test.
      const baseTime = new Date('2026-06-03T09:00:00.000Z').getTime();
      const onLoadMore = jest.fn();
      const recent = [
        createMockMessage({
          id: 'recent-ai',
          role: MessageRole.AI,
          content: 'Most recent reply',
          timestamp: new Date(baseTime).toISOString(),
        }),
      ];
      const older = [
        createMockMessage({
          id: 'paged-ai',
          role: MessageRole.AI,
          content: 'Paged-in older reply',
          timestamp: new Date(baseTime - 10000).toISOString(),
        }),
      ];

      jest.useFakeTimers();
      try {
        const { rerender, UNSAFE_getByType } = render(
          <ChatInterface
            sessionId="history-page-session"
            messages={recent}
            onSendMessage={mockOnSendMessage}
            pagination={{ onLoadMore, hasMore: true }}
          />
        );

        // Paging is gated on the first bottom scroll having landed and on the
        // reader having actually dragged, so both have to happen for real.
        const list = screen.getByTestId('chat-message-list');
        fireEvent.scroll(list, {
          nativeEvent: {
            contentOffset: { y: 1400 },
            contentSize: { height: 2000, width: 400 },
            layoutMeasurement: { height: 600, width: 400 },
          },
        });
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        fireEvent(list, 'scrollBeginDrag');

        act(() => {
          UNSAFE_getByType(FlatList).props.onStartReached();
        });
        expect(onLoadMore).toHaveBeenCalled();

        mockTypewriterMounts.length = 0;

        // The page lands while the history load is still in flight, which is
        // what makes ChatInterface record the arriving rows as history.
        rerender(
          <ChatInterface
            sessionId="history-page-session"
            messages={[...older, ...recent]}
            onSendMessage={mockOnSendMessage}
            pagination={{ onLoadMore, hasMore: true }}
          />
        );

        expect(screen.getByText('Paged-in older reply')).toBeTruthy();
        expect(mockTypewriterMounts).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('animates a paged-in reply that arrives without a history load in flight', () => {
      // Positive control for the case above: identical transcript and identical
      // arrival, differing only in that no pagination was requested. This is
      // what proves the previous test is attributable to the pagination
      // snapshot rather than to some other guard rejecting the row.
      const baseTime = new Date('2026-06-03T09:30:00.000Z').getTime();
      const recent = [
        createMockMessage({
          id: 'control-recent-ai',
          role: MessageRole.AI,
          content: 'Most recent reply',
          timestamp: new Date(baseTime).toISOString(),
        }),
      ];
      const older = [
        createMockMessage({
          id: 'control-paged-ai',
          role: MessageRole.AI,
          content: 'Older reply with no load in flight',
          timestamp: new Date(baseTime - 10000).toISOString(),
        }),
      ];

      const { rerender } = render(
        <ChatInterface
          sessionId="history-page-control-session"
          messages={recent}
          onSendMessage={mockOnSendMessage}
        />
      );
      mockTypewriterMounts.length = 0;

      rerender(
        <ChatInterface
          sessionId="history-page-control-session"
          messages={[...older, ...recent]}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(mockTypewriterMounts).toEqual(['Older reply with no load in flight']);
    });

    it('still animates a genuinely new reply that arrives after history', async () => {
      const baseTime = new Date('2026-06-03T10:00:00.000Z').getTime();
      const history = historyTranscript(baseTime);

      const { rerender } = render(
        <ChatInterface
          sessionId="history-then-live-session"
          messages={history}
          onSendMessage={mockOnSendMessage}
          readBoundary={{ lastViewedAt: new Date(baseTime + 5000).toISOString() }}
        />
      );
      expect(mockTypewriterMounts).toEqual([]);

      rerender(
        <ChatInterface
          sessionId="history-then-live-session"
          messages={[
            ...history,
            createMockMessage({
              id: 'live-user',
              role: MessageRole.USER,
              content: 'A new question',
              timestamp: new Date(baseTime + 6000).toISOString(),
            }),
            createMockMessage({
              id: 'live-ai',
              role: MessageRole.AI,
              content: 'A genuinely new reply',
              timestamp: new Date(baseTime + 7000).toISOString(),
            }),
          ]}
          onSendMessage={mockOnSendMessage}
          readBoundary={{ lastViewedAt: new Date(baseTime + 5000).toISOString() }}
        />
      );

      await waitFor(() => {
        expect(mockTypewriterMounts).toEqual(['A genuinely new reply']);
      });
    });
  });

  describe('Temp-to-server identity', () => {
    it('keeps the FlatList key stable when a streaming id is reconciled', () => {
      const baseTime = new Date('2026-06-01T10:00:00.000Z').getTime();
      const userMessage = createMockMessage({
        id: 'identity-user',
        role: MessageRole.USER,
        content: 'Tell me more',
        timestamp: new Date(baseTime).toISOString(),
      });
      const streaming = createMockMessage({
        id: 'streaming-identity-1',
        role: MessageRole.AI,
        content: 'Streamed reply',
        timestamp: new Date(baseTime + 1000).toISOString(),
      });

      const { rerender, UNSAFE_getByType } = render(
        <ChatInterface
          sessionId="identity-session"
          messages={[userMessage, streaming]}
          onSendMessage={mockOnSendMessage}
          skipInitialHistory
        />
      );

      const keyBefore = UNSAFE_getByType(FlatList).props.keyExtractor(streaming);

      // The stream layer aliases the persisted id back onto the id the row is
      // already rendering under, then the cache swaps the message id.
      bridgeAnimatedId('streaming-identity-1', 'identity-server-uuid');
      const reconciled = { ...streaming, id: 'identity-server-uuid' };

      rerender(
        <ChatInterface
          sessionId="identity-session"
          messages={[userMessage, reconciled]}
          onSendMessage={mockOnSendMessage}
          skipInitialHistory
        />
      );

      const keyAfter = UNSAFE_getByType(FlatList).props.keyExtractor(reconciled);

      expect(keyBefore).toBe('streaming-identity-1');
      expect(keyAfter).toBe(keyBefore);
    });

    it('does not replay the typewriter after the id is reconciled', async () => {
      const baseTime = new Date('2026-06-01T11:00:00.000Z').getTime();
      const userMessage = createMockMessage({
        id: 'replay-user',
        role: MessageRole.USER,
        content: 'Go on',
        timestamp: new Date(baseTime).toISOString(),
      });
      const streaming = createMockMessage({
        id: 'streaming-replay-1',
        role: MessageRole.AI,
        content: 'Reconciled reply',
        timestamp: new Date(baseTime + 1000).toISOString(),
      });

      const { rerender } = render(
        <ChatInterface
          sessionId="replay-session"
          messages={[userMessage]}
          onSendMessage={mockOnSendMessage}
        />
      );

      // The reply streams in under its temporary id and animates exactly once.
      rerender(
        <ChatInterface
          sessionId="replay-session"
          messages={[userMessage, streaming]}
          onSendMessage={mockOnSendMessage}
        />
      );

      await waitFor(() => {
        expect(mockTypewriterMounts).toEqual(['Reconciled reply']);
      });
      mockTypewriterMounts.length = 0;
      // The assistant bubble is mounted exactly once by this point; anything
      // appended after the swap is a remount.
      expect(mockSpeakerButtonMounts).toHaveLength(1);
      mockSpeakerButtonMounts.length = 0;

      bridgeAnimatedId('streaming-replay-1', 'replay-server-uuid');

      rerender(
        <ChatInterface
          sessionId="replay-session"
          messages={[userMessage, { ...streaming, id: 'replay-server-uuid' }]}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('Reconciled reply')).toBeTruthy();
      expect(mockTypewriterMounts).toEqual([]);
      // Zero remounts: the row kept its FlatList key, so React reused it.
      expect(mockSpeakerButtonMounts).toEqual([]);
    });
  });

  describe('Scroll anchoring', () => {
    const scrollEvent = (distanceFromBottom: number) => ({
      nativeEvent: {
        contentOffset: { y: 2000 - 600 - distanceFromBottom },
        contentSize: { height: 2000, width: 400 },
        layoutMeasurement: { height: 600, width: 400 },
      },
    });

    function renderScrollableTranscript() {
      const baseTime = new Date('2026-06-02T09:00:00.000Z').getTime();
      const messages = Array.from({ length: 6 }, (_, i) =>
        createMockMessage({
          id: `scroll-${i}`,
          role: i % 2 === 0 ? MessageRole.USER : MessageRole.AI,
          content: `Message ${i}`,
          timestamp: new Date(baseTime + i * 1000).toISOString(),
        })
      );

      const view = render(
        <ChatInterface
          sessionId="scroll-session"
          messages={messages}
          onSendMessage={mockOnSendMessage}
          readBoundary={{ lastSeenChatItemId: null }}
        />
      );

      return { ...view, messages };
    }

    /**
     * Scrolls are deferred through requestAnimationFrame plus a ladder of retry
     * timers, and mounting schedules its own ladder. Drain both so the
     * assertions only see scrolls caused by the event under test.
     */
    function drainScrollTimers() {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not scroll a reader who has scrolled up while content grows', () => {
      const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
      const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');

      try {
        renderScrollableTranscript();
        drainScrollTimers();

        const list = screen.getByTestId('chat-message-list');

        // The reader scrolls well away from the bottom.
        fireEvent.scroll(list, scrollEvent(900));
        scrollToOffset.mockClear();
        scrollToEnd.mockClear();

        // Streamed characters grow the content height without adding an item.
        fireEvent(list, 'contentSizeChange', 400, 2100);
        fireEvent(list, 'contentSizeChange', 400, 2200);
        fireEvent(list, 'contentSizeChange', 400, 2400);
        drainScrollTimers();

        expect(scrollToOffset).not.toHaveBeenCalled();
        expect(scrollToEnd).not.toHaveBeenCalled();
      } finally {
        scrollToOffset.mockRestore();
        scrollToEnd.mockRestore();
      }
    });

    it('follows content growth for a reader still at the bottom', () => {
      const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');

      try {
        renderScrollableTranscript();
        drainScrollTimers();

        const list = screen.getByTestId('chat-message-list');

        fireEvent.scroll(list, scrollEvent(0));
        scrollToOffset.mockClear();

        fireEvent(list, 'contentSizeChange', 400, 2100);
        drainScrollTimers();

        expect(scrollToOffset).toHaveBeenCalled();
      } finally {
        scrollToOffset.mockRestore();
      }
    });

    describe('text streaming into an existing turn', () => {
      const STREAM_BASE = new Date('2026-06-04T09:00:00.000Z').getTime();

      /** The same assistant turn — same id, same timestamp — with more text. */
      function streamingTranscript(assistantText: string) {
        return [
          createMockMessage({
            id: 'stream-user',
            role: MessageRole.USER,
            content: 'A question',
            timestamp: new Date(STREAM_BASE).toISOString(),
          }),
          createMockMessage({
            id: 'stream-ai',
            role: MessageRole.AI,
            content: assistantText,
            timestamp: new Date(STREAM_BASE + 1000).toISOString(),
            status: 'streaming',
          }),
        ];
      }

      function renderStreaming(assistantText: string) {
        return render(
          <ChatInterface
            sessionId="stream-scroll-session"
            messages={streamingTranscript(assistantText)}
            onSendMessage={mockOnSendMessage}
          />
        );
      }

      it('does not move a scrolled-up reader as the turn grows', () => {
        const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
        const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');

        try {
          const { rerender } = renderStreaming('Partial');
          drainScrollTimers();

          fireEvent.scroll(screen.getByTestId('chat-message-list'), scrollEvent(900));
          scrollToOffset.mockClear();
          scrollToEnd.mockClear();

          // Each rerender is a real cache update: the message list gets a new
          // identity and every downstream effect re-runs. Only the newest
          // timestamp is unchanged, which is what must keep the viewport still.
          for (const text of [
            'Partial text',
            'Partial text and more',
            'Partial text and more still arriving',
          ]) {
            rerender(
              <ChatInterface
                sessionId="stream-scroll-session"
                messages={streamingTranscript(text)}
                onSendMessage={mockOnSendMessage}
              />
            );
            drainScrollTimers();
          }

          expect(screen.getByText('Partial text and more still arriving')).toBeTruthy();
          expect(scrollToOffset).not.toHaveBeenCalled();
          expect(scrollToEnd).not.toHaveBeenCalled();
        } finally {
          scrollToOffset.mockRestore();
          scrollToEnd.mockRestore();
        }
      });

      it('still follows a genuinely new turn arriving after it', () => {
        // Positive control, and the documented exception: a newer newest-item
        // does move the viewport in both the original and this branch. Without
        // it, the test above could pass simply because scrolling never happens.
        const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');

        try {
          const { rerender } = renderStreaming('Partial');
          drainScrollTimers();

          fireEvent.scroll(screen.getByTestId('chat-message-list'), scrollEvent(900));
          scrollToOffset.mockClear();

          rerender(
            <ChatInterface
              sessionId="stream-scroll-session"
              messages={[
                ...streamingTranscript('Partial'),
                createMockMessage({
                  id: 'stream-next-turn',
                  role: MessageRole.USER,
                  content: 'A brand new turn',
                  timestamp: new Date(STREAM_BASE + 9000).toISOString(),
                }),
              ]}
              onSendMessage={mockOnSendMessage}
            />
          );
          drainScrollTimers();

          expect(scrollToOffset).toHaveBeenCalled();
        } finally {
          scrollToOffset.mockRestore();
        }
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible send button', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).toBeTruthy();
    });

    it('has accessible message list', () => {
      render(<ChatInterface messages={[]} onSendMessage={mockOnSendMessage} />);

      const messageList = screen.getByTestId('chat-message-list');
      expect(messageList).toBeTruthy();
    });
  });
});

describe('ChatBubble', () => {
  it('renders user messages right-aligned', () => {
    const messages = [
      createMockMessage({ id: '1', role: MessageRole.USER, content: 'User message' }),
    ];

    // Pass readBoundary={{ lastSeenChatItemId: null }} to mark all messages as "history" (no typewriter animation)
    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} readBoundary={{ lastSeenChatItemId: null }} />);

    const bubble = screen.getByTestId('chat-bubble-1');
    expect(bubble).toBeTruthy();
  });

  it('renders AI messages left-aligned', () => {
    const messages = [
      createMockMessage({ id: '1', role: MessageRole.AI, content: 'AI message' }),
    ];

    // Pass readBoundary={{ lastSeenChatItemId: null }} to mark all messages as "history" (no typewriter animation)
    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} readBoundary={{ lastSeenChatItemId: null }} />);

    const bubble = screen.getByTestId('chat-bubble-1');
    expect(bubble).toBeTruthy();
  });

  it('constrains long AI messages to the visible chat row width', () => {
    render(
      <ChatBubble
        message={{
          id: 'wide-ai',
          role: MessageRole.AI,
          content: "I've captured a draft of what matters to you for your review. You can use the review button to confirm or adjust it.",
          timestamp: new Date().toISOString(),
          skipTypewriter: true,
        }}
      />
    );

    const row = screen.getByTestId('chat-bubble-wide-ai');
    const bubble = row.children.find((child: any) => typeof child !== 'string');
    const rowStyle = StyleSheet.flatten(row.props.style);
    const bubbleStyle = StyleSheet.flatten(bubble?.props.style);

    expect(rowStyle.width).toBeUndefined();
    expect(rowStyle.alignSelf).toBe('stretch');
    expect(bubbleStyle.width).toBe('100%');
    expect(bubbleStyle.flexShrink).toBe(1);
  });

  it('hides queued live AI messages until their typewriter turn', () => {
    render(
      <ChatBubble
        message={{
          id: 'queued-ai',
          role: MessageRole.AI,
          content: 'Queued AI response',
          timestamp: new Date().toISOString(),
          skipTypewriter: false,
        }}
        enableTypewriter
      />
    );

    expect(screen.getByTestId('chat-bubble-queued-ai')).toBeTruthy();
    expect(screen.queryByText('Queued AI response')).toBeNull();
    expect(screen.queryByTestId('typewriter-text')).toBeNull();
  });

  it('hides queued live system messages until their fade-in turn', () => {
    render(
      <ChatBubble
        message={{
          id: 'queued-system',
          role: MessageRole.SYSTEM,
          content: 'Queued system transition',
          timestamp: new Date().toISOString(),
          skipTypewriter: false,
        }}
        enableTypewriter
      />
    );

    expect(screen.getByTestId('chat-bubble-queued-system')).toBeTruthy();
    expect(screen.queryByText('Queued system transition')).toBeNull();
  });

  it('re-enters animation when its animation identity changes', () => {
    // The identity-change block clears this row's per-mount animation
    // bookkeeping, and the reveal must be decided against the cleared values.
    // Reading them before the reset leaves a reconciled row stuck as plain
    // text, which also strands the queue waiting for a completion callback.
    const { rerender } = render(
      <ChatBubble
        message={{
          id: 'identity-reset',
          role: MessageRole.AI,
          content: 'Reveal me again',
          timestamp: new Date().toISOString(),
          skipTypewriter: false,
        }}
        enableTypewriter
        animationIdentity="identity-a"
        onAnimationStart={jest.fn()}
      />
    );

    expect(screen.getByTestId('typewriter-text')).toBeTruthy();

    rerender(
      <ChatBubble
        message={{
          id: 'identity-reset',
          role: MessageRole.AI,
          content: 'Reveal me again',
          timestamp: new Date().toISOString(),
          skipTypewriter: false,
        }}
        enableTypewriter
        animationIdentity="identity-b"
        onAnimationStart={jest.fn()}
      />
    );

    expect(screen.getByTestId('typewriter-text')).toBeTruthy();
  });

  it('renders history messages immediately without animation', () => {
    render(
      <ChatBubble
        message={{
          id: 'history-ai',
          role: MessageRole.AI,
          content: 'Loaded history response',
          timestamp: new Date().toISOString(),
          skipTypewriter: true,
        }}
        enableTypewriter
      />
    );

    expect(screen.getByText('Loaded history response')).toBeTruthy();
  });

  it('does not typewriter persisted unread messages on initial session open', () => {
    const baseTime = new Date('2026-05-14T12:00:00.000Z').getTime();

    render(
      <ChatInterface
        messages={[
          createMockMessage({
            id: 'seen-user-message',
            role: MessageRole.USER,
            content: 'Already seen user message',
            timestamp: new Date(baseTime).toISOString(),
          }),
          createMockMessage({
            id: 'persisted-unread-ai',
            role: MessageRole.AI,
            content: 'Persisted unread response should render immediately',
            timestamp: new Date(baseTime + 1000).toISOString(),
          }),
        ]}
        onSendMessage={jest.fn()}
        sessionId="initial-unread-history-test"
        readBoundary={{ lastViewedAt: new Date(baseTime).toISOString() }}
      />
    );

    expect(screen.getByText('Persisted unread response should render immediately')).toBeTruthy();
    expect(screen.queryByTestId('typewriter-text')).toBeNull();
  });

  it('displays message content correctly', () => {
    const messages = [
      createMockMessage({ id: '1', content: 'This is a test message with special characters: @#$%' }),
    ];

    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} />);

    expect(screen.getByText('This is a test message with special characters: @#$%')).toBeTruthy();
  });

  it('renders an assistant message immediately once the user has replied after it', () => {
    const baseTime = new Date('2026-05-07T06:58:00Z').getTime();
    const initialMessages = [
      createMockMessage({
        id: 'user-before',
        role: MessageRole.USER,
        content: 'First user turn',
        timestamp: new Date(baseTime).toISOString(),
      }),
    ];

    const { rerender } = render(
      <ChatInterface
        messages={initialMessages}
        onSendMessage={jest.fn()}
        sessionId="answered-assistant-test"
      />
    );

    rerender(
      <ChatInterface
        messages={[
          ...initialMessages,
          createMockMessage({
            id: 'assistant-answered',
            role: MessageRole.AI,
            content: 'Assistant text should stay visible',
            timestamp: new Date(baseTime + 1000).toISOString(),
          }),
          createMockMessage({
            id: 'user-after',
            role: MessageRole.USER,
            content: 'Follow-up user turn',
            timestamp: new Date(baseTime + 2000).toISOString(),
          }),
        ]}
        onSendMessage={jest.fn()}
        sessionId="answered-assistant-test"
      />
    );

    expect(screen.getByText('Assistant text should stay visible')).toBeTruthy();
  });

  it('unlocks the animation queue when the user replies before the current assistant animation finishes', async () => {
    const baseTime = new Date('2026-05-07T07:03:00Z').getTime();
    const initialMessages = [
      createMockMessage({
        id: 'assistant-still-animating',
        role: MessageRole.AI,
        content: 'Initial assistant text [hold-animation]',
        timestamp: new Date(baseTime).toISOString(),
      }),
    ];

    const { rerender } = render(
      <ChatInterface
        messages={initialMessages}
        onSendMessage={jest.fn()}
        sessionId="stale-animation-lock-test"
        skipInitialHistory
      />
    );

    expect(screen.getByText('Initial assistant text [hold-animation]')).toBeTruthy();

    rerender(
      <ChatInterface
        messages={[
          ...initialMessages,
          createMockMessage({
            id: 'user-interrupts-animation',
            role: MessageRole.USER,
            content: 'User replies before animation completes',
            timestamp: new Date(baseTime + 1000).toISOString(),
          }),
          createMockMessage({
            id: 'assistant-after-interrupt',
            role: MessageRole.AI,
            content: 'Next assistant text should not be hidden',
            timestamp: new Date(baseTime + 2000).toISOString(),
          }),
        ]}
        onSendMessage={jest.fn()}
        sessionId="stale-animation-lock-test"
        skipInitialHistory
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Next assistant text should not be hidden')).toBeTruthy();
    });
  });

  it('handles long messages correctly', () => {
    const longContent = 'A'.repeat(500);
    const messages = [createMockMessage({ id: '1', content: longContent })];

    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} />);

    expect(screen.getByText(longContent)).toBeTruthy();
  });
});

describe('TypingIndicator', () => {
  it('renders with correct testID', () => {
    render(<ChatInterface messages={[]} onSendMessage={jest.fn()} isLoading />);

    expect(screen.getByTestId('typing-indicator')).toBeTruthy();
  });

  it('shows typing indicator when newest chat-flow message is USER even if a synthetic message is appended after', () => {
    const baseTime = new Date('2026-05-11T00:00:00.000Z').getTime();
    const userMsg = createMockMessage({
      id: 'user-1',
      role: MessageRole.USER,
      content: 'Help me',
      timestamp: new Date(baseTime).toISOString(),         // newer
    });
    const syntheticMsg = createMockMessage({
      id: 'synthetic-1',
      role: MessageRole.EMPATHY_STATEMENT,
      content: 'Empathy statement content',
      timestamp: new Date(baseTime - 5000).toISOString(), // older, but last in array
    });

    render(
      <ChatInterface
        messages={[userMsg, syntheticMsg]}
        onSendMessage={jest.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByTestId('typing-indicator')).toBeTruthy();
  });
});
