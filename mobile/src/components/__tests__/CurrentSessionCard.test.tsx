/**
 * CurrentSessionCard Component Tests
 *
 * Tests for the current session card that shows active session status and continue action.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CurrentSessionCard } from '../CurrentSessionCard';
import { Stage } from '@meet-without-fear/shared';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('CurrentSessionCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('Stage Display', () => {
    it('shows stage name for Perspective Stretch', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.PERSPECTIVE_STRETCH}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="2h ago"
        />
      );

      expect(screen.getByText('Perspective Stretch')).toBeTruthy();
    });

    it('shows stage name for Witness stage', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByText('The Witness')).toBeTruthy();
    });

    it('shows stage name for Need Mapping', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.NEED_MAPPING}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="30m ago"
        />
      );

      expect(screen.getByText('Need Mapping')).toBeTruthy();
    });
  });

  describe('Status Messages', () => {
    it('shows waiting message when waiting on partner', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="waiting_on_partner"
          partnerName="Alex"
          lastUpdate="1d ago"
        />
      );

      expect(screen.getByText('Waiting for Alex - 1d ago')).toBeTruthy();
    });

    it('shows both active message when both working', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="both_active"
          partnerName="Alex"
          lastUpdate="now"
        />
      );

      expect(screen.getByText('Both working on The Witness')).toBeTruthy();
    });

    it('shows ready message when your turn', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.PERSPECTIVE_STRETCH}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByText('Ready to continue - 1h ago')).toBeTruthy();
    });

    it('shows waiting on you message', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.NEED_MAPPING}
          status="waiting_on_you"
          partnerName="Alex"
          lastUpdate="3h ago"
        />
      );

      expect(screen.getByText('Waiting on you - 3h ago')).toBeTruthy();
    });
  });

  describe('Continue Button', () => {
    it('shows continue session button', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByText('Continue Session')).toBeTruthy();
    });

    it('navigates to session on button press', () => {
      render(
        <CurrentSessionCard
          sessionId="session-abc-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      fireEvent.press(screen.getByText('Continue Session'));

      expect(mockPush).toHaveBeenCalledWith('/session/session-abc-123');
    });

    it('has accessible button role', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('has accessible label on button', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByLabelText('Continue session')).toBeTruthy();
    });
  });

  describe('TestID', () => {
    it('renders with testID for testing', () => {
      render(
        <CurrentSessionCard
          sessionId="session-123"
          stage={Stage.WITNESS}
          status="your_turn"
          partnerName="Alex"
          lastUpdate="1h ago"
        />
      );

      expect(screen.getByTestId('current-session-card')).toBeTruthy();
    });
  });
});
