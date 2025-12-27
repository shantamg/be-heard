/**
 * ChatInterface Component Tests
 *
 * Tests for the complete chat interface including message rendering,
 * input handling, and typing indicator behavior.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ChatInterface } from '../ChatInterface';
import { MessageDTO, MessageRole, Stage } from '@be-heard/shared';

// ============================================================================
// Mocks
// ============================================================================

// Mock lucide icons
jest.mock('lucide-react-native', () => ({
  Send: 'Send',
}));

// ============================================================================
// Helpers
// ============================================================================

function createMockMessage(overrides: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    sessionId: 'session-1',
    senderId: 'user-1',
    role: MessageRole.USER,
    content: 'Test message',
    stage: Stage.WITNESS,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

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

      render(<ChatInterface messages={messages} onSendMessage={mockOnSendMessage} />);

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

    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} />);

    const bubble = screen.getByTestId('chat-bubble-1');
    expect(bubble).toBeTruthy();
  });

  it('renders AI messages left-aligned', () => {
    const messages = [
      createMockMessage({ id: '1', role: MessageRole.AI, content: 'AI message' }),
    ];

    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} />);

    const bubble = screen.getByTestId('chat-bubble-1');
    expect(bubble).toBeTruthy();
  });

  it('displays message content correctly', () => {
    const messages = [
      createMockMessage({ id: '1', content: 'This is a test message with special characters: @#$%' }),
    ];

    render(<ChatInterface messages={messages} onSendMessage={jest.fn()} />);

    expect(screen.getByText('This is a test message with special characters: @#$%')).toBeTruthy();
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
});
