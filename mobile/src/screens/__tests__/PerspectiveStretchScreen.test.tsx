/**
 * PerspectiveStretchScreen Tests
 *
 * Tests for Stage 2 - Perspective Stretch functionality.
 * Covers all phases: building, ready_to_share, waiting_for_partner, validation, complete.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Stage, StageStatus } from '@be-heard/shared';

// ============================================================================
// Mocks
// ============================================================================

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

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
  };
});

// Default mock implementations
const mockSessionData = {
  session: {
    id: 'test-session-123',
    partner: { id: 'partner-1', name: 'Alex' },
    status: 'ACTIVE',
  },
};

const createProgressData = (overrides = {}) => ({
  sessionId: 'test-session-123',
  myProgress: {
    stage: Stage.PERSPECTIVE_STRETCH,
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date().toISOString(),
    completedAt: null,
    gates: {},
  },
  partnerProgress: {
    stage: Stage.PERSPECTIVE_STRETCH,
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date().toISOString(),
    completedAt: null,
    gates: {},
  },
  canAdvance: false,
  ...overrides,
});

interface EmpathyDraftOverrides {
  draft?: Record<string, unknown>;
  canConsent?: boolean;
  alreadyConsented?: boolean;
}

const createEmpathyDraft = (overrides: EmpathyDraftOverrides = {}) => ({
  draft: {
    id: 'draft-1',
    content: 'I understand you feel frustrated because...',
    version: 1,
    readyToShare: false,
    updatedAt: new Date().toISOString(),
    ...(overrides.draft ?? {}),
  },
  canConsent: overrides.canConsent ?? false,
  alreadyConsented: overrides.alreadyConsented ?? false,
});

const createPartnerEmpathy = (overrides = {}) => ({
  attempt: {
    id: 'attempt-1',
    sourceUserId: 'partner-1',
    content: "I can see that you're feeling overwhelmed by the situation...",
    sharedAt: new Date().toISOString(),
    consentRecordId: 'consent-1',
  },
  waitingForPartner: false,
  validated: false,
  validatedAt: null,
  awaitingRevision: false,
  ...overrides,
});

// Mutable mock state for dynamic testing
let mockEmpathyDraftData = createEmpathyDraft();
let mockPartnerEmpathyData = createPartnerEmpathy();
let mockProgressData = createProgressData();
let mockSessionLoading = false;
let mockProgressLoading = false;
let mockDraftLoading = false;
let mockPartnerEmpathyLoading = false;

const mockConsentToShare = jest.fn();
const mockValidateEmpathy = jest.fn();
const mockSaveEmpathyDraft = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('../../hooks/useSessions', () => ({
  useSession: () => ({
    data: mockSessionData,
    isLoading: mockSessionLoading,
  }),
}));

jest.mock('../../hooks/useStages', () => ({
  useProgress: () => ({
    data: mockProgressData,
    isLoading: mockProgressLoading,
  }),
  useEmpathyDraft: () => ({
    data: mockEmpathyDraftData,
    isLoading: mockDraftLoading,
  }),
  usePartnerEmpathy: () => ({
    data: mockPartnerEmpathyData,
    isLoading: mockPartnerEmpathyLoading,
  }),
  useSaveEmpathyDraft: () => ({
    mutate: mockSaveEmpathyDraft,
    isPending: false,
  }),
  useConsentToShareEmpathy: () => ({
    mutate: mockConsentToShare,
    isPending: false,
  }),
  useValidateEmpathy: () => ({
    mutate: mockValidateEmpathy,
    isPending: false,
  }),
}));

jest.mock('../../hooks/useMessages', () => ({
  useMessages: () => ({
    data: { messages: [], hasMore: false },
    isLoading: false,
  }),
  useSendMessage: () => ({
    mutate: mockSendMessage,
    isPending: false,
  }),
}));

// Import after mocks
import { PerspectiveStretchScreen } from '../PerspectiveStretchScreen';

// ============================================================================
// Tests
// ============================================================================

describe('PerspectiveStretchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to defaults
    mockEmpathyDraftData = createEmpathyDraft();
    mockPartnerEmpathyData = createPartnerEmpathy();
    mockProgressData = createProgressData();
    mockSessionLoading = false;
    mockProgressLoading = false;
    mockDraftLoading = false;
    mockPartnerEmpathyLoading = false;
  });

  // --------------------------------------------------------------------------
  // Loading State
  // --------------------------------------------------------------------------

  describe('Loading State', () => {
    it('shows loading indicator while fetching session data', () => {
      mockSessionLoading = true;
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/loading/i)).toBeTruthy();
    });

    it('shows loading indicator while fetching progress data', () => {
      mockProgressLoading = true;
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/loading/i)).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Building Phase (Empathy Drafting with AI)
  // --------------------------------------------------------------------------

  describe('Building Phase', () => {
    beforeEach(() => {
      mockEmpathyDraftData = createEmpathyDraft({
        draft: undefined,
        canConsent: false,
        alreadyConsented: false,
      });
      mockPartnerEmpathyData = createPartnerEmpathy({
        attempt: null,
        waitingForPartner: true,
      });
    });

    it('shows empathy building phase initially', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/building your understanding/i)).toBeTruthy();
    });

    it('shows subtitle about understanding partner perspective', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getAllByText(/partner's perspective/i).length).toBeGreaterThan(0);
    });

    it('renders the chat interface for AI assistance', () => {
      render(<PerspectiveStretchScreen />);
      // ChatInterface should be rendered
      expect(screen.getByTestId('chat-message-list')).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Ready to Share Phase (Consent Prompt)
  // --------------------------------------------------------------------------

  describe('Ready to Share Phase', () => {
    beforeEach(() => {
      mockEmpathyDraftData = createEmpathyDraft({
        draft: {
          id: 'draft-1',
          content: 'My understanding of your perspective...',
          version: 1,
          readyToShare: true,
          updatedAt: new Date().toISOString(),
        },
        canConsent: true,
        alreadyConsented: false,
      });
      mockPartnerEmpathyData = createPartnerEmpathy({
        attempt: null,
        waitingForPartner: true,
      });
    });

    it('shows consent prompt when draft is ready to share', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/share your attempt/i)).toBeTruthy();
    });

    it('shows the empathy attempt card with draft content', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/My understanding of your perspective/i)).toBeTruthy();
    });

    it('shows consent and decline buttons', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/yes, share this/i)).toBeTruthy();
      expect(screen.getByText(/not yet/i)).toBeTruthy();
    });

    it('calls consentToShare mutation when user consents', () => {
      render(<PerspectiveStretchScreen />);
      const consentButton = screen.getByText(/yes, share this/i);
      fireEvent.press(consentButton);
      expect(mockConsentToShare).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Waiting for Partner Phase
  // --------------------------------------------------------------------------

  describe('Waiting for Partner Phase', () => {
    beforeEach(() => {
      mockEmpathyDraftData = createEmpathyDraft({
        draft: {
          id: 'draft-1',
          content: 'My understanding...',
          version: 1,
          readyToShare: true,
          updatedAt: new Date().toISOString(),
        },
        canConsent: false,
        alreadyConsented: true,
      });
      mockPartnerEmpathyData = createPartnerEmpathy({
        attempt: null,
        waitingForPartner: true,
        validated: false,
      });
    });

    it('shows waiting room when user has consented but partner has not', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getAllByText(/waiting for/i).length).toBeGreaterThan(0);
    });

    it('shows partner name in waiting message', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getAllByText(/Alex/i).length).toBeGreaterThan(0);
    });

    it('shows waiting indicator', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByTestId('waiting-indicator')).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Validation Phase (Reviewing Partner's Attempt)
  // --------------------------------------------------------------------------

  describe('Validation Phase', () => {
    beforeEach(() => {
      mockEmpathyDraftData = createEmpathyDraft({
        draft: {
          id: 'draft-1',
          content: 'My understanding...',
          version: 1,
          readyToShare: true,
          updatedAt: new Date().toISOString(),
        },
        canConsent: false,
        alreadyConsented: true,
      });
      mockPartnerEmpathyData = createPartnerEmpathy({
        attempt: {
          id: 'attempt-1',
          sourceUserId: 'partner-1',
          content: "I can see that you're feeling overwhelmed by the situation...",
          sharedAt: new Date().toISOString(),
          consentRecordId: 'consent-1',
        },
        waitingForPartner: false,
        validated: false,
        validatedAt: null,
        awaitingRevision: false,
      });
    });

    it('shows partner empathy attempt in validation phase', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/partner's.*understanding.*you/i)).toBeTruthy();
    });

    it('displays partner attempt content', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/feeling overwhelmed/i)).toBeTruthy();
    });

    it('shows accuracy feedback options', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/how accurate is this/i)).toBeTruthy();
    });

    it('shows accurate, partially accurate, and inaccurate buttons', () => {
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/this feels accurate/i)).toBeTruthy();
      expect(screen.getByText(/partially accurate/i)).toBeTruthy();
      expect(screen.getByText(/misses the mark/i)).toBeTruthy();
    });

    it('calls validateEmpathy with validated=true when user selects accurate', () => {
      render(<PerspectiveStretchScreen />);
      const accurateButton = screen.getByText(/this feels accurate/i);
      fireEvent.press(accurateButton);
      expect(mockValidateEmpathy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-123',
          validated: true,
        })
      );
    });

    it('calls validateEmpathy with validated=false for partially accurate', () => {
      render(<PerspectiveStretchScreen />);
      const partialButton = screen.getByText(/partially accurate/i);
      fireEvent.press(partialButton);
      expect(mockValidateEmpathy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-123',
          validated: false,
        })
      );
    });

    it('calls validateEmpathy with validated=false for inaccurate', () => {
      render(<PerspectiveStretchScreen />);
      const inaccurateButton = screen.getByText(/misses the mark/i);
      fireEvent.press(inaccurateButton);
      expect(mockValidateEmpathy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-123',
          validated: false,
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Complete Phase
  // --------------------------------------------------------------------------

  describe('Complete Phase', () => {
    beforeEach(() => {
      mockProgressData = createProgressData({
        myProgress: {
          stage: Stage.PERSPECTIVE_STRETCH,
          status: StageStatus.COMPLETED,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          gates: { empathy_validated: true },
        },
        canAdvance: true,
      });
      mockPartnerEmpathyData = createPartnerEmpathy({
        validated: true,
        validatedAt: new Date().toISOString(),
      });
    });

    it('navigates to session page when stage is complete', async () => {
      render(<PerspectiveStretchScreen />);
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/session/test-session-123');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Stage Gate Checks
  // --------------------------------------------------------------------------

  describe('Stage Gate Checks', () => {
    it('shows locked message when not on perspective stretch stage', () => {
      mockProgressData = createProgressData({
        myProgress: {
          stage: Stage.WITNESS,
          status: StageStatus.IN_PROGRESS,
          startedAt: new Date().toISOString(),
          completedAt: null,
          gates: {},
        },
      });
      render(<PerspectiveStretchScreen />);
      expect(screen.getByText(/unlocked after completing/i)).toBeTruthy();
    });
  });
});
