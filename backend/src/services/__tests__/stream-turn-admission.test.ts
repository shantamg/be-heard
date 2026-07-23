/**
 * Unit tests for `admitStreamTurn` — the gate that decides whether a streaming
 * chat turn runs at all.
 *
 * These pin the seam created by the Phase 2 extraction: every rejection path
 * must return a plain JSON status/body (the controller has not flushed SSE
 * headers yet) AND must leave the database untouched, so a refused turn can
 * never half-create a conversation turn.
 */

import { admitStreamTurn } from '../stream-turn-admission';
import { prisma } from '../../lib/prisma';
import { publishSessionEvent } from '../realtime';
import { brainService } from '../brain-service';
import { isSessionCreator, touchUserSessionActivity } from '../../utils/session';

jest.mock('../../lib/prisma');

jest.mock('../realtime', () => ({
  publishSessionEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../brain-service', () => ({
  brainService: { broadcastMessage: jest.fn() },
}));

jest.mock('../../utils/session', () => ({
  isSessionCreator: jest.fn().mockResolvedValue(true),
  touchUserSessionActivity: jest.fn().mockResolvedValue(undefined),
}));

const sessionId = 'session-1';
const userId = 'user-1';
const partnerId = 'user-2';

function authUser(overrides: Record<string, unknown> = {}) {
  return { id: userId, email: 'a@example.com', name: 'Ann', ...overrides } as any;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: authUser(),
    params: { id: sessionId },
    body: { content: 'hello' },
    ...overrides,
  } as any;
}

function admissionParams(reqOverrides: Record<string, unknown> = {}) {
  return { requestId: 'req-1', req: makeReq(reqOverrides) };
}

/** Every write this service is capable of performing. */
function expectNoWrites() {
  expect(prisma.message.create).not.toHaveBeenCalled();
  expect(touchUserSessionActivity).not.toHaveBeenCalled();
  expect(brainService.broadcastMessage).not.toHaveBeenCalled();
  expect(publishSessionEvent).not.toHaveBeenCalled();
}

describe('stream-turn-admission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'ACTIVE',
      topicFrame: null,
      topicFrameConfirmedAt: null,
    });
    (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
      id: 'progress-1',
      stage: 1,
      gatesSatisfied: {},
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      privacyPreferences: { showActivityStatus: false },
    });
    (prisma.message.create as jest.Mock).mockResolvedValue({
      id: 'user-message-1',
      content: 'hello',
      timestamp: new Date('2026-07-22T10:00:00Z'),
      refiningNeedId: null,
    });
  });

  describe('rejection paths leave the database untouched', () => {
    it('rejects an unauthenticated caller with 401', async () => {
      const result = await admitStreamTurn(admissionParams({ user: undefined }));

      expect(result).toMatchObject({
        admitted: false,
        status: 401,
        body: { error: 'Authentication required' },
      });
      expect(prisma.session.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('rejects an invalid body with 400 before touching the session', async () => {
      const result = await admitStreamTurn(admissionParams({ body: { content: '' } }));

      expect(result).toMatchObject({ admitted: false, status: 400 });
      expect((result as any).body.error).toBe('Invalid request body');
      expect(prisma.session.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('rejects a session the caller is not a member of with 404', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await admitStreamTurn(admissionParams());

      expect(result).toMatchObject({
        admitted: false,
        status: 404,
        body: { error: 'Session not found' },
      });
      expectNoWrites();
    });

    it('scopes the session lookup to relationships the caller belongs to', async () => {
      await admitStreamTurn(admissionParams());

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          relationship: { members: { some: { userId } } },
        },
      });
    });
  });

  describe('session status gate', () => {
    it.each(['COMPLETED', 'ARCHIVED', 'CANCELLED'])(
      'refuses to run a turn on a %s session',
      async (status) => {
        (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: sessionId, status });

        const result = await admitStreamTurn(admissionParams());

        expect(result).toMatchObject({
          admitted: false,
          status: 400,
          body: { error: 'Session is not active' },
        });
        expectNoWrites();
      }
    );

    it.each(['ACTIVE', 'INVITED', 'RESOLVED'])('admits a turn on a %s session', async (status) => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: sessionId, status });

      const result = await admitStreamTurn(admissionParams());

      expect(result.admitted).toBe(true);
    });

    it('admits a CREATED session only for its creator', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: sessionId, status: 'CREATED' });
      (isSessionCreator as jest.Mock).mockResolvedValue(true);

      const result = await admitStreamTurn(admissionParams());

      expect(result.admitted).toBe(true);
    });

    it('refuses a CREATED session for a non-creator member', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: sessionId, status: 'CREATED' });
      (isSessionCreator as jest.Mock).mockResolvedValue(false);

      const result = await admitStreamTurn(admissionParams());

      expect(result).toMatchObject({
        admitted: false,
        status: 400,
        body: { error: 'Session is not active' },
      });
      expectNoWrites();
    });
  });

  describe('refiningNeedId is scoped to the caller\'s own vessel', () => {
    it('refuses a need that does not belong to the caller\'s vessel, writing nothing', async () => {
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ id: 'p', stage: 3, gatesSatisfied: {} });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'vessel-mine' });
      // The partner's need genuinely exists in the table. The mock honours the
      // query, so it is only withheld because the production lookup constrains
      // by the caller's own vesselId — drop that constraint and this test fails
      // rather than passing on an unconditional null.
      (prisma.identifiedNeed.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
        const partnerNeed = {
          id: 'need-belonging-to-partner',
          need: 'space to think',
          category: 'AUTONOMY',
          vesselId: 'vessel-partner',
        };
        if (where.id !== partnerNeed.id) return null;
        if (where.vesselId !== undefined && where.vesselId !== partnerNeed.vesselId) return null;
        return partnerNeed;
      });

      const result = await admitStreamTurn(
        admissionParams({ body: { content: 'refine that', refiningNeedId: 'need-belonging-to-partner' } })
      );

      expect(result).toMatchObject({
        admitted: false,
        status: 400,
        body: { error: 'Invalid refiningNeedId' },
      });
      expectNoWrites();
    });

    it('constrains the need lookup by the caller\'s vessel id', async () => {
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ id: 'p', stage: 3, gatesSatisfied: {} });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'vessel-mine' });
      (prisma.identifiedNeed.findFirst as jest.Mock).mockResolvedValue({
        id: 'need-1',
        need: 'to be heard',
        category: 'CONNECTION',
      });

      await admitStreamTurn(
        admissionParams({ body: { content: 'refine that', refiningNeedId: 'need-1' } })
      );

      expect(prisma.userVessel.findUnique).toHaveBeenCalledWith({
        where: { userId_sessionId: { userId, sessionId } },
        select: { id: true },
      });
      expect(prisma.identifiedNeed.findFirst).toHaveBeenCalledWith({
        where: { id: 'need-1', vesselId: 'vessel-mine' },
        select: { id: true, need: true, category: true },
      });
    });

    it('refuses when the caller has no vessel at all', async () => {
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ id: 'p', stage: 3, gatesSatisfied: {} });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await admitStreamTurn(
        admissionParams({ body: { content: 'refine', refiningNeedId: 'need-1' } })
      );

      expect(result).toMatchObject({ admitted: false, status: 400 });
      expect(prisma.identifiedNeed.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('ignores refiningNeedId outside Stage 3 without rejecting the turn', async () => {
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ id: 'p', stage: 1, gatesSatisfied: {} });

      const result = await admitStreamTurn(
        admissionParams({ body: { content: 'hi', refiningNeedId: 'need-1' } })
      );

      expect(result.admitted).toBe(true);
      expect((result as any).refiningNeedContext).toBeNull();
      expect(prisma.identifiedNeed.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('admitted turn', () => {
    it('persists the user message at the caller\'s current stage and returns it', async () => {
      const result = await admitStreamTurn(admissionParams());

      expect(result.admitted).toBe(true);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId,
          senderId: userId,
          role: 'USER',
          content: 'hello',
          stage: 1,
          refiningNeedId: null,
        },
      });
      expect((result as any).userMessage.id).toBe('user-message-1');
      expect((result as any).currentStage).toBe(1);
    });

    it('defaults to stage 0 when the caller has no in-progress stage', async () => {
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await admitStreamTurn(admissionParams());

      expect((result as any).currentStage).toBe(0);
      expect((result as any).progress).toBeNull();
    });

    it('touches session activity with the new message timestamp', async () => {
      await admitStreamTurn(admissionParams());

      expect(touchUserSessionActivity).toHaveBeenCalledWith(
        sessionId,
        userId,
        new Date('2026-07-22T10:00:00Z')
      );
    });

    it('broadcasts the user message to the Status Site', async () => {
      await admitStreamTurn(admissionParams());

      expect(brainService.broadcastMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-message-1' })
      );
    });
  });

  describe('partner activity publishing respects the privacy preference', () => {
    it('does not publish activity when showActivityStatus is off', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        privacyPreferences: { showActivityStatus: false },
      });

      await admitStreamTurn(admissionParams());
      await new Promise((resolve) => setImmediate(resolve));

      expect(publishSessionEvent).not.toHaveBeenCalled();
    });

    it('publishes partner.activity when showActivityStatus is on', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        privacyPreferences: { showActivityStatus: true },
      });

      await admitStreamTurn(admissionParams());
      await new Promise((resolve) => setImmediate(resolve));

      expect(publishSessionEvent).toHaveBeenCalledWith(
        sessionId,
        'partner.activity',
        { activeAt: '2026-07-22T10:00:00.000Z' },
        userId
      );
    });

    it('does not reject the turn when the activity publish fails', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        privacyPreferences: { showActivityStatus: true },
      });
      (publishSessionEvent as jest.Mock).mockRejectedValue(new Error('ably down'));

      const result = await admitStreamTurn(admissionParams());
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.admitted).toBe(true);
    });
  });

  it('does not leak the partner as the message sender', async () => {
    await admitStreamTurn(admissionParams({ user: authUser({ id: userId }) }));

    const created = (prisma.message.create as jest.Mock).mock.calls[0][0];
    expect(created.data.senderId).toBe(userId);
    expect(created.data.senderId).not.toBe(partnerId);
  });
});
