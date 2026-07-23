/**
 * Unit tests for `stream-turn-persistence` — the message-row writes of a
 * streaming chat turn.
 *
 * These pin that a failed turn writes no AI message and cleans up after
 * itself, and that the Stage 3 gate short circuit only fires when gate state
 * actually justifies it.
 */

import {
  cleanupFailedStreamTurn,
  isReadyForStage3RevealText,
  resolveStage3GateTurn,
  saveAiTurnMessage,
} from '../stream-turn-persistence';
import { prisma } from '../../lib/prisma';
import { brainService } from '../brain-service';
import { publishMessageError } from '../realtime';
import { getPartnerUserId } from '../../utils/session';

jest.mock('../../lib/prisma');

jest.mock('../brain-service', () => ({
  brainService: { broadcastMessage: jest.fn() },
}));

jest.mock('../realtime', () => ({
  publishMessageError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/session', () => ({
  getPartnerUserId: jest.fn().mockResolvedValue('user-2'),
}));

const sessionId = 'session-1';
const userId = 'user-1';
const partnerId = 'user-2';

/**
 * The complete set of strings the Stage 3 gate can return. Asserting
 * membership pins that the gate speaks only in fixed copy — no needs content,
 * from either party, can be interpolated into it.
 */
const CANNED_GATE_RESPONSES = [
  "Let's first put words to what matters most for you here. What do you need in order to feel clear, grounded, or able to move forward from this?",
  "I've captured a draft of what matters to you. Please review and confirm your needs before we move any further.",
  "Your needs are ready for your review. If they still feel right, you can choose to share them for the side-by-side step.",
  "Your needs are shared. We'll wait until your partner has shared theirs before showing anything side by side.",
  'Both needs lists are ready to review side by side. Take a look at them and notice what stands out before deciding whether they feel accurate.',
];

/**
 * Answers stageProgress lookups from the `where` clause rather than call
 * order, so the gate logic can reorder its own and partner reads without
 * silently inverting what these tests assert.
 */
function stubGates(gates: { own: Record<string, unknown>; partner: Record<string, unknown> | null }) {
  (prisma.stageProgress.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    const target = where.sessionId_userId_stage.userId;
    if (target === userId) return { gatesSatisfied: gates.own };
    if (target === partnerId) return gates.partner ? { gatesSatisfied: gates.partner } : null;
    return null;
  });
}

describe('stream-turn-persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.message.create as jest.Mock).mockResolvedValue({ id: 'ai-message-1', content: 'saved' });
  });

  describe('isReadyForStage3RevealText', () => {
    it('recognises an affirmative reveal request', () => {
      expect(isReadyForStage3RevealText("I'm ready to see the needs lists")).toBe(true);
      expect(isReadyForStage3RevealText('We are ready for the side by side reveal')).toBe(true);
    });

    it('does not fire on a negated request', () => {
      expect(isReadyForStage3RevealText("I'm not ready to see the lists")).toBe(false);
      expect(isReadyForStage3RevealText("I don't want to show the needs yet")).toBe(false);
    });

    it('does not fire on bare readiness with no reveal object', () => {
      expect(isReadyForStage3RevealText("Yes, I'm ready")).toBe(false);
    });
  });

  describe('resolveStage3GateTurn', () => {
    beforeEach(() => {
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({ gatesSatisfied: {} });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ identifiedNeeds: [] });
    });

    it('does not short circuit outside Stage 3', async () => {
      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 2,
        content: "I'm ready to see the lists",
      });

      expect(result).toBeNull();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('does not short circuit when the message is not a reveal request', async () => {
      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: 'here is more about what happened',
      });

      expect(result).toBeNull();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('falls through to the model when the user has no Stage 3 progress row', async () => {
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result).toBeNull();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('asks for needs first when the user has none captured', async () => {
      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result?.text).toContain('what matters most for you');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId,
          senderId: null,
          forUserId: userId,
          role: 'AI',
          content: result?.text,
          stage: 3,
        },
      });
    });

    it('asks the user to confirm before sharing when needs are unconfirmed', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: false }],
      });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result?.text).toContain('confirm your needs');
    });

    it('withholds the partner list until the partner has shared theirs', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: true }],
      });
      stubGates({ own: { needsShared: true, needsConfirmed: true }, partner: { needsShared: false } });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result?.text).toContain("wait until your partner has shared");
    });

    it('reveals the side-by-side only once both sides have shared', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: true }],
      });
      stubGates({ own: { needsShared: true, needsConfirmed: true }, partner: { needsShared: true } });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result?.text).toContain('Both needs lists are ready');
    });

    /**
     * PRIVACY BOUNDARY. The gate decides what to say from the partner's
     * stageProgress GATE FLAGS only. It must never read the partner's needs
     * content — not even on the fully-revealed path, where the temptation to
     * summarise "what they said" is highest. The reveal itself happens in the
     * consented side-by-side UI, not in this canned text.
     */
    it('never reads the partner vessel, even on the fully-revealed path', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: true, need: 'my own need' }],
      });
      stubGates({ own: { needsShared: true, needsConfirmed: true }, partner: { needsShared: true } });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      // Every vessel read is scoped to the caller; the partner's is never fetched.
      const vesselReads = (prisma.userVessel.findUnique as jest.Mock).mock.calls;
      expect(vesselReads.length).toBeGreaterThan(0);
      for (const [args] of vesselReads) {
        expect(args.where.userId_sessionId.userId).toBe(userId);
      }
      expect(prisma.identifiedNeed.findMany).not.toHaveBeenCalled();
      expect(prisma.identifiedNeed.findFirst).not.toHaveBeenCalled();
    });

    it('returns only canned gate text, never model or partner prose', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: true, need: 'PARTNER_SECRET_NEED' }],
      });
      stubGates({ own: { needsShared: true, needsConfirmed: true }, partner: { needsShared: true } });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      // Needs content never appears in the gate response, so no needs text can
      // leak through this path regardless of whose vessel was loaded.
      expect(result?.text).not.toContain('PARTNER_SECRET_NEED');
      expect(CANNED_GATE_RESPONSES).toContain(result?.text);
    });

    it('does not reveal anything when there is no partner yet', async () => {
      (getPartnerUserId as jest.Mock).mockResolvedValue(null);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({
        identifiedNeeds: [{ id: 'n1', confirmed: true }],
      });
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
        gatesSatisfied: { needsShared: true, needsConfirmed: true },
      });

      const result = await resolveStage3GateTurn({
        sessionId,
        userId,
        currentStage: 3,
        content: "I'm ready to see the lists",
      });

      expect(result?.text).toContain("wait until your partner has shared");
    });
  });

  describe('saveAiTurnMessage', () => {
    it('persists the response against the effective stage and broadcasts it', async () => {
      const message = await saveAiTurnMessage({
        requestId: 'req-1',
        sessionId,
        userId,
        accumulatedText: '  the reply  ',
        effectiveStage: 21,
        refiningNeedContext: null,
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId,
          senderId: null,
          forUserId: userId,
          role: 'AI',
          content: 'the reply',
          stage: 21,
          refiningNeedId: null,
        },
      });
      expect(brainService.broadcastMessage).toHaveBeenCalledWith(message);
    });

    it('attributes the message to the need being refined', async () => {
      await saveAiTurnMessage({
        requestId: 'req-1',
        sessionId,
        userId,
        accumulatedText: 'reply',
        effectiveStage: 3,
        refiningNeedContext: { id: 'need-7', need: 'rest', category: 'WELLBEING' },
      });

      expect((prisma.message.create as jest.Mock).mock.calls[0][0].data.refiningNeedId).toBe('need-7');
    });

    /**
     * This service is given text and has no way to know whether the stream
     * that produced it completed. That is exactly why the disconnect-
     * truncation defect is invisible here, and why it is pinned against the
     * real controller in
     * src/routes/__tests__/messages-stream-characterization.test.ts instead.
     */
    it('records no completeness information about the stream that produced the text', async () => {
      await saveAiTurnMessage({
        requestId: 'req-1',
        sessionId,
        userId,
        accumulatedText: 'I hear that you felt',
        effectiveStage: 1,
        refiningNeedContext: null,
      });

      const written = (prisma.message.create as jest.Mock).mock.calls[0][0].data;
      expect(written).not.toHaveProperty('truncated');
      expect(written).not.toHaveProperty('incomplete');
    });
  });

  describe('cleanupFailedStreamTurn', () => {
    it('deletes the user message and publishes a retryable error', async () => {
      await cleanupFailedStreamTurn({
        requestId: 'req-1',
        sessionId,
        userId,
        userMessageId: 'user-message-1',
      });

      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'user-message-1' } });
      expect(publishMessageError).toHaveBeenCalledWith(
        sessionId,
        userId,
        'user-message-1',
        'Sorry, I had trouble generating a response. Please try again.',
        true
      );
    });

    it('writes no AI message while cleaning up', async () => {
      await cleanupFailedStreamTurn({
        requestId: 'req-1',
        sessionId,
        userId,
        userMessageId: 'user-message-1',
      });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('still publishes the error when the delete fails', async () => {
      (prisma.message.delete as jest.Mock).mockRejectedValue(new Error('row gone'));

      await expect(
        cleanupFailedStreamTurn({
          requestId: 'req-1',
          sessionId,
          userId,
          userMessageId: 'user-message-1',
        })
      ).resolves.toBeUndefined();

      expect(publishMessageError).toHaveBeenCalled();
    });

    it('does not throw when the Ably publish fails', async () => {
      (publishMessageError as jest.Mock).mockRejectedValue(new Error('ably down'));

      await expect(
        cleanupFailedStreamTurn({
          requestId: 'req-1',
          sessionId,
          userId,
          userMessageId: 'user-message-1',
        })
      ).resolves.toBeUndefined();
    });
  });
});
