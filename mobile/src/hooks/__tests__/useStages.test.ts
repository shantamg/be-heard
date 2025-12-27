/**
 * useStages Hook Tests
 *
 * Tests for stage-specific API hooks covering all 5 stages of the BeHeard process.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useProgress,
  useCompactStatus,
  useSignCompact,
  useConfirmFeelHeard,
  useEmpathyDraft,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  usePartnerEmpathy,
  useValidateEmpathy,
  useNeeds,
  useConfirmNeeds,
  useAddNeed,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
  useStrategies,
  useProposeStrategy,
  useSubmitRankings,
  useStrategiesReveal,
  useAgreements,
  useCreateAgreement,
  useConfirmAgreement,
  useResolveSession,
  stageKeys,
} from '../useStages';
import { Stage, StageStatus, NeedCategory, AgreementType, AgreementStatus, StrategyPhase } from '@be-heard/shared';

// Mock the API module
jest.mock('../../lib/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(error: { code: string; message: string }, status: number) {
      super(error.message);
      this.code = error.code;
      this.status = status;
    }
  },
}));

// Import mocked functions
import * as api from '../../lib/api';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const sessionId = 'session-123';

describe('useStages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useProgress hook', () => {
    it('fetches session progress', async () => {
      mockGet.mockResolvedValueOnce({
        sessionId,
        myProgress: {
          stage: Stage.WITNESS,
          status: StageStatus.IN_PROGRESS,
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: null,
          gates: { SIGNED_COMPACT: true },
        },
        partnerProgress: {
          stage: Stage.ONBOARDING,
          status: StageStatus.NOT_STARTED,
        },
        canAdvance: false,
      });

      const { result } = renderHook(() => useProgress(sessionId), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.myProgress.stage).toBe(Stage.WITNESS);
      expect(mockGet).toHaveBeenCalledWith(`/sessions/${sessionId}/progress`);
    });

    it('does not fetch when sessionId is undefined', async () => {
      const { result } = renderHook(() => useProgress(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('Stage 0: Curiosity Compact', () => {
    describe('useCompactStatus hook', () => {
      it('fetches compact status', async () => {
        mockGet.mockResolvedValueOnce({
          mySigned: true,
          mySignedAt: '2024-01-01T00:00:00.000Z',
          partnerSigned: false,
          partnerSignedAt: null,
          canAdvance: false,
        });

        const { result } = renderHook(() => useCompactStatus(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.mySigned).toBe(true);
        expect(result.current.data?.partnerSigned).toBe(false);
        expect(mockGet).toHaveBeenCalledWith(`/sessions/${sessionId}/compact`);
      });
    });

    describe('useSignCompact hook', () => {
      it('signs compact successfully', async () => {
        const responseData = {
          signed: true,
          signedAt: '2024-01-01T00:00:00.000Z',
          partnerSigned: false,
          canAdvance: false,
        };
        mockPost.mockResolvedValueOnce(responseData);

        const { result } = renderHook(() => useSignCompact(), {
          wrapper: createWrapper(),
        });

        let mutationResult: typeof responseData | undefined;
        await act(async () => {
          mutationResult = await result.current.mutateAsync({ sessionId });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/compact/sign`, {
          agreed: true,
        });
        expect(mutationResult?.signed).toBe(true);
      });
    });
  });

  describe('Stage 1: Feel Heard', () => {
    describe('useConfirmFeelHeard hook', () => {
      it('confirms feel heard with positive feedback', async () => {
        const responseData = {
          confirmed: true,
          confirmedAt: '2024-01-01T00:00:00.000Z',
          canAdvance: true,
          partnerCompleted: false,
        };
        mockPost.mockResolvedValueOnce(responseData);

        const { result } = renderHook(() => useConfirmFeelHeard(), {
          wrapper: createWrapper(),
        });

        const mutationPromise = result.current.mutateAsync({
          sessionId,
          confirmed: true,
          feedback: 'I feel heard',
        });
        await act(async () => {
          await mutationPromise;
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/feel-heard`, {
          confirmed: true,
          feedback: 'I feel heard',
        });
        const mutationResult = await mutationPromise;
        expect(mutationResult.confirmed).toBe(true);
      });

      it('handles not feeling heard', async () => {
        const responseData = {
          confirmed: false,
          confirmedAt: null,
          canAdvance: false,
          partnerCompleted: false,
        };
        mockPost.mockResolvedValueOnce(responseData);

        const { result } = renderHook(() => useConfirmFeelHeard(), {
          wrapper: createWrapper(),
        });

        const mutationPromise = result.current.mutateAsync({
          sessionId,
          confirmed: false,
          feedback: 'Need more time',
        });
        await act(async () => {
          await mutationPromise;
        });

        const mutationResult = await mutationPromise;
        expect(mutationResult.confirmed).toBe(false);
      });
    });
  });

  describe('Stage 2: Empathy / Perspective Stretch', () => {
    describe('useEmpathyDraft hook', () => {
      it('fetches empathy draft', async () => {
        mockGet.mockResolvedValueOnce({
          draft: {
            id: 'draft-123',
            content: 'I understand you feel...',
            readyToShare: false,
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        });

        const { result } = renderHook(() => useEmpathyDraft(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.draft?.content).toContain('I understand');
        expect(mockGet).toHaveBeenCalledWith(`/sessions/${sessionId}/empathy/draft`);
      });
    });

    describe('useSaveEmpathyDraft hook', () => {
      it('saves empathy draft', async () => {
        mockPost.mockResolvedValueOnce({
          draft: {
            id: 'draft-123',
            content: 'Updated empathy content',
            readyToShare: false,
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        });

        const { result } = renderHook(() => useSaveEmpathyDraft(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            content: 'Updated empathy content',
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/empathy/draft`, {
          content: 'Updated empathy content',
          readyToShare: undefined,
        });
      });

      it('saves draft as ready to share', async () => {
        mockPost.mockResolvedValueOnce({
          draft: {
            id: 'draft-123',
            content: 'Final content',
            readyToShare: true,
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        });

        const { result } = renderHook(() => useSaveEmpathyDraft(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            content: 'Final content',
            readyToShare: true,
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/empathy/draft`, {
          content: 'Final content',
          readyToShare: true,
        });
      });
    });

    describe('useConsentToShareEmpathy hook', () => {
      it('grants consent to share empathy', async () => {
        mockPost.mockResolvedValueOnce({
          consent: true,
          bothConsented: false,
          canViewPartner: false,
        });

        const { result } = renderHook(() => useConsentToShareEmpathy(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            consent: true,
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/empathy/consent`, {
          consent: true,
        });
      });
    });

    describe('usePartnerEmpathy hook', () => {
      it('fetches partner empathy attempt after both consent', async () => {
        mockGet.mockResolvedValueOnce({
          attempt: {
            id: 'empathy-456',
            sourceUserId: 'user-456',
            content: 'Partner empathy attempt',
            sharedAt: '2024-01-01T00:00:00.000Z',
            consentRecordId: 'consent-123',
          },
          waitingForPartner: false,
          validated: false,
          validatedAt: null,
          awaitingRevision: false,
        });

        const { result } = renderHook(() => usePartnerEmpathy(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.attempt?.content).toBe('Partner empathy attempt');
      });
    });

    describe('useValidateEmpathy hook', () => {
      it('validates partner empathy positively', async () => {
        mockPost.mockResolvedValueOnce({
          validated: true,
          validatedAt: '2024-01-01T00:00:00.000Z',
          feedbackShared: false,
          awaitingRevision: false,
          canAdvance: true,
          partnerValidated: false,
        });

        const { result } = renderHook(() => useValidateEmpathy(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            validated: true,
            feedback: 'Yes, you understood me',
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/empathy/validate`, {
          sessionId,
          validated: true,
          feedback: 'Yes, you understood me',
        });
      });
    });
  });

  describe('Stage 3: Need Mapping', () => {
    describe('useNeeds hook', () => {
      it('fetches AI-identified needs', async () => {
        mockGet.mockResolvedValueOnce({
          needs: [
            {
              id: 'need-1',
              need: 'Respect',
              category: NeedCategory.RECOGNITION,
              description: 'Feeling valued and recognized',
              evidence: ['Quote 1'],
              confirmed: false,
              aiConfidence: 0.9,
            },
            {
              id: 'need-2',
              need: 'Understanding',
              category: NeedCategory.CONNECTION,
              description: 'Being understood by partner',
              evidence: ['Quote 2'],
              confirmed: false,
              aiConfidence: 0.85,
            },
          ],
          synthesizedAt: '2024-01-01T00:00:00.000Z',
          isDirty: false,
        });

        const { result } = renderHook(() => useNeeds(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.needs).toHaveLength(2);
        expect(result.current.data?.needs[0].need).toBe('Respect');
      });
    });

    describe('useConfirmNeeds hook', () => {
      it('confirms identified needs', async () => {
        mockPost.mockResolvedValueOnce({
          confirmed: true,
          confirmedNeeds: ['need-1', 'need-2'],
        });

        const { result } = renderHook(() => useConfirmNeeds(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            confirmations: [
              { needId: 'need-1', confirmed: true },
              { needId: 'need-2', confirmed: true },
            ],
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/needs/confirm`, {
          confirmations: [
            { needId: 'need-1', confirmed: true },
            { needId: 'need-2', confirmed: true },
          ],
        });
      });
    });

    describe('useAddNeed hook', () => {
      it('adds custom need', async () => {
        mockPost.mockResolvedValueOnce({
          need: {
            id: 'need-3',
            need: 'Security',
            category: NeedCategory.SAFETY,
            description: 'Feeling safe in the relationship',
            evidence: [],
            confirmed: true,
            aiConfidence: 1.0,
          },
        });

        const { result } = renderHook(() => useAddNeed(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            need: 'Security',
            category: NeedCategory.SAFETY,
            description: 'Feeling safe in the relationship',
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/needs`, {
          need: 'Security',
          category: NeedCategory.SAFETY,
          description: 'Feeling safe in the relationship',
        });
      });
    });

    describe('useConsentShareNeeds hook', () => {
      it('consents to share needs for common ground', async () => {
        mockPost.mockResolvedValueOnce({
          consent: true,
          sharedNeedIds: ['need-1', 'need-2'],
        });

        const { result } = renderHook(() => useConsentShareNeeds(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            needIds: ['need-1', 'need-2'],
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/needs/consent`, {
          needIds: ['need-1', 'need-2'],
        });
      });
    });

    describe('useCommonGround hook', () => {
      it('fetches common ground between partners', async () => {
        mockGet.mockResolvedValueOnce({
          commonGround: [
            {
              id: 'common-1',
              category: NeedCategory.RECOGNITION,
              description: 'We both need respect',
              confirmedByMe: true,
              confirmedByPartner: false,
              confirmedAt: null,
            },
          ],
          analysisComplete: true,
          bothConfirmed: false,
        });

        const { result } = renderHook(() => useCommonGround(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.commonGround).toHaveLength(1);
        expect(result.current.data?.commonGround[0].confirmedByMe).toBe(true);
      });
    });

    describe('useConfirmCommonGround hook', () => {
      it('confirms common ground items', async () => {
        mockPost.mockResolvedValueOnce({
          confirmed: true,
          canProgress: true,
        });

        const { result } = renderHook(() => useConfirmCommonGround(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            confirmations: [{ commonGroundId: 'common-1', confirmed: true }],
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/common-ground/confirm`, {
          confirmations: [{ commonGroundId: 'common-1', confirmed: true }],
        });
      });
    });
  });

  describe('Stage 4: Strategic Repair', () => {
    describe('useStrategies hook', () => {
      it('fetches strategies for session', async () => {
        mockGet.mockResolvedValueOnce({
          strategies: [
            {
              id: 'strategy-1',
              description: 'Weekly check-ins',
              proposedBy: 'user-123',
              needsAddressed: ['need-1'],
            },
          ],
          canRank: true,
        });

        const { result } = renderHook(() => useStrategies(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.strategies).toHaveLength(1);
        expect(result.current.data?.strategies[0].description).toBe('Weekly check-ins');
      });
    });

    describe('useProposeStrategy hook', () => {
      it('proposes new strategy', async () => {
        mockPost.mockResolvedValueOnce({
          strategy: {
            id: 'strategy-2',
            description: 'Daily appreciation',
            proposedBy: 'user-123',
            needsAddressed: ['need-1', 'need-2'],
          },
        });

        const { result } = renderHook(() => useProposeStrategy(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            description: 'Daily appreciation',
            needsAddressed: ['need-1', 'need-2'],
            duration: '30 days',
            measureOfSuccess: 'Both partners feel appreciated',
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/strategies`, {
          description: 'Daily appreciation',
          needsAddressed: ['need-1', 'need-2'],
          duration: '30 days',
          measureOfSuccess: 'Both partners feel appreciated',
        });
      });
    });

    describe('useSubmitRankings hook', () => {
      it('submits strategy rankings', async () => {
        mockPost.mockResolvedValueOnce({
          submitted: true,
          waitingForPartner: true,
        });

        const { result } = renderHook(() => useSubmitRankings(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            rankedIds: ['strategy-1', 'strategy-2', 'strategy-3'],
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/strategies/rank`, {
          rankedIds: ['strategy-1', 'strategy-2', 'strategy-3'],
        });
      });
    });

    describe('useStrategiesReveal hook', () => {
      it('fetches strategy overlap after both ranked', async () => {
        mockGet.mockResolvedValueOnce({
          overlap: [
            {
              id: 'strategy-1',
              description: 'Weekly check-ins',
              needsAddressed: ['need-1'],
              duration: null,
              measureOfSuccess: null,
            },
          ],
          phase: 'REVEALING',
        });

        const { result } = renderHook(() => useStrategiesReveal(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.overlap).toHaveLength(1);
        expect(result.current.data?.overlap[0].id).toBe('strategy-1');
      });
    });
  });

  describe('Agreements', () => {
    describe('useAgreements hook', () => {
      it('fetches session agreements', async () => {
        mockGet.mockResolvedValueOnce({
          agreements: [
            {
              id: 'agreement-1',
              description: 'We agree to weekly check-ins',
              type: AgreementType.COMMITMENT,
              status: AgreementStatus.PROPOSED,
              duration: null,
              measureOfSuccess: null,
              agreedByMe: false,
              agreedByPartner: false,
              agreedAt: null,
              followUpDate: null,
            },
          ],
        });

        const { result } = renderHook(() => useAgreements(sessionId), {
          wrapper: createWrapper(),
        });

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true);
        });

        expect(result.current.data?.agreements).toHaveLength(1);
      });
    });

    describe('useCreateAgreement hook', () => {
      it('creates new agreement', async () => {
        mockPost.mockResolvedValueOnce({
          agreement: {
            id: 'agreement-1',
            description: 'We agree to weekly check-ins on Sundays',
            type: AgreementType.COMMITMENT,
            status: 'PROPOSED',
            duration: null,
            measureOfSuccess: null,
            agreedByMe: false,
            agreedByPartner: false,
            agreedAt: null,
            followUpDate: null,
          },
          awaitingPartnerConfirmation: true,
        });

        const { result } = renderHook(() => useCreateAgreement(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            strategyId: 'strategy-1',
            description: 'We agree to weekly check-ins on Sundays',
            type: AgreementType.COMMITMENT,
          });
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/agreements`, {
          strategyId: 'strategy-1',
          description: 'We agree to weekly check-ins on Sundays',
          type: AgreementType.COMMITMENT,
        });
      });
    });

    describe('useConfirmAgreement hook', () => {
      it('confirms agreement', async () => {
        mockPost.mockResolvedValueOnce({
          confirmed: true,
          bothConfirmed: true,
          status: 'CONFIRMED',
        });

        const { result } = renderHook(() => useConfirmAgreement(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            agreementId: 'agreement-1',
            confirmed: true,
          });
        });

        expect(mockPost).toHaveBeenCalledWith(
          `/sessions/${sessionId}/agreements/agreement-1/confirm`,
          { confirmed: true, modification: undefined }
        );
      });

      it('requests modification to agreement', async () => {
        mockPost.mockResolvedValueOnce({
          confirmed: false,
          modificationRequested: true,
          status: 'PENDING_MODIFICATION',
        });

        const { result } = renderHook(() => useConfirmAgreement(), {
          wrapper: createWrapper(),
        });

        await act(async () => {
          await result.current.mutateAsync({
            sessionId,
            agreementId: 'agreement-1',
            confirmed: false,
            modification: 'Can we do biweekly instead?',
          });
        });

        expect(mockPost).toHaveBeenCalledWith(
          `/sessions/${sessionId}/agreements/agreement-1/confirm`,
          { confirmed: false, modification: 'Can we do biweekly instead?' }
        );
      });
    });

    describe('useResolveSession hook', () => {
      it('resolves session successfully', async () => {
        const responseData = {
          resolved: true,
          resolvedAt: '2024-01-01T00:00:00.000Z',
          agreements: [],
          followUpScheduled: false,
        };
        mockPost.mockResolvedValueOnce(responseData);

        const { result } = renderHook(() => useResolveSession(), {
          wrapper: createWrapper(),
        });

        const mutationPromise = result.current.mutateAsync({ sessionId });
        await act(async () => {
          await mutationPromise;
        });

        expect(mockPost).toHaveBeenCalledWith(`/sessions/${sessionId}/resolve`);
        const mutationResult = await mutationPromise;
        expect(mutationResult.resolved).toBe(true);
      });
    });
  });

  describe('stageKeys', () => {
    it('generates correct query keys', () => {
      expect(stageKeys.all).toEqual(['stages']);
      expect(stageKeys.progress(sessionId)).toEqual(['stages', 'progress', sessionId]);
      expect(stageKeys.compact(sessionId)).toEqual(['stages', 'compact', sessionId]);
      expect(stageKeys.empathyDraft(sessionId)).toEqual([
        'stages',
        'empathy',
        'draft',
        sessionId,
      ]);
      expect(stageKeys.partnerEmpathy(sessionId)).toEqual([
        'stages',
        'empathy',
        'partner',
        sessionId,
      ]);
      expect(stageKeys.needs(sessionId)).toEqual(['stages', 'needs', sessionId]);
      expect(stageKeys.commonGround(sessionId)).toEqual(['stages', 'commonGround', sessionId]);
      expect(stageKeys.strategies(sessionId)).toEqual(['stages', 'strategies', sessionId]);
      expect(stageKeys.strategiesReveal(sessionId)).toEqual([
        'stages',
        'strategies',
        'reveal',
        sessionId,
      ]);
      expect(stageKeys.agreements(sessionId)).toEqual(['stages', 'agreements', sessionId]);
    });
  });
});
