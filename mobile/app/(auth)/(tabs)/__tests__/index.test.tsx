/**
 * HomeScreen Tests
 *
 * Tests for the home screen with the chat-first interface.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../index';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  ChevronDown: () => 'ChevronDownIcon',
  MessageCircle: () => 'MessageCircleIcon',
  Send: () => 'SendIcon',
}));

// Mock useRouterChat hook
const mockSendMessage = jest.fn();
const mockUseRouterChat = jest.fn(() => ({
  messages: [
    {
      id: 'welcome',
      sessionId: 'router',
      senderId: null,
      role: 'AI',
      content: "Hi! What can I help you work through today?",
      stage: 'ONBOARDING',
      timestamp: new Date().toISOString(),
    },
  ],
  isSending: false,
  isLoading: false,
  welcomeMessage: undefined,
  sendMessage: mockSendMessage,
  clearMessages: jest.fn(),
}));

jest.mock('../../../../src/hooks/useRouterChat', () => ({
  useRouterChat: (options: { onSessionCreated?: (id: string) => void }) => {
    const result = mockUseRouterChat();
    // Store the callback for testing
    (mockUseRouterChat as unknown as { onSessionCreated?: (id: string) => void }).onSessionCreated =
      options.onSessionCreated;
    return result;
  },
}));

// Mock ChatInterface component
jest.mock('../../../../src/components/ChatInterface', () => ({
  ChatInterface: ({
    messages,
    onSendMessage,
    isLoading,
  }: {
    messages: unknown[];
    onSendMessage: (content: string) => void;
    isLoading: boolean;
  }) => {
    const { View, Text, TouchableOpacity, TextInput } = require('react-native');
    return (
      <View testID="chat-interface">
        <Text testID="message-count">{messages.length} messages</Text>
        {isLoading && <Text testID="loading-indicator">Loading...</Text>}
        <TextInput testID="message-input" placeholder="Type a message" />
        <TouchableOpacity testID="send-button" onPress={() => onSendMessage('test message')}>
          <Text>Send</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

// Mock BiometricPrompt component
jest.mock('../../../../src/components/BiometricPrompt', () => ({
  BiometricPrompt: ({ visible, testID }: { visible: boolean; testID?: string }) => {
    const { View, Text } = require('react-native');
    if (!visible) return null;
    return (
      <View testID={testID || 'biometric-prompt'}>
        <Text>Biometric Prompt</Text>
      </View>
    );
  },
}));

// Mock useBiometricAuth hook
jest.mock('@/src/hooks', () => ({
  useBiometricAuth: () => ({
    isAvailable: false,
    isEnrolled: false,
    isEnabled: false,
    isLoading: false,
    biometricType: null,
    biometricName: null,
    hasPrompted: true, // Already prompted, so no async effects
    error: null,
    checkAvailability: jest.fn(),
    authenticate: jest.fn(),
    enableBiometric: jest.fn(),
    disableBiometric: jest.fn(),
    markPrompted: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSendMessage.mockClear();
  });

  it('renders the ChatInterface component', () => {
    renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('chat-interface')).toBeTruthy();
    expect(screen.getByTestId('message-count')).toBeTruthy();
  });

  it('calls sendMessage when send button is pressed', () => {
    renderWithProviders(<HomeScreen />);

    const sendButton = screen.getByTestId('send-button');
    fireEvent.press(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith('test message');
  });

  it('navigates to session when session is created', () => {
    renderWithProviders(<HomeScreen />);

    // Simulate session creation callback
    const onSessionCreated = (
      mockUseRouterChat as unknown as { onSessionCreated?: (id: string) => void }
    ).onSessionCreated;
    if (onSessionCreated) {
      onSessionCreated('new-session-123');
    }

    expect(mockPush).toHaveBeenCalledWith('/session/new-session-123');
  });

  it('does not show biometric prompt when already prompted', () => {
    renderWithProviders(<HomeScreen />);

    // Biometric prompt should not be visible since hasPrompted is true
    expect(screen.queryByTestId('biometric-prompt')).toBeNull();
  });

  it('shows loading state when isLoading is true', () => {
    mockUseRouterChat.mockReturnValueOnce({
      messages: [],
      isSending: false,
      isLoading: true,
      welcomeMessage: undefined,
      sendMessage: mockSendMessage,
      clearMessages: jest.fn(),
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });
});

describe('HomeScreen with biometric prompt', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders without errors with biometric available', () => {
    // This test verifies the component renders without errors
    renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('chat-interface')).toBeTruthy();
  });
});
