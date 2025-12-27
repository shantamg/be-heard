import { Request, Response } from 'express';
import {
  getNeeds,
  confirmNeeds,
  consentToShareNeeds,
  getCommonGround,
} from '../../controllers/stage3';
import { prisma } from '../../lib/prisma';
import * as needsService from '../../services/needs';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    stageProgress: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    userVessel: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    identifiedNeed: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    consentRecord: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    sharedVessel: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    commonGround: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock needs service
jest.mock('../../services/needs', () => ({
  extractNeedsFromConversation: jest.fn(),
  findCommonGround: jest.fn(),
}));

// Mock realtime service
jest.mock('../../services/realtime', () => ({
  publishSessionEvent: jest.fn().mockResolvedValue(undefined),
  publishStageProgress: jest.fn().mockResolvedValue(undefined),
  notifyPartner: jest.fn().mockResolvedValue(undefined),
  notifyPartnerWithFallback: jest.fn().mockResolvedValue(undefined),
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
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

  return {
    res: {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
  };
}

describe('Stage 3 API', () => {
  const mockUser = { id: 'cluser0001aaaaaaaaa', email: 'test@example.com', name: 'Test User' };
  const mockPartnerId = 'cluser0002aaaaaaaaa';
  const mockSessionId = 'clsess0001aaaaaaaaa';
  const mockVesselId = 'clvess0001aaaaaaaaa';
  const mockNeedId1 = 'clneed0001aaaaaaaaa';
  const mockNeedId2 = 'clneed0002aaaaaaaaa';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /sessions/:id/needs (getNeeds)', () => {
    it('returns AI-synthesized needs for the user', async () => {
      const mockNeeds = [
        {
          id: mockNeedId1,
          vesselId: mockVesselId,
          need: 'To feel emotionally connected with partner',
          category: 'CONNECTION',
          evidence: ['I feel disconnected'],
          aiConfidence: 0.85,
          confirmed: false,
          createdAt: new Date(),
        },
        {
          id: mockNeedId2,
          vesselId: mockVesselId,
          need: 'To have contributions acknowledged',
          category: 'RECOGNITION',
          evidence: ['No one notices what I do'],
          aiConfidence: 0.78,
          confirmed: false,
          createdAt: new Date(),
        },
      ];

      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue(mockNeeds);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            needs: expect.arrayContaining([
              expect.objectContaining({
                id: mockNeedId1,
                category: 'CONNECTION',
                need: 'To feel emotionally connected with partner',
              }),
              expect.objectContaining({
                id: mockNeedId2,
                category: 'RECOGNITION',
              }),
            ]),
          }),
        })
      );
    });

    it('triggers AI extraction if no needs exist yet', async () => {
      const mockExtractedNeeds = [
        {
          id: 'clneed0003aaaaaaaaa',
          vesselId: mockVesselId,
          need: 'To feel secure in the relationship',
          category: 'SAFETY',
          evidence: ['I need stability'],
          aiConfidence: 0.9,
          confirmed: false,
          createdAt: new Date(),
        },
      ];

      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([]); // No needs yet

      (needsService.extractNeedsFromConversation as jest.Mock).mockResolvedValue(mockExtractedNeeds);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(needsService.extractNeedsFromConversation).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.id
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            needs: expect.arrayContaining([
              expect.objectContaining({
                id: 'clneed0003aaaaaaaaa',
                category: 'SAFETY',
              }),
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

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('rejects request when user not in stage 3', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 2, // Still in stage 2
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

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('stage 3'),
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/confirm (confirmNeeds)', () => {
    it('confirms user needs and marks them as confirmed', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const mockNeed = {
        id: mockNeedId1,
        vesselId: mockVesselId,
        need: 'To feel emotionally connected',
        category: 'CONNECTION',
        evidence: [],
        aiConfidence: 0.85,
        confirmed: false,
        createdAt: new Date(),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null); // Partner not shared
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([mockNeed]);
      (prisma.identifiedNeed.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          needIds: [mockNeedId1],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            confirmedAt: expect.any(String),
          }),
        })
      );

      expect(prisma.identifiedNeed.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [mockNeedId1] },
            vesselId: mockVesselId,
          },
          data: { confirmed: true },
        })
      );
    });

    it('allows adjustments to need descriptions', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const mockNeed = {
        id: mockNeedId1,
        vesselId: mockVesselId,
        need: 'To feel emotionally connected',
        category: 'CONNECTION',
        evidence: [],
        aiConfidence: 0.85,
        confirmed: false,
        createdAt: new Date(),
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        relationship: { members: [{ userId: mockUser.id }, { userId: mockPartnerId }] },
      });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([mockNeed]);
      (prisma.identifiedNeed.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.identifiedNeed.update as jest.Mock).mockResolvedValue({
        ...mockNeed,
        need: 'To feel deeply heard and understood',
        confirmed: true,
      });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          needIds: [mockNeedId1],
          adjustments: [
            {
              needId: mockNeedId1,
              confirmed: true,
              correction: 'To feel deeply heard and understood',
            },
          ],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(prisma.identifiedNeed.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockNeedId1 },
          data: expect.objectContaining({
            need: 'To feel deeply heard and understood',
            confirmed: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('validates needIds are provided', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
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

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {}, // Missing needIds
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/needs/consent (consentToShareNeeds)', () => {
    it('records consent to share needs with partner', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true },
      };

      const mockNeeds = [
        {
          id: mockNeedId1,
          vesselId: mockVesselId,
          need: 'To feel connected',
          category: 'CONNECTION',
          evidence: [],
          confirmed: true,
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null); // Partner hasn't consented
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue(mockNeeds);
      (prisma.consentRecord.create as jest.Mock).mockResolvedValue({
        id: 'consent-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        targetType: 'IDENTIFIED_NEED',
        targetId: mockNeedId1,
        decision: 'GRANTED',
        createdAt: new Date(),
      });

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consented: true,
            sharedAt: expect.any(String),
            waitingForPartner: true,
          }),
        })
      );
    });

    it('indicates when both partners have consented', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: mockVesselId });
      (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([
        { id: mockNeedId1, vesselId: mockVesselId, confirmed: true },
      ]);
      (prisma.consentRecord.create as jest.Mock).mockResolvedValue({
        id: 'consent-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        targetType: 'IDENTIFIED_NEED',
        targetId: mockNeedId1,
        decision: 'GRANTED',
      });

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consented: true,
            waitingForPartner: false,
            commonGroundReady: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { needIds: [mockNeedId1] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await consentToShareNeeds(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });
  });

  describe('GET /sessions/:id/common-ground (getCommonGround)', () => {
    it('returns common ground analysis when both partners have shared', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockCommonGround = [
        {
          id: 'clcomm0001aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both partners need to feel emotionally connected',
          category: 'CONNECTION',
          confirmedByA: true,
          confirmedByB: true,
          confirmedAt: new Date(),
        },
      ];

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'shared-vessel-1', sessionId: mockSessionId });
      (prisma.commonGround.findMany as jest.Mock).mockResolvedValue(mockCommonGround);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: expect.arrayContaining([
              expect.objectContaining({
                id: 'clcomm0001aaaaaaaaa',
                category: 'CONNECTION',
                need: 'Both partners need to feel emotionally connected',
              }),
            ]),
            analysisComplete: true,
            bothConfirmed: true,
          }),
        })
      );
    });

    it('triggers common ground analysis when both have shared but no analysis exists', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const mockNewCommonGround = [
        {
          id: 'clcomm0002aaaaaaaaa',
          sharedVesselId: 'shared-vessel-1',
          need: 'Both value feeling safe in discussions',
          category: 'SAFETY',
          confirmedByA: false,
          confirmedByB: false,
          confirmedAt: null,
        },
      ];

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({ id: 'shared-vessel-1', sessionId: mockSessionId });
      (prisma.commonGround.findMany as jest.Mock).mockResolvedValue([]); // No common ground exists

      (needsService.findCommonGround as jest.Mock).mockResolvedValue(mockNewCommonGround);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(needsService.findCommonGround).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.id,
        mockPartnerId
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: expect.arrayContaining([
              expect.objectContaining({
                id: 'clcomm0002aaaaaaaaa',
                category: 'SAFETY',
              }),
            ]),
          }),
        })
      );
    });

    it('returns waiting state when partner has not shared yet', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true, needsShared: true },
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartnerId,
        stage: 3,
        status: 'IN_PROGRESS',
        gatesSatisfied: { needsConfirmed: true }, // Partner hasn't shared
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartnerId }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commonGround: [],
            analysisComplete: false,
            bothConfirmed: false,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCommonGround(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });
});
