import { Request, Response } from 'express';
import {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  sendMessage,
  sendMessageStream,
  confirmFeelHeard,
  getConversationHistory,
  scrubVisibleAIText,
  isReadyForStage3RevealText,
} from '../../controllers/messages';
import { prisma } from '../../lib/prisma';
import { getModelCompletionWithTools, getSonnetStreamingResponse } from '../../lib/bedrock';
import { buildStagePrompt } from '../../services/stage-prompts';
import { interpretNeedEditRequest } from '../../services/needs-edit-interpreter.service';
import { applyNeedEdits } from '../../services/needs-edit-applier.service';

// Mock Prisma
jest.mock('../../lib/prisma');

// Mock realtime service
jest.mock('../../services/realtime', () => ({
  notifyPartner: jest.fn().mockResolvedValue(undefined),
  publishSessionEvent: jest.fn().mockResolvedValue(undefined),
  notifySessionMembers: jest.fn().mockResolvedValue(undefined),
  publishMessageAIResponse: jest.fn().mockResolvedValue(undefined),
  publishMessageError: jest.fn().mockResolvedValue(undefined),
  publishTopicFrameUpdated: jest.fn().mockResolvedValue(undefined),
}));

// Mock partner session classifier (fire-and-forget memory detection)
jest.mock('../../services/partner-session-classifier', () => ({
  runPartnerSessionClassifier: jest.fn().mockResolvedValue(null),
}));

// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getSonnetResponse: jest.fn().mockResolvedValue('Mock response'),
  getModelCompletionWithTools: jest.fn().mockResolvedValue({ text: null, toolInvocations: [] }),
  getSonnetStreamingResponse: jest.fn(),
  BrainActivityCallType: {
    ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE',
  },
  isMockLLMEnabled: jest.fn().mockReturnValue(false),
}));

// Mock brain service
jest.mock('../../services/brain-service', () => ({
  brainService: {
    recordThinking: jest.fn().mockResolvedValue(undefined),
    broadcastMessage: jest.fn(),
  },
}));

// Mock stage prompts
jest.mock('../../services/stage-prompts', () => ({
  buildInitialMessagePrompt: jest.fn().mockReturnValue('Mock prompt'),
  buildStagePrompt: jest.fn().mockReturnValue({ staticBlock: 'Mock static', dynamicBlock: 'Mock dynamic' }),
  buildStagePromptString: jest.fn().mockReturnValue('Mock stage prompt'),
}));

// Mock json extractor
jest.mock('../../utils/json-extractor', () => ({
  extractJsonFromResponse: jest.fn().mockReturnValue({}),
}));

// Mock embedding service
jest.mock('../../services/embedding', () => ({
  embedSessionContent: jest.fn().mockResolvedValue(true),
}));

// Mock conversation summarizer
jest.mock('../../services/conversation-summarizer', () => ({
  updateSessionSummary: jest.fn().mockResolvedValue(undefined),
  getSessionSummary: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/context-assembler', () => ({
  assembleContextBundle: jest.fn().mockResolvedValue({ notableFacts: [] }),
  formatContextForPrompt: jest.fn().mockReturnValue(''),
}));

jest.mock('../../services/shared-context', () => ({
  getMilestoneContext: jest.fn().mockResolvedValue(null),
  getSharedContentContext: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/llm-telemetry', () => ({
  estimateContextSizes: jest.fn().mockReturnValue({}),
  finalizeTurnMetrics: jest.fn(),
  recordContextSizes: jest.fn(),
}));

jest.mock('../../services/global-memory', () => ({
  consolidateGlobalFacts: jest.fn().mockResolvedValue(undefined),
}));

// Mock reconciler
jest.mock('../../services/reconciler', () => ({
  runReconcilerForDirection: jest.fn().mockResolvedValue(null),
  getSharedContextForGuesser: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/needs-edit-interpreter.service', () => ({
  interpretNeedEditRequest: jest.fn(),
}));

jest.mock('../../services/needs-edit-applier.service', () => ({
  applyNeedAction: jest.fn(),
  applyNeedEdits: jest.fn(),
}));

jest.mock('../../services/stage4-capture.service', () => ({
  captureStage4Turn: jest.fn().mockResolvedValue({
    appliedOperationCount: 0,
    skippedOperationCount: 0,
    selection: null,
    closureSignal: null,
    confidence: 0,
  }),
}));

jest.mock('../../services/stage4-auto-closure.service', () => ({
  applyStage4AutoClosureFromSignal: jest.fn().mockResolvedValue({ closed: false }),
}));

// Mock request context
jest.mock('../../lib/request-context', () => ({
  updateContext: jest.fn(),
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Partial<Request> {
  return {
    user: options.user,
    params: options.params || {},
    body: options.body || {},
    query: options.query || {},
    on: jest.fn(),
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
  writeMock: jest.Mock;
  endMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const writeMock = jest.fn();
  const endMock = jest.fn();

  return {
    res: {
      status: statusMock,
      json: jsonMock,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: writeMock,
      end: endMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
    writeMock,
    endMock,
  };
}

describe('Messages API (Fire-and-Forget)', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
  const mockSessionId = 'session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planner text safety helpers', () => {
    describe('scrubVisibleAIText', () => {
      it('removes visible planner lines and flags the scrub', () => {
        const result = scrubVisibleAIText([
          'I should compare both lists before showing anything.',
          'That sounds like a need for more steadiness.',
          "Here's my plan: reveal the comparison.",
        ].join('\n'));

        expect(result.scrubbed).toBe(true);
        expect(result.text).toBe('That sounds like a need for more steadiness.');
      });

      it('preserves normal facilitation that starts with I need to', () => {
        const text = 'I need to make sure I am capturing this right: you want steadiness before deciding.';

        expect(scrubVisibleAIText(text)).toEqual({
          text,
          scrubbed: false,
        });
      });

      it('can preserve boundary whitespace for streamed chunks', () => {
        expect(scrubVisibleAIText(' talk ', { preserveBoundaryWhitespace: true })).toEqual({
          text: ' talk ',
          scrubbed: false,
        });
      });

      it('removes untagged Stage 4 reasoning before the visible answer', () => {
        const result = scrubVisibleAIText([
          'This is them accepting my invitation to add another option for the same need.',
          '',
          'So I have:',
          '- Previous proposal idea: play 20 Questions',
          '- Current addition: Would You Rather',
          '',
          'These are both specific games. capture them as options and then check if they are done brainstorming.',
          '',
          'For stage4_walkthrough: The user is still actively brainstorming for the current need, so action=NONE.',
          '',
          '',
          'Got it — so 20 Questions or Would You Rather, both could create that shared lightness.',
          '',
          'Is that enough to work with, or do you want one more option for this need?',
        ].join('\n'));

        expect(result.scrubbed).toBe(true);
        expect(result.text).toBe([
          'Got it — so 20 Questions or Would You Rather, both could create that shared lightness.',
          '',
          'Is that enough to work with, or do you want one more option for this need?',
        ].join('\n'));
      });
    });

    describe('isReadyForStage3RevealText', () => {
      it('detects ready requests that mention needs reveal context', () => {
        expect(isReadyForStage3RevealText("I'm ready to see the needs lists")).toBe(true);
        expect(isReadyForStage3RevealText('We are ready for the side by side reveal')).toBe(true);
      });

      it('does not treat negated ready language as a reveal request', () => {
        expect(isReadyForStage3RevealText("I'm not ready to see the lists")).toBe(false);
        expect(isReadyForStage3RevealText("I don't want to show the needs yet")).toBe(false);
      });

      it('requires reveal context to avoid hijacking generic ready messages', () => {
        expect(isReadyForStage3RevealText("Yes, I'm ready")).toBe(false);
      });
    });

  });

  describe('POST /sessions/:id/messages (sendMessage - DEPRECATED)', () => {
    // The fire-and-forget endpoint has been deprecated in favor of SSE streaming.
    // All message sending should now use POST /sessions/:id/messages/stream.

    it('returns 410 Gone with deprecation message', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: 'Test message' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await sendMessage(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(410);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'ENDPOINT_DEPRECATED',
            message: expect.stringContaining('deprecated'),
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/messages/stream (sendMessageStream)', () => {
    it('allows resolved-session Tending chat and injects private selected note context', async () => {
      const stage4Progress = {
        id: 'progress-4',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 4,
        status: 'COMPLETED',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'RESOLVED',
        topicFrame: 'Sunday planning',
        topicFrameConfirmedAt: new Date('2026-05-20T00:00:00Z'),
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const userMessage = {
        id: 'msg-user-tending',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'I want to think about what happened before the check-in.',
        stage: 4,
        timestamp: new Date('2026-05-22T10:00:00Z'),
      };
      const aiMessage = {
        id: 'msg-ai-tending',
        sessionId: mockSessionId,
        senderId: null,
        forUserId: mockUser.id,
        role: 'AI',
        content: 'We can stay with what happened first.',
        stage: 4,
        timestamp: new Date('2026-05-22T10:00:01Z'),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER' ? { ...userMessage, content: data.content } : { ...aiMessage, content: data.content, stage: data.stage }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([
        { needId: 'need-1', needLabel: 'Partnership' },
      ]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([{
        id: 'entry-1',
        summary: 'Weekly walk',
        scope: 'SHARED',
        agreement: { measureOfSuccess: 'Both feel less alone.' },
      }]);
      (prisma.tendingBetweenPeriodNote.findMany as jest.Mock).mockResolvedValue([{
        id: 'note-1',
        content: 'I felt myself bracing before the second walk.',
        consentToShareWithPartner: false,
      }]);
      (prisma.tendingCheckin.findMany as jest.Mock).mockResolvedValue([]);

      async function* llmStream() {
        yield { type: 'text', text: '<thinking>\nMode: STAGE4\n</thinking>\n' };
        yield { type: 'text', text: aiMessage.content };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, endMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      expect(buildStagePrompt).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          stage4ListenFirstMode: true,
          tendingConversationPrompt: expect.stringContaining('TENDING CONVERSATION PROMPT'),
        }),
        expect.any(Object)
      );
      const promptArg = (buildStagePrompt as jest.Mock).mock.calls.at(-1)?.[1];
      expect(prisma.stage4NeedCoverage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: mockSessionId, sourceUserId: mockUser.id },
        })
      );
      expect(promptArg.tendingConversationPrompt).toContain('I felt myself bracing before the second walk.');
      expect(promptArg.tendingConversationPrompt).toContain('private; do not relay');
      expect(promptArg.tendingConversationPrompt).toContain('Weekly walk');
      expect(endMock).toHaveBeenCalled();
    });

    it('applies a fallback need edit when refinement chat produces no need-action tag', async () => {
      const stage3Progress = {
        id: 'progress-3',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const targetNeed = {
        id: 'need-1',
        need: 'To feel taken seriously when I say something matters to me',
        category: 'RECOGNITION',
      };
      const userMessage = {
        id: 'msg-user-refine',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'Can this be more specific?',
        stage: 3,
        timestamp: new Date('2026-05-20T19:37:00Z'),
        refiningNeedId: targetNeed.id,
      };
      const aiMessage = {
        id: 'msg-ai-refine',
        sessionId: mockSessionId,
        senderId: null,
        forUserId: mockUser.id,
        role: 'AI',
        content: 'Got it — you need to be taken seriously when you set a boundary. Does that feel right now?',
        stage: 3,
        timestamp: new Date('2026-05-20T19:37:01Z'),
      };
      const operation = {
        type: 'updateNeedText' as const,
        needId: targetNeed.id,
        newText: 'To be taken seriously when I set a boundary',
        newCategory: 'RECOGNITION' as const,
      };
      const updatedNeed = {
        id: targetNeed.id,
        need: operation.newText,
        category: operation.newCategory,
        description: operation.newText,
        evidence: [],
        confirmed: true,
        aiConfidence: 0.9,
        createdAt: new Date('2026-05-20T19:30:00Z').toISOString(),
        lockedAt: null,
        deletedAt: null,
        supersededByNeedId: null,
        status: 'draft',
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage3Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage3Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER'
          ? { ...userMessage, content: data.content, refiningNeedId: data.refiningNeedId }
          : { ...aiMessage, content: data.content, stage: data.stage }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'vessel-1' });
      (prisma.identifiedNeed.findFirst as jest.Mock).mockResolvedValue(targetNeed);
      (interpretNeedEditRequest as jest.Mock).mockResolvedValue({
        plan: {
          summary: 'Make the need more specific.',
          operations: [operation],
          affectedNeeds: [],
        },
      });
      (applyNeedEdits as jest.Mock).mockResolvedValue({
        needs: [updatedNeed],
        applied: [{
          needId: targetNeed.id,
          before: { text: targetNeed.need, category: 'RECOGNITION' },
          after: { text: operation.newText, category: 'RECOGNITION' },
          operation: 'text_change',
        }],
        warnings: [],
      });

      async function* llmStream() {
        yield { type: 'text', text: '<thinking>\nMode: WHAT_MATTERS\nNeedsReady:N\n</thinking>\n' };
        yield { type: 'text', text: aiMessage.content };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content, refiningNeedId: targetNeed.id },
      });
      const { res, writeMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      expect(interpretNeedEditRequest).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.id,
        expect.objectContaining({ targetNeedId: targetNeed.id })
      );
      expect(applyNeedEdits).toHaveBeenCalledWith(mockSessionId, mockUser.id, [operation]);
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'AI',
            refiningNeedId: targetNeed.id,
          }),
        })
      );
      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(sseOutput).toContain('"needsCaptured":true');
    });

    it('does not auto-advance Stage 1 from LLM — feel-heard confirmation is button-only', async () => {
      const stage1Progress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: { feelHeardCheckOffered: true },
      };
      const userMessage = {
        id: 'msg-user-1',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'Yes. That captures it. I feel heard.',
        stage: 1,
        timestamp: new Date('2026-05-07T08:00:00Z'),
      };
      const aiMessage = {
        id: 'msg-ai-1',
        sessionId: mockSessionId,
        senderId: null,
        forUserId: mockUser.id,
        role: 'AI',
        content: 'That feels complete. Now let us turn toward what your partner might be experiencing in this.',
        stage: 1,
        timestamp: new Date('2026-05-07T08:00:01Z'),
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...stage1Progress,
        status: 'COMPLETED',
      });
      (prisma.stageProgress.upsert as jest.Mock).mockResolvedValue({
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 2,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER' ? userMessage : { ...aiMessage, content: data.content, stage: data.stage }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      async function* llmStream() {
        yield {
          type: 'text',
          text: '<thinking>\nMode: WITNESS\nUserIntensity: 4\nFeelHeardCheck:Y\nFeelHeardConfirmed:Y\nStrategy: transition\n</thinking>\n',
        };
        yield {
          type: 'text',
          text: 'That feels complete. Now let us turn toward what your partner might be experiencing in this.',
        };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock, endMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      // AI message should stay on Stage 1 — no auto-advance
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'AI',
            stage: 1,
          }),
        })
      );
      // Only feelHeardCheckOffered is set; stage is NOT completed
      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'progress-1' },
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feelHeardCheckOffered: true,
            }),
          }),
        })
      );
      // Stage 2 progress should NOT be created by LLM
      expect(prisma.stageProgress.upsert).not.toHaveBeenCalled();
      // Metadata should NOT contain feelHeardConfirmed or advancedToStage
      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(sseOutput).not.toContain('"advancedToStage":2');
      expect(endMock).toHaveBeenCalled();
    });

    it('does not stream or persist long hidden reasoning before the closing thinking tag', async () => {
      const stage4Progress = {
        id: 'progress-4',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const userMessage = {
        id: 'msg-user-stage4',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'no thanks',
        stage: 4,
        timestamp: new Date('2026-05-22T03:35:16Z'),
      };
      const visibleResponse = 'Okay, we can leave that need aside and keep going.';
      const leakedReasoning = [
        "at the walkthrough state, we're already supposed to be in PARTNER_NEEDS phase working on Shantam's need.",
        '',
        'Let me check the ownNeeds in the walkthrough state:',
        '- cmperm4sf000mpxlkkexdlcze: "To feel connected to Shantam through shared lightness and laughter" - status=covered',
        '',
        'So both of Jason\'s needs are already marked as covered in the walkthrough state.',
        'The need ID for "To feel connected to Shantam through shared lightness and laughter" is cmperm4sf000mpxlkkexdlcze.',
        'update_session_state with stage4WalkthroughAction SKIP.',
      ].join('\n').padEnd(2400, ' hidden reasoning.');

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER'
          ? { ...userMessage, content: data.content }
          : {
              id: 'msg-ai-stage4',
              sessionId: mockSessionId,
              senderId: null,
              forUserId: mockUser.id,
              role: 'AI',
              content: data.content,
              stage: data.stage,
              timestamp: new Date('2026-05-22T03:35:46Z'),
            }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      async function* llmStream() {
        yield { type: 'text', text: `<thinking>\n${leakedReasoning}` };
        yield { type: 'text', text: '</thinking>\n' };
        yield { type: 'text', text: visibleResponse };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      const aiCreateCall = (prisma.message.create as jest.Mock).mock.calls.find(([arg]) => arg.data.role === 'AI');
      expect(aiCreateCall[0].data.content).toBe(visibleResponse);
      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(sseOutput).toContain(visibleResponse);
      expect(sseOutput).not.toContain('PARTNER_NEEDS');
      expect(sseOutput).not.toContain('update_session_state');
    });

    it('does not mark a Stage 4 need covered when the visible response asks for clarification', async () => {
      const stage4Progress = {
        id: 'progress-4',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const userMessage = {
        id: 'msg-user-stage4-clarify',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'I will promise to let him speak and not talk back',
        stage: 4,
        timestamp: new Date('2026-05-22T04:10:00Z'),
      };
      const aiContent = 'When you say "not talk back" - do you mean you will not interrupt him, or that you will not dismiss what he is saying, or something else?';

      (getModelCompletionWithTools as jest.Mock).mockResolvedValueOnce({
        text: null,
        toolInvocations: [{
          name: 'update_session_state',
          input: {
            stage4Proposals: [{
              action: 'ADD',
              classification: 'PROPOSAL',
              description: 'Promise to let him speak without talking back',
              kind: 'INDIVIDUAL_COMMITMENT',
              ownerUserId: mockUser.id,
              needsAddressed: ['need-current'],
            }],
            stage4WalkthroughAction: {
              action: 'COVERED',
              needId: 'need-current',
              reason: 'User named a possible commitment.',
            },
          },
        }],
      });
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage4Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER'
          ? { ...userMessage, content: data.content }
          : {
              id: 'msg-ai-stage4-clarify',
              sessionId: mockSessionId,
              senderId: null,
              forUserId: mockUser.id,
              role: 'AI',
              content: data.content,
              stage: data.stage,
              timestamp: new Date('2026-05-22T04:10:20Z'),
            }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      async function* llmStream() {
        yield { type: 'text', text: '<thinking>\nMode: STRATEGIC_REPAIR\n</thinking>\n' };
        yield { type: 'text', text: aiContent };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(sseOutput).toContain('When you say');
      expect(sseOutput).toContain('not talk back');
      expect(sseOutput).toContain('"stage4WalkthroughAction":{"action":"NONE"');
      expect(sseOutput).toContain('visible_response_requested_clarification');
      expect(sseOutput).not.toContain('stage4Proposals');
      expect(prisma.stageProgress.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              stage4Walkthrough: expect.anything(),
            }),
          }),
        })
      );
    });

    it('streams the reply when the model omits the leading <thinking> tag', async () => {
      // Regression: the model occasionally skips <thinking> and goes straight to the
      // visible reply. The thinking trap used to swallow the whole reply as hidden
      // reasoning, throw "AI response was empty after tag stripping", and delete the
      // user message — surfacing as a failed submit. The reply must stream instead.
      const stage1Progress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const userMessage = {
        id: 'msg-user-no-thinking',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'It has been a hard week.',
        stage: 1,
        timestamp: new Date('2026-05-25T16:00:00Z'),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER'
          ? { ...userMessage, content: data.content }
          : {
              id: 'msg-ai-no-thinking',
              sessionId: mockSessionId,
              senderId: null,
              forUserId: mockUser.id,
              role: 'AI',
              content: data.content,
              stage: data.stage,
              timestamp: new Date('2026-05-25T16:00:02Z'),
            }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      // No <thinking> opener at all — visible prose streamed directly, split across chunks.
      async function* llmStream() {
        yield { type: 'text', text: 'I hear you - a hard week can weigh on everything. ' };
        yield { type: 'text', text: "What's been the heaviest part for you?" };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      // Reply streamed to the client, not swallowed.
      expect(sseOutput).toContain('a hard week can weigh on everything');
      expect(sseOutput).toContain('the heaviest part for you');
      // No empty-response failure.
      expect(sseOutput).not.toContain('AI response was empty');
      // User message kept (not cleaned up as a failed turn).
      expect(prisma.message.delete).not.toHaveBeenCalled();
      // AI reply persisted with the visible content.
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'AI',
            content: expect.stringContaining('a hard week can weigh on everything'),
          }),
        })
      );
    });

    it('falls back to pre-scrub text when scrubbing empties the response', async () => {
      // Regression #672: if the visible portion after </thinking> consists entirely
      // of planner lines that scrubVisibleAIText removes, the guard throws and
      // deletes the user message. The fix falls back to the pre-scrub text.
      const stage1Progress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };
      const userMessage = {
        id: 'msg-user-scrub-empty',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'Tell me more.',
        stage: 1,
        timestamp: new Date('2026-05-25T18:00:00Z'),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER'
          ? { ...userMessage, content: data.content }
          : {
              id: 'msg-ai-scrub-empty',
              sessionId: mockSessionId,
              senderId: null,
              forUserId: mockUser.id,
              role: 'AI',
              content: data.content,
              stage: data.stage,
              timestamp: new Date('2026-05-25T18:00:02Z'),
            }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      // Model responds with <thinking> then ONLY planner lines that get scrubbed
      async function* llmStream() {
        yield { type: 'text', text: '<thinking>\nI need to respond carefully.\n</thinking>\n' };
        yield { type: 'text', text: 'I should acknowledge what they said.\n' };
        yield { type: 'text', text: "Here's my plan to address their concern." };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      const sseOutput = writeMock.mock.calls.map(([chunk]) => String(chunk)).join('');
      // Should NOT throw or delete user message
      expect(prisma.message.delete).not.toHaveBeenCalled();
      // Should contain fallback text (the pre-scrub planner lines)
      expect(sseOutput).toContain('acknowledge what they said');
      // AI reply persisted
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'AI',
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/feel-heard (confirmFeelHeard)', () => {
    it('marks user as feeling heard', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const updatedProgress = {
        ...mockStageProgress,
        gatesSatisfied: { feelHeard: true, confirmedAt: expect.any(Date) },
        status: 'GATE_PENDING',
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue(updatedProgress);

      // Mock partner progress check
      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id },
        { userId: 'partner-1' },
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            canAdvance: false, // Partner must also complete
          }),
        })
      );

      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId_userId_stage: {
              sessionId: mockSessionId,
              userId: mockUser.id,
              stage: 1,
            },
          },
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feelHeardConfirmed: true,
            }),
          }),
        })
      );
    });

    it('indicates when both partners have completed', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: 'partner-1',
        stage: 1,
        status: 'GATE_PENDING',
        gatesSatisfied: { feelHeard: true, confirmedAt: new Date() },
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationshipId: 'rel-1',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };

      // Mock session.findFirst for access check
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);

      // Mock session.findUnique for getPartnerUserId
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      // Mock stageProgress.findFirst for getting current stage (user is in stage 1)
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);

      // Mock stageProgress.findUnique - called for partner progress check
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { feelHeard: true, confirmedAt: new Date() },
        status: 'GATE_PENDING',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            partnerCompleted: true,
            canAdvance: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('validates confirmed field is boolean', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: 'yes' }, // Invalid - should be boolean
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('allows saving optional feedback', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: {
          feelHeard: true,
          confirmedAt: new Date(),
          feedback: 'The AI was very helpful',
        },
        status: 'GATE_PENDING',
      });

      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id },
        { userId: 'partner-1' },
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true, feedback: 'The AI was very helpful' },
      });
      const { res, statusMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feedback: 'The AI was very helpful',
            }),
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/messages (getConversationHistory)', () => {
    it('returns message history for the session', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          senderId: mockUser.id,
          role: 'USER',
          content: 'First message',
          stage: 1,
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'msg-2',
          sessionId: mockSessionId,
          senderId: null,
          role: 'AI',
          content: 'AI response',
          stage: 1,
          timestamp: new Date('2024-01-01T10:00:05Z'),
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        query: { limit: '50' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({ id: 'msg-1', role: 'USER' }),
              expect.objectContaining({ id: 'msg-2', role: 'AI' }),
            ]),
          }),
        })
      );
    });

    it('only returns messages for the current user', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          senderId: mockUser.id,
          role: 'USER',
          content: 'My message',
          stage: 1,
          timestamp: new Date(),
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      // Verify the query filters by user (data isolation: only user's sent messages without recipient + messages for this user)
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: mockSessionId,
            OR: expect.arrayContaining([
              expect.objectContaining({ senderId: mockUser.id, forUserId: null }),
              expect.objectContaining({ forUserId: mockUser.id }),
            ]),
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });
  });
});
