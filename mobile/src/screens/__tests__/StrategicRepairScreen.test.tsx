/**
 * StrategicRepairScreen Tests
 *
 * Tests for Stage 4 Strategic Repair screen.
 * Covers strategy pool, ranking, overlap reveal, and agreement phases.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StrategyPhase } from '@meet-without-fear/shared';

// Import after mocks
import { StrategicRepairScreen } from '../StrategicRepairScreen';

// ============================================================================
// Mocks
// ============================================================================

// Mock expo-router
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'test-session-123' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
  };
});

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const mockIcon = (props: Record<string, unknown>) =>
    React.createElement('Icon', props);
  return new Proxy(
    {},
    {
      get: () => mockIcon,
    }
  );
});

// ============================================================================
// Test Helpers
// ============================================================================

const mockStrategies = [
  {
    id: 'strategy-1',
    description: 'Take turns speaking without interruption',
    needsAddressed: ['communication'],
    duration: '2 weeks',
    measureOfSuccess: null,
  },
  {
    id: 'strategy-2',
    description: 'Schedule a weekly check-in conversation',
    needsAddressed: ['quality-time'],
    duration: '1 month',
    measureOfSuccess: null,
  },
  {
    id: 'strategy-3',
    description: 'Practice active listening exercises',
    needsAddressed: ['respect'],
    duration: null,
    measureOfSuccess: null,
  },
];

const mockOverlap = [
  {
    id: 'strategy-1',
    description: 'Take turns speaking without interruption',
    needsAddressed: ['communication'],
    duration: '2 weeks',
    measureOfSuccess: null,
  },
];

const mockAgreement = {
  id: 'agreement-1',
  description: 'Take turns speaking without interruption for 5 minutes each',
  duration: '2 weeks',
  measureOfSuccess: 'Both partners feel heard after each conversation',
  status: 'PENDING',
  agreedByMe: false,
  agreedByPartner: false,
  agreedAt: null,
  followUpDate: 'January 15, 2025',
};

// Create configurable mock state
let mockStrategyPhase = StrategyPhase.COLLECTING;
let mockStrategiesData = mockStrategies;
let mockRevealData: { overlap: typeof mockStrategies; phase: StrategyPhase } | null = null;
let mockAgreementsData: { agreements: typeof mockAgreement[] } | null = null;

// Mock hook return values
const mockRequestSuggestions = jest.fn();
const mockMarkReady = jest.fn();
const mockSubmitRankings = jest.fn();
const mockConfirmAgreement = jest.fn();
const mockResolveSession = jest.fn();
const mockProposeStrategy = jest.fn();
const mockCreateAgreement = jest.fn();

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

jest.mock('../../hooks/useStages', () => ({
  useStrategies: () => ({
    data: {
      strategies: mockStrategiesData,
      phase: mockStrategyPhase,
      aiSuggestionsAvailable: true,
    },
    isLoading: false,
  }),
  useRequestStrategySuggestions: () => ({
    mutate: mockRequestSuggestions,
    isPending: false,
  }),
  useMarkReadyToRank: () => ({
    mutate: mockMarkReady,
  }),
  useSubmitRankings: () => ({
    mutate: mockSubmitRankings,
  }),
  useStrategiesReveal: () => ({
    data: mockRevealData,
  }),
  useAgreements: () => ({
    data: mockAgreementsData,
  }),
  useConfirmAgreement: () => ({
    mutate: mockConfirmAgreement,
  }),
  useResolveSession: () => ({
    mutate: mockResolveSession,
  }),
  useCommonGround: () => ({
    data: { commonGround: [] },
    isLoading: false,
  }),
  useProposeStrategy: () => ({
    mutate: mockProposeStrategy,
    isPending: false,
  }),
  useCreateAgreement: () => ({
    mutate: mockCreateAgreement,
    isPending: false,
  }),
}));

// ============================================================================
// Tests
// ============================================================================

describe('StrategicRepairScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default state
    mockStrategyPhase = StrategyPhase.COLLECTING;
    mockStrategiesData = mockStrategies;
    mockRevealData = null;
    mockAgreementsData = null;
  });

  describe('Strategy Pool Phase', () => {
    it('shows strategy pool without attribution', () => {
      render(<StrategicRepairScreen />);

      // Verify strategies shown without "You suggested" or "Partner suggested"
      expect(screen.queryByText(/you suggested/i)).toBeNull();
      expect(screen.queryByText(/partner suggested/i)).toBeNull();
    });

    it('displays all strategies in the pool', () => {
      render(<StrategicRepairScreen />);

      expect(
        screen.getByText('Take turns speaking without interruption')
      ).toBeTruthy();
      expect(
        screen.getByText('Schedule a weekly check-in conversation')
      ).toBeTruthy();
      expect(
        screen.getByText('Practice active listening exercises')
      ).toBeTruthy();
    });

    it('allows requesting more AI suggestions', () => {
      render(<StrategicRepairScreen />);

      const moreButton = screen.getByText(/generate more ideas/i);
      expect(moreButton).toBeTruthy();

      fireEvent.press(moreButton);
      expect(mockRequestSuggestions).toHaveBeenCalledWith({
        sessionId: 'test-session-123',
        count: 3,
      });
    });

    it('allows proceeding to ranking', () => {
      render(<StrategicRepairScreen />);

      const readyButton = screen.getByText(/rank my choices/i);
      expect(readyButton).toBeTruthy();

      fireEvent.press(readyButton);
      expect(mockMarkReady).toHaveBeenCalledWith({
        sessionId: 'test-session-123',
      });
    });
  });

  describe('Ranking Phase', () => {
    beforeEach(() => {
      mockStrategyPhase = StrategyPhase.RANKING;
    });

    it('shows private ranking interface', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/rank your top choices/i)).toBeTruthy();
    });

    it('explains that rankings are private', () => {
      render(<StrategicRepairScreen />);

      expect(
        screen.getByText(/partner will not see your picks until/i)
      ).toBeTruthy();
    });

    it('allows selecting and submitting rankings', () => {
      render(<StrategicRepairScreen />);

      // Select strategies
      fireEvent.press(
        screen.getByText('Take turns speaking without interruption')
      );
      fireEvent.press(
        screen.getByText('Schedule a weekly check-in conversation')
      );

      // Submit
      fireEvent.press(screen.getByText(/submit my ranking/i));

      expect(mockSubmitRankings).toHaveBeenCalledWith({
        sessionId: 'test-session-123',
        rankedIds: ['strategy-1', 'strategy-2'],
      });
    });
  });

  describe('Waiting Phase', () => {
    beforeEach(() => {
      mockStrategyPhase = StrategyPhase.REVEALING;
      mockRevealData = null; // No reveal data yet = waiting
    });

    it('shows waiting room when partner has not submitted', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/waiting for your partner/i)).toBeTruthy();
    });

    it('shows partner name in waiting message', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getAllByText(/alex/i).length).toBeGreaterThan(0);
    });
  });

  describe('Reveal Phase', () => {
    beforeEach(() => {
      mockStrategyPhase = StrategyPhase.REVEALING;
      mockRevealData = {
        overlap: mockOverlap,
        phase: StrategyPhase.REVEALING,
      };
    });

    it('reveals overlap after both rank', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/you both chose/i)).toBeTruthy();
    });

    it('shows shared strategies', () => {
      render(<StrategicRepairScreen />);

      expect(
        screen.getByText('Take turns speaking without interruption')
      ).toBeTruthy();
    });

    it('shows positive messaging for common ground', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/shared priorities/i)).toBeTruthy();
    });
  });

  describe('Agreement Phase', () => {
    beforeEach(() => {
      mockStrategyPhase = StrategyPhase.NEGOTIATING;
      mockAgreementsData = { agreements: [mockAgreement] };
    });

    it('shows agreement card', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/micro-experiment agreement/i)).toBeTruthy();
    });

    it('displays agreement details', () => {
      render(<StrategicRepairScreen />);

      expect(
        screen.getByText(
          'Take turns speaking without interruption for 5 minutes each'
        )
      ).toBeTruthy();
      expect(screen.getByText('2 weeks')).toBeTruthy();
    });

    it('allows confirming agreement', () => {
      render(<StrategicRepairScreen />);

      const confirmButton = screen.getByText(/confirm agreement/i);
      expect(confirmButton).toBeTruthy();

      fireEvent.press(confirmButton);
      expect(mockConfirmAgreement).toHaveBeenCalled();
    });
  });

  describe('No Overlap Case', () => {
    beforeEach(() => {
      mockStrategyPhase = StrategyPhase.REVEALING;
      mockRevealData = {
        overlap: [], // No overlap
        phase: StrategyPhase.REVEALING,
      };
    });

    it('handles no overlap gracefully', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/different priorities/i)).toBeTruthy();
    });

    it('shows encouraging message when no overlap', () => {
      render(<StrategicRepairScreen />);

      expect(screen.getByText(/your rankings did not overlap/i)).toBeTruthy();
    });
  });
});
