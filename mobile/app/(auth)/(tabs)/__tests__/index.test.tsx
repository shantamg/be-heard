/**
 * HomeScreen Tests
 *
 * Tests for the home screen with session list and hero card.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../index';
import { SessionSummaryDTO, SessionStatus, Stage, StageStatus } from '@be-heard/shared';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Plus: () => 'PlusIcon',
}));

// Mock useSessions hook
const mockUseSessions = jest.fn();
jest.mock('../../../../src/hooks/useSessions', () => ({
  useSessions: () => mockUseSessions(),
}));

// Mock useAuth hook
jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
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
  });

  it('shows loading state while fetching sessions', () => {
    mockUseSessions.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows empty state when no sessions', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByText(/no active sessions/i)).toBeTruthy();
    expect(screen.getByText(/start a new conversation/i)).toBeTruthy();
  });

  it('shows hero card for most urgent session', () => {
    const urgentSession = createMockSession({
      id: 'urgent-session',
      selfActionNeeded: ['complete_witness'],
    });
    const normalSession = createMockSession({
      id: 'normal-session',
      selfActionNeeded: [],
    });

    mockUseSessions.mockReturnValue({
      data: { items: [normalSession, urgentSession], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('hero-card')).toBeTruthy();
  });

  it('shows session list below hero', () => {
    const sessions = [
      createMockSession({ id: 'session-1', selfActionNeeded: ['action'] }),
      createMockSession({ id: 'session-2' }),
      createMockSession({ id: 'session-3' }),
    ];

    mockUseSessions.mockReturnValue({
      data: { items: sessions, hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    // Hero + 2 regular cards
    expect(screen.getByTestId('hero-card')).toBeTruthy();
    expect(screen.getAllByTestId('session-card').length).toBe(2);
  });

  it('navigates to new session screen when button pressed', () => {
    mockUseSessions.mockReturnValue({
      data: { items: [], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByText('New Session'));

    expect(mockPush).toHaveBeenCalledWith('/session/new');
  });

  it('sorts sessions with action needed first', () => {
    const noActionSession = createMockSession({
      id: 'no-action',
      selfActionNeeded: [],
      updatedAt: '2024-01-03T00:00:00Z',
    });
    const actionNeededSession = createMockSession({
      id: 'action-needed',
      selfActionNeeded: ['complete_stage'],
      updatedAt: '2024-01-01T00:00:00Z', // Older but has action
    });

    mockUseSessions.mockReturnValue({
      data: { items: [noActionSession, actionNeededSession], hasMore: false },
      isLoading: false,
    });

    renderWithProviders(<HomeScreen />);

    // The hero card should be the one with action needed
    const heroCard = screen.getByTestId('hero-card');
    // The hero card should contain "Your turn" since it has action needed
    expect(screen.getByText('Your turn')).toBeTruthy();
  });
});
