/**
 * WitnessScreen Tests
 *
 * Tests for the Stage 1 Witness screen where users share their perspective.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Stage, MessageRole } from '@be-heard/shared';

// Mock expo-router
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'test-session-123' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  }),
  Stack: {
    Screen: 'Screen',
  },
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
  };
});

// Create mock functions that can be controlled per test
const mockSendMessage = jest.fn();
const mockConfirmHeard = jest.fn();
const mockRecordEmotion = jest.fn();

// Track callback passed to confirmHeard
let confirmHeardOnSuccess: (() => void) | undefined;

// Mock the hooks
jest.mock('../../hooks/useSessions', () => ({
  useSession: () => ({
    data: {
      session: {
        id: 'test-session-123',
        partner: { name: 'Alex' },
      },
    },
    isLoading: false,
  }),
}));

// Create a variable to control messages from tests
let mockMessages: Array<{
  id: string;
  role: string;
  content: string;
  sessionId: string;
  senderId: string | null;
  stage: number;
  timestamp: string;
}> = [];

let mockMyProgressStage = Stage.WITNESS;
let mockPartnerProgressStage = Stage.WITNESS;
let mockLoadingMessages = false;
let mockMessagesError: Error | null = null;

jest.mock('../../hooks/useMessages', () => ({
  useMessages: () => ({
    data: { messages: mockMessages, hasMore: false },
    isLoading: mockLoadingMessages,
    error: mockMessagesError,
  }),
  useSendMessage: () => ({
    mutate: mockSendMessage,
    isPending: false,
  }),
  useOptimisticMessage: () => ({
    addOptimisticMessage: jest.fn(() => 'optimistic-123'),
    removeOptimisticMessage: jest.fn(),
  }),
  useRecordEmotion: () => ({
    mutate: mockRecordEmotion,
  }),
}));

jest.mock('../../hooks/useStages', () => ({
  useConfirmFeelHeard: () => ({
    mutate: (params: unknown, options?: { onSuccess?: () => void }) => {
      confirmHeardOnSuccess = options?.onSuccess;
      mockConfirmHeard(params, options);
    },
    isPending: false,
  }),
  useProgress: () => ({
    data: {
      sessionId: 'test-session-123',
      myProgress: {
        stage: mockMyProgressStage,
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        completedAt: null,
        gates: {},
      },
      partnerProgress: {
        stage: mockPartnerProgressStage,
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        completedAt: null,
        gates: {},
      },
      canAdvance: false,
    },
    isLoading: false,
  }),
}));

// Import after mocks
import WitnessScreen from '../../../app/(auth)/session/[id]/witness';

describe('WitnessScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    mockMyProgressStage = Stage.WITNESS;
    mockPartnerProgressStage = Stage.WITNESS;
    mockLoadingMessages = false;
    mockMessagesError = null;
    confirmHeardOnSuccess = undefined;
  });

  it('shows chat interface', () => {
    render(<WitnessScreen />);
    expect(screen.getByTestId('chat-message-list')).toBeTruthy();
  });

  it('shows loading state while messages are loading', () => {
    mockLoadingMessages = true;
    render(<WitnessScreen />);
    expect(screen.getByText(/loading conversation/i)).toBeTruthy();
  });

  it('shows error state when messages fail to load', () => {
    mockMessagesError = new Error('Network error');
    render(<WitnessScreen />);
    expect(screen.getByText(/failed to load messages/i)).toBeTruthy();
  });

  it('shows feel heard confirmation when AI asks about feeling heard', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: MessageRole.USER,
        content: 'I feel frustrated about our argument',
        sessionId: 'test-session-123',
        senderId: 'user-1',
        stage: Stage.WITNESS,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: MessageRole.AI,
        content: 'I understand. Do you feel fully heard about this situation?',
        sessionId: 'test-session-123',
        senderId: null,
        stage: Stage.WITNESS,
        timestamp: new Date().toISOString(),
      },
    ];

    render(<WitnessScreen />);
    // The FeelHeardConfirmation component should appear with the confirm button
    expect(screen.getByText(/yes, I feel heard/i)).toBeTruthy();
  });

  it('shows feel heard confirmation when AI uses "feel heard" phrase', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: MessageRole.AI,
        content: 'Before we move on, I want to check - do you feel heard?',
        sessionId: 'test-session-123',
        senderId: null,
        stage: Stage.WITNESS,
        timestamp: new Date().toISOString(),
      },
    ];

    render(<WitnessScreen />);
    // The FeelHeardConfirmation component should appear with the confirm button
    expect(screen.getByText(/yes, I feel heard/i)).toBeTruthy();
  });

  it('calls confirmHeard when user confirms feeling heard', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: MessageRole.AI,
        content: 'Do you feel fully heard?',
        sessionId: 'test-session-123',
        senderId: null,
        stage: Stage.WITNESS,
        timestamp: new Date().toISOString(),
      },
    ];

    render(<WitnessScreen />);
    fireEvent.press(screen.getByText(/yes, I feel heard/i));
    expect(mockConfirmHeard).toHaveBeenCalledWith(
      { sessionId: 'test-session-123', confirmed: true },
      expect.any(Object)
    );
  });

  it('navigates to session detail after confirming feel heard', async () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: MessageRole.AI,
        content: 'Do you feel fully heard?',
        sessionId: 'test-session-123',
        senderId: null,
        stage: Stage.WITNESS,
        timestamp: new Date().toISOString(),
      },
    ];

    render(<WitnessScreen />);
    fireEvent.press(screen.getByText(/yes, I feel heard/i));

    // Simulate the onSuccess callback
    if (confirmHeardOnSuccess) {
      confirmHeardOnSuccess();
    }

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/session/test-session-123');
    });
  });

  it('shows waiting room when completed stage 1 but partner has not', () => {
    mockMyProgressStage = Stage.PERSPECTIVE_STRETCH;
    mockPartnerProgressStage = Stage.WITNESS;

    render(<WitnessScreen />);
    expect(
      screen.getByText(/waiting for your partner to complete their witness session/i)
    ).toBeTruthy();
  });

  it('shows partner name in waiting room', () => {
    mockMyProgressStage = Stage.PERSPECTIVE_STRETCH;
    mockPartnerProgressStage = Stage.WITNESS;

    render(<WitnessScreen />);
    expect(screen.getByText(/alex/i)).toBeTruthy();
  });

  it('shows waiting indicator in waiting room', () => {
    mockMyProgressStage = Stage.PERSPECTIVE_STRETCH;
    mockPartnerProgressStage = Stage.WITNESS;

    render(<WitnessScreen />);
    expect(screen.getByTestId('waiting-indicator')).toBeTruthy();
  });

  it('shows empty state when no messages', () => {
    mockMessages = [];
    render(<WitnessScreen />);
    expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
  });

  it('shows appropriate empty state message for witness stage', () => {
    mockMessages = [];
    render(<WitnessScreen />);
    expect(screen.getByText(/share your experience/i)).toBeTruthy();
  });
});
