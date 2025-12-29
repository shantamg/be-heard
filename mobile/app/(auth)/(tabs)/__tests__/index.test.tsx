/**
 * HomeScreen Tests
 *
 * Tests for the simplified home screen with greeting and quick actions.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../index';
import { SessionSummaryDTO, SessionStatus, Stage, StageStatus } from '@meet-without-fear/shared';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  ArrowRight: () => 'ArrowRightIcon',
  Plus: () => 'PlusIcon',
  Heart: () => 'HeartIcon',
}));

// Mock useSessions hook
const mockUseSessions = jest.fn();
jest.mock('../../../../src/hooks/useSessions', () => ({
  useSessions: () => mockUseSessions(),
}));

// Mock useAuth hook
const mockUseAuth = jest.fn();
jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useBiometricAuth hook to prevent async state updates
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

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

// Helper to create mock session
function createMockSession(overrides: Partial<SessionSummaryDTO> = {}): SessionSummaryDTO {
  return {
    id: 'session-1',
    relationshipId: 'rel-1',
    status: SessionStatus.ACTIVE,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    partner: {
      id: 'user-2',
      name: 'Jane Doe',
      nickname: 'Jane',
    },
    myProgress: {
      stage: Stage.WITNESS,
      status: StageStatus.IN_PROGRESS,
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: null,
    },
    partnerProgress: {
      stage: Stage.WITNESS,
      status: StageStatus.IN_PROGRESS,
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: null,
    },
    selfActionNeeded: [],
    partnerActionNeeded: [],
    ...overrides,
  };
}

function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseSessions.mockClear();
    mockUseAuth.mockClear();
    // Default auth state - logged in user
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Test User', firstName: 'Test', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('shows loading state while fetching sessions', () => {
    mockUseSessions.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows loading state while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows greeting with user name', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Hi Test')).toBeTruthy();
  });

  it('shows main question', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('What can I help you work through today?')).toBeTruthy();
  });

  it('shows New Session and Inner Work buttons', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('New Session')).toBeTruthy();
    expect(screen.getByText('Inner Work')).toBeTruthy();
  });

  it('shows Continue button when there is a recent session with partner nickname', () => {
    const session = createMockSession({
      id: 'session-1',
      partner: { id: 'user-2', name: 'Jane Doe', nickname: 'Jane' },
    });

    mockUseSessions.mockReturnValue({
      data: { items: [session], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Continue with Jane')).toBeTruthy();
  });

  it('uses partner name when nickname is not available', () => {
    const session = createMockSession({
      id: 'session-1',
      partner: { id: 'user-2', name: 'Jane Doe', nickname: null },
    });

    mockUseSessions.mockReturnValue({
      data: { items: [session], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Continue with Jane Doe')).toBeTruthy();
  });

  it('does not show Continue button when no sessions exist', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.queryByText(/Continue with/)).toBeNull();
  });

  it('navigates to new session screen when New Session pressed', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByText('New Session'));

    expect(mockPush).toHaveBeenCalledWith('/session/new');
  });

  it('navigates to inner work when Inner Work pressed', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByText('Inner Work'));

    expect(mockPush).toHaveBeenCalledWith('/session/new?mode=inner');
  });

  it('navigates to session when Continue pressed', () => {
    const session = createMockSession({
      id: 'recent-session',
      partner: { id: 'user-2', name: 'Jane', nickname: 'Jane' },
    });

    mockUseSessions.mockReturnValue({
      data: { items: [session], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByText('Continue with Jane'));

    expect(mockPush).toHaveBeenCalledWith('/session/recent-session');
  });

  it('shows the most recently updated session for Continue button', () => {
    const olderSession = createMockSession({
      id: 'older-session',
      partner: { id: 'user-2', name: 'Older Partner', nickname: 'Old' },
      updatedAt: '2024-01-01T00:00:00Z',
    });
    const newerSession = createMockSession({
      id: 'newer-session',
      partner: { id: 'user-3', name: 'Newer Partner', nickname: 'New' },
      updatedAt: '2024-01-03T00:00:00Z',
    });

    mockUseSessions.mockReturnValue({
      data: { items: [olderSession, newerSession], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    // Should show the newer session's partner
    expect(screen.getByText('Continue with New')).toBeTruthy();
    expect(screen.queryByText('Continue with Old')).toBeNull();
  });

  it('does not show biometric prompt when already prompted', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    // Biometric prompt should not be visible since hasPrompted is true
    expect(screen.queryByTestId('biometric-prompt')).toBeNull();
  });
});
