/**
 * PersonDetailScreen Tests
 *
 * Tests for the person detail screen showing profile, active session, and history.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersonDetailScreen } from '../PersonDetailScreen';
import { SessionSummaryDTO, SessionStatus, Stage, StageStatus } from '@meet-without-fear/shared';

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  Stack: {
    Screen: () => null,
  },
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  MoreVertical: () => 'MoreVerticalIcon',
  Plus: () => 'PlusIcon',
  CheckCircle: () => 'CheckCircleIcon',
  ArrowLeft: () => 'ArrowLeftIcon',
}));

// Mock usePerson hook
const mockUsePerson = jest.fn();
const mockUsePastSessions = jest.fn();
jest.mock('../../hooks/usePerson', () => ({
  usePerson: (personId: string) => mockUsePerson(personId),
  usePastSessions: (personId: string) => mockUsePastSessions(personId),
}));

// Helper types
interface PersonData {
  id: string;
  name: string;
  initials: string;
  connectedSince: string;
  activeSession?: {
    id: string;
    stage: Stage;
    status: 'waiting_on_you' | 'your_turn' | 'waiting_on_partner' | 'both_active';
    lastUpdate: string;
  } | null;
}

interface PastSession {
  id: string;
  date: string;
  topic: string;
}

// Helper to create mock person data
function createMockPerson(overrides: Partial<PersonData> = {}): PersonData {
  return {
    id: 'person-123',
    name: 'Alex',
    initials: 'AL',
    connectedSince: 'Oct 2024',
    activeSession: null,
    ...overrides,
  };
}

function createMockPastSession(overrides: Partial<PastSession> = {}): PastSession {
  return {
    id: 'session-past-1',
    date: 'Dec 15, 2024',
    topic: 'Household responsibilities',
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

describe('PersonDetailScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockUsePerson.mockClear();
    mockUsePastSessions.mockClear();
  });

  describe('Profile Information', () => {
    it('shows person profile information', () => {
      const person = createMockPerson({ name: 'Alex', connectedSince: 'Oct 2024' });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText('Alex')).toBeTruthy();
      expect(screen.getByText(/connected since/i)).toBeTruthy();
    });

    it('shows person initials in avatar', () => {
      const person = createMockPerson({ initials: 'AL' });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText('AL')).toBeTruthy();
    });
  });

  describe('Active Session', () => {
    it('shows current session when active', () => {
      const person = createMockPerson({
        activeSession: {
          id: 'session-active',
          stage: Stage.PERSPECTIVE_STRETCH,
          status: 'waiting_on_you',
          lastUpdate: '2h ago',
        },
      });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText(/perspective stretch/i)).toBeTruthy();
      expect(screen.getByText(/continue session/i)).toBeTruthy();
    });

    it('shows status when waiting on partner', () => {
      const person = createMockPerson({
        name: 'Alex',
        activeSession: {
          id: 'session-active',
          stage: Stage.WITNESS,
          status: 'waiting_on_partner',
          lastUpdate: '1d ago',
        },
      });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText(/waiting for alex/i)).toBeTruthy();
    });

    it('navigates to session when continue button pressed', () => {
      const person = createMockPerson({
        activeSession: {
          id: 'session-active-123',
          stage: Stage.PERSPECTIVE_STRETCH,
          status: 'your_turn',
          lastUpdate: '1h ago',
        },
      });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      fireEvent.press(screen.getByText(/continue session/i));

      expect(mockPush).toHaveBeenCalledWith('/session/session-active-123');
    });
  });

  describe('No Active Session', () => {
    it('shows start new session button when no active session', () => {
      const person = createMockPerson({ activeSession: null });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText(/start new session/i)).toBeTruthy();
    });

    it('navigates to new session with partnerId when start pressed', () => {
      const person = createMockPerson({ id: 'person-456', activeSession: null });
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="person-456" />);

      fireEvent.press(screen.getByText(/start new session/i));

      expect(mockPush).toHaveBeenCalledWith('/session/new?partnerId=person-456');
    });
  });

  describe('Past Sessions', () => {
    it('shows past sessions list', () => {
      const person = createMockPerson();
      const pastSessions = [
        createMockPastSession({ topic: 'Household responsibilities', date: 'Dec 15, 2024' }),
        createMockPastSession({ id: 'session-past-2', topic: 'Holiday planning', date: 'Nov 28, 2024' }),
      ];
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: pastSessions, isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText(/past sessions/i)).toBeTruthy();
      expect(screen.getByText('Household responsibilities')).toBeTruthy();
      expect(screen.getByText('Holiday planning')).toBeTruthy();
    });

    it('shows empty message when no past sessions', () => {
      const person = createMockPerson();
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: [], isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      expect(screen.getByText(/no past sessions yet/i)).toBeTruthy();
    });

    it('navigates to review when tapping past session', () => {
      const person = createMockPerson();
      const pastSessions = [createMockPastSession({ id: 'session-past-1', topic: 'Test topic' })];
      mockUsePerson.mockReturnValue({ data: person, isLoading: false });
      mockUsePastSessions.mockReturnValue({ data: pastSessions, isLoading: false });

      renderWithProviders(<PersonDetailScreen personId="123" />);

      fireEvent.press(screen.getByText('Test topic'));

      expect(mockPush).toHaveBeenCalledWith('/session/session-past-1/review');
    });
  });

  describe('Loading State', () => {
    it('shows nothing when loading', () => {
      mockUsePerson.mockReturnValue({ data: undefined, isLoading: true });
      mockUsePastSessions.mockReturnValue({ data: undefined, isLoading: true });

      const { toJSON } = renderWithProviders(<PersonDetailScreen personId="123" />);

      // Should render null while loading
      expect(toJSON()).toBeNull();
    });
  });
});
