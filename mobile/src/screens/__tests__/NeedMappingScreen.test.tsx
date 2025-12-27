/**
 * NeedMappingScreen Tests
 *
 * Tests for Stage 3 Need Mapping screen covering:
 * - Exploration phase (chat with AI)
 * - Review phase (show identified needs)
 * - Common ground discovery
 * - Confirmation flow
 * - Waiting for partner
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Stage, StageStatus, NeedCategory, MessageRole, CommonGroundDTO } from '@be-heard/shared';

// Mock expo-router
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'test-session-123' }),
  useRouter: () => ({
    push: mockPush,
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

// Default mock data - unconfirmed needs (for review phase)
const mockNeedsUnconfirmed = [
  {
    id: 'need-1',
    need: 'Security',
    category: NeedCategory.SAFETY,
    description: 'A need to feel safe and stable in the relationship',
    evidence: ['I felt unsafe when...'],
    confirmed: false,
    aiConfidence: 0.85,
  },
  {
    id: 'need-2',
    need: 'Connection',
    category: NeedCategory.CONNECTION,
    description: 'A need to feel close and emotionally connected',
    evidence: ['I miss feeling close...'],
    confirmed: false,
    aiConfidence: 0.9,
  },
];

// Confirmed needs (for common ground phase)
const mockNeedsConfirmed = [
  {
    id: 'need-1',
    need: 'Security',
    category: NeedCategory.SAFETY,
    description: 'A need to feel safe and stable in the relationship',
    evidence: ['I felt unsafe when...'],
    confirmed: true,
    aiConfidence: 0.85,
  },
  {
    id: 'need-2',
    need: 'Connection',
    category: NeedCategory.CONNECTION,
    description: 'A need to feel close and emotionally connected',
    evidence: ['I miss feeling close...'],
    confirmed: true,
    aiConfidence: 0.9,
  },
];

const mockCommonGround: CommonGroundDTO[] = [
  {
    id: 'cg-1',
    need: 'Security',
    category: NeedCategory.SAFETY,
    description: 'Both want to feel safe with each other',
    confirmedByMe: false,
    confirmedByPartner: false,
    confirmedAt: null,
  },
];

const mockMessages = [
  {
    id: 'msg-1',
    sessionId: 'test-session-123',
    role: MessageRole.AI,
    content: 'Let me help you understand what you need.',
    stage: Stage.NEED_MAPPING,
    timestamp: new Date().toISOString(),
  },
];

// Type definitions for mock data
type NeedsType = typeof mockNeedsUnconfirmed;

// Mock hooks - these will be overridden per test
let mockNeedsData: { needs: NeedsType; synthesizedAt: string; isDirty: boolean } = {
  needs: [],
  synthesizedAt: '',
  isDirty: false,
};
let mockCommonGroundData: {
  commonGround: CommonGroundDTO[];
  analysisComplete: boolean;
  bothConfirmed: boolean;
} = { commonGround: [], analysisComplete: false, bothConfirmed: false };
let mockMessagesData = { messages: mockMessages };
let mockProgressData: {
  myProgress: { stage: Stage; status: StageStatus };
  partnerProgress: { stage: Stage; status: StageStatus };
} = {
  myProgress: { stage: Stage.NEED_MAPPING, status: StageStatus.IN_PROGRESS },
  partnerProgress: { stage: Stage.NEED_MAPPING, status: StageStatus.IN_PROGRESS },
};

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

jest.mock('../../hooks/useMessages', () => ({
  useMessages: () => ({
    data: mockMessagesData,
    isLoading: false,
  }),
  useSendMessage: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useOptimisticMessage: () => ({
    addOptimisticMessage: jest.fn(() => 'temp-id'),
    removeOptimisticMessage: jest.fn(),
  }),
}));

jest.mock('../../hooks/useStages', () => ({
  useProgress: () => ({
    data: mockProgressData,
    isLoading: false,
  }),
  useNeeds: () => ({
    data: mockNeedsData,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useConfirmNeeds: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useAddNeed: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useConsentShareNeeds: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useCommonGround: () => ({
    data: mockCommonGroundData,
    isLoading: false,
  }),
  useConfirmCommonGround: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

// Import after mocks
import { NeedMappingScreen } from '../NeedMappingScreen';

describe('NeedMappingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to defaults - exploration phase (no needs yet)
    mockNeedsData = { needs: [], synthesizedAt: '', isDirty: false };
    mockCommonGroundData = { commonGround: [], analysisComplete: false, bothConfirmed: false };
    mockMessagesData = { messages: mockMessages };
    mockProgressData = {
      myProgress: { stage: Stage.NEED_MAPPING, status: StageStatus.IN_PROGRESS },
      partnerProgress: { stage: Stage.NEED_MAPPING, status: StageStatus.IN_PROGRESS },
    };
  });

  describe('Exploration Phase (no needs yet)', () => {
    it('renders the exploration screen title', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText('Understanding Your Needs')).toBeTruthy();
    });

    it('renders the exploration subtitle', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/underlying needs/i)).toBeTruthy();
    });

    it('shows chat interface in exploration phase', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText('Understanding Your Needs')).toBeTruthy();
    });

    it('shows AI messages in chat', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText('Let me help you understand what you need.')).toBeTruthy();
    });
  });

  describe('Review Phase (needs identified, not confirmed)', () => {
    beforeEach(() => {
      mockNeedsData = {
        needs: mockNeedsUnconfirmed,
        synthesizedAt: new Date().toISOString(),
        isDirty: false,
      };
    });

    it('shows identified needs section', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText('Your Identified Needs')).toBeTruthy();
    });

    it('displays all identified needs', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText('Security')).toBeTruthy();
      expect(screen.getByText('Connection')).toBeTruthy();
    });

    it('shows need descriptions', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/feel safe and stable/i)).toBeTruthy();
      expect(screen.getByText(/emotionally connected/i)).toBeTruthy();
    });

    it('allows adjusting needs', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/adjust/i)).toBeTruthy();
    });

    it('shows confirm button', () => {
      render(<NeedMappingScreen />);
      const confirmButton = screen.getByText(/confirm/i);
      expect(confirmButton).toBeTruthy();
    });
  });

  describe('Common Ground Discovery (needs confirmed, common ground found)', () => {
    beforeEach(() => {
      // Needs must be confirmed for common ground phase
      mockNeedsData = {
        needs: mockNeedsConfirmed,
        synthesizedAt: new Date().toISOString(),
        isDirty: false,
      };
      mockCommonGroundData = {
        commonGround: mockCommonGround,
        analysisComplete: true,
        bothConfirmed: false,
      };
    });

    it('shows common ground when found', () => {
      render(<NeedMappingScreen />);
      // Use getAllByText since "Shared Needs" appears in both title and content
      const sharedNeedsElements = screen.getAllByText(/shared needs/i);
      expect(sharedNeedsElements.length).toBeGreaterThan(0);
    });

    it('shows shared need details', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/both want to feel safe/i)).toBeTruthy();
    });

    it('shows continue button', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/continue/i)).toBeTruthy();
    });
  });

  describe('Waiting Phase (partner behind in progress)', () => {
    beforeEach(() => {
      mockProgressData = {
        myProgress: { stage: Stage.STRATEGIC_REPAIR, status: StageStatus.IN_PROGRESS },
        partnerProgress: { stage: Stage.NEED_MAPPING, status: StageStatus.IN_PROGRESS },
      };
    });

    it('shows waiting room when partner is behind', () => {
      render(<NeedMappingScreen />);
      // Use getAllByText since "Waiting" appears in both title and message
      const waitingElements = screen.getAllByText(/waiting/i);
      expect(waitingElements.length).toBeGreaterThan(0);
    });

    it('shows partner name in waiting message', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/Alex/)).toBeTruthy();
    });

    it('shows waiting message about partner completing needs', () => {
      render(<NeedMappingScreen />);
      expect(screen.getByText(/partner to complete need mapping/i)).toBeTruthy();
    });
  });

  describe('Stage Gate Check', () => {
    it('shows locked message if not at need mapping stage', () => {
      mockProgressData = {
        myProgress: { stage: Stage.PERSPECTIVE_STRETCH, status: StageStatus.IN_PROGRESS },
        partnerProgress: { stage: Stage.PERSPECTIVE_STRETCH, status: StageStatus.IN_PROGRESS },
      };
      render(<NeedMappingScreen />);
      expect(screen.getByText(/unlocked/i)).toBeTruthy();
    });
  });
});
