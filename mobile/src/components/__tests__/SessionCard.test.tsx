/**
 * SessionCard Component Tests
 *
 * Tests for the session card component that displays session summaries.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SessionCard } from '../SessionCard';
import { SessionSummaryDTO, SessionStatus, Stage, StageStatus } from '@be-heard/shared';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

describe('SessionCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders partner name', () => {
    const session = createMockSession({ partner: { id: 'user-2', name: 'John Smith' } });
    render(<SessionCard session={session} />);

    expect(screen.getByText('John Smith')).toBeTruthy();
  });

  it('renders fallback when partner has no name', () => {
    const session = createMockSession({ partner: { id: 'user-2', name: null } });
    render(<SessionCard session={session} />);

    expect(screen.getByText('Partner')).toBeTruthy();
  });

  it('renders current stage name', () => {
    const session = createMockSession({
      myProgress: {
        stage: Stage.WITNESS,
        status: StageStatus.IN_PROGRESS,
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: null,
      },
    });
    render(<SessionCard session={session} />);

    expect(screen.getByText('The Witness')).toBeTruthy();
  });

  it('shows "Your turn" when action is needed from self', () => {
    const session = createMockSession({
      selfActionNeeded: ['complete_stage'],
    });
    render(<SessionCard session={session} />);

    expect(screen.getByText('Your turn')).toBeTruthy();
  });

  it('shows "Waiting for partner" when partner action is needed', () => {
    const session = createMockSession({
      partnerActionNeeded: ['complete_stage'],
    });
    render(<SessionCard session={session} />);

    expect(screen.getByText('Waiting for partner')).toBeTruthy();
  });

  it('renders with testID session-card for regular cards', () => {
    const session = createMockSession();
    render(<SessionCard session={session} />);

    expect(screen.getByTestId('session-card')).toBeTruthy();
  });

  it('renders with testID hero-card when isHero is true', () => {
    const session = createMockSession();
    render(<SessionCard session={session} isHero />);

    expect(screen.getByTestId('hero-card')).toBeTruthy();
  });

  it('navigates to session detail on press', () => {
    const session = createMockSession({ id: 'session-123' });
    render(<SessionCard session={session} />);

    fireEvent.press(screen.getByTestId('session-card'));

    expect(mockPush).toHaveBeenCalledWith('/session/session-123');
  });

  it('shows action indicator badge when action is needed', () => {
    const session = createMockSession({
      selfActionNeeded: ['complete_stage'],
    });
    render(<SessionCard session={session} />);

    expect(screen.getByTestId('action-badge')).toBeTruthy();
  });

  it('does not show action indicator badge when no action is needed', () => {
    const session = createMockSession({
      selfActionNeeded: [],
    });
    render(<SessionCard session={session} />);

    expect(screen.queryByTestId('action-badge')).toBeNull();
  });

  // Status indicator tests
  describe('status indicators', () => {
    it('shows invited status badge for INVITED sessions', () => {
      const session = createMockSession({
        status: SessionStatus.INVITED,
      });
      render(<SessionCard session={session} />);

      expect(screen.getByText('Pending')).toBeTruthy();
    });

    it('shows paused status badge for PAUSED sessions', () => {
      const session = createMockSession({
        status: SessionStatus.PAUSED,
      });
      render(<SessionCard session={session} />);

      expect(screen.getByText('Paused')).toBeTruthy();
    });

    it('shows resolved status badge for RESOLVED sessions', () => {
      const session = createMockSession({
        status: SessionStatus.RESOLVED,
      });
      render(<SessionCard session={session} />);

      expect(screen.getByText('Resolved')).toBeTruthy();
    });
  });

  // Time since update tests
  describe('time display', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-03T12:00:00Z'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('shows time since last update', () => {
      const session = createMockSession({
        updatedAt: '2024-01-03T10:00:00Z', // 2 hours ago
      });
      render(<SessionCard session={session} />);

      expect(screen.getByText('2h ago')).toBeTruthy();
    });

    it('shows days for older sessions', () => {
      const session = createMockSession({
        updatedAt: '2024-01-01T12:00:00Z', // 2 days ago
      });
      render(<SessionCard session={session} />);

      expect(screen.getByText('2d ago')).toBeTruthy();
    });
  });

  // Hero card messaging tests
  describe('hero card messaging', () => {
    it('shows "is waiting for you" message when partner is waiting', () => {
      const session = createMockSession({
        partner: { id: 'user-2', name: 'Alex' },
        selfActionNeeded: ['complete_stage'],
        partnerProgress: {
          stage: Stage.WITNESS,
          status: StageStatus.GATE_PENDING, // Partner completed, waiting on us
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-02T00:00:00Z',
        },
      });
      render(<SessionCard session={session} isHero />);

      expect(screen.getByText('Alex is waiting for you')).toBeTruthy();
    });

    it('shows "Ready to continue" message when your turn but partner not waiting', () => {
      const session = createMockSession({
        partner: { id: 'user-2', name: 'Alex' },
        selfActionNeeded: ['complete_stage'],
        partnerProgress: {
          stage: Stage.WITNESS,
          status: StageStatus.IN_PROGRESS,
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: null,
        },
      });
      render(<SessionCard session={session} isHero />);

      expect(screen.getByText('Ready to continue with Alex')).toBeTruthy();
    });

    it('shows "Waiting for partner" message when you are waiting', () => {
      const session = createMockSession({
        partner: { id: 'user-2', name: 'Alex' },
        selfActionNeeded: [],
        partnerActionNeeded: ['complete_stage'],
      });
      render(<SessionCard session={session} isHero />);

      expect(screen.getByText('Waiting for Alex')).toBeTruthy();
    });
  });
});
