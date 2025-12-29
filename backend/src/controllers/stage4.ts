/**
 * Stage 4 Controller
 *
 * Handles the Strategic Repair stage endpoints:
 * - GET /sessions/:id/strategies - Get anonymous strategy pool
 * - POST /sessions/:id/strategies - Propose a strategy
 * - POST /sessions/:id/strategies/rank - Submit ranking
 * - GET /sessions/:id/strategies/overlap - Get ranking overlap
 * - POST /sessions/:id/agreements - Create agreement
 * - POST /sessions/:id/agreements/:agreementId/confirm - Confirm agreement
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  proposeStrategyRequestSchema,
  rankStrategiesRequestSchema,
  confirmAgreementRequestSchema,
  AgreementType,
  ApiResponse,
  ErrorCode,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';
import { z } from 'zod';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine which user slot (A or B) a user occupies in a session
 */
async function getUserSlot(
  sessionId: string,
  userId: string
): Promise<'A' | 'B' | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session) return null;

  const members = session.relationship.members;
  if (members.length < 2) return null;

  // First member is A, second is B
  if (members[0].userId === userId) return 'A';
  if (members[1].userId === userId) return 'B';

  return null;
}

/**
 * Shuffle array for random ordering
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Create agreement request schema locally
const createAgreementRequestSchema = z.object({
  strategyId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  type: z.nativeEnum(AgreementType),
  duration: z.string().optional(),
  measureOfSuccess: z.string().optional(),
  followUpDate: z.string().optional(),
});

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get anonymous strategy pool for the session
 * GET /sessions/:id/strategies
 */
export async function getStrategies(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get strategies without exposing createdBy
    const strategies = await prisma.strategyProposal.findMany({
      where: { sessionId },
      select: {
        id: true,
        description: true,
        needsAddressed: true,
        duration: true,
        measureOfSuccess: true,
        // Note: createdByUserId NOT selected - anonymous pool
      },
    });

    // Shuffle to avoid order bias
    const shuffled = shuffleArray(strategies);

    successResponse(res, {
      strategies: shuffled,
      phase: 'pool',
    });
  } catch (error) {
    console.error('[getStrategies] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get strategies', 500);
  }
}

/**
 * Propose a new strategy
 * POST /sessions/:id/strategies
 */
export async function proposeStrategy(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = proposeStrategyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { description, needsAddressed, duration, measureOfSuccess } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot propose strategy: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Create strategy proposal
    const strategy = await prisma.strategyProposal.create({
      data: {
        sessionId,
        createdByUserId: user.id,
        description,
        needsAddressed,
        duration,
        measureOfSuccess,
        source: 'USER_SUBMITTED',
      },
    });

    successResponse(
      res,
      {
        strategy: {
          id: strategy.id,
          description: strategy.description,
          duration: strategy.duration,
          measureOfSuccess: strategy.measureOfSuccess,
        },
        createdAt: strategy.createdAt.toISOString(),
      },
      201
    );
  } catch (error) {
    console.error('[proposeStrategy] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to propose strategy', 500);
  }
}

/**
 * Submit strategy ranking
 * POST /sessions/:id/strategies/rank
 */
export async function submitRanking(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = rankStrategiesRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { rankedIds } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot submit ranking: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Upsert ranking
    await prisma.strategyRanking.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id, rankedIds },
      update: { rankedIds, submittedAt: new Date() },
    });

    // Update gate
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> | null || {}),
      rankingSubmitted: true,
      rankingSubmittedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: { sessionId, userId: user.id, stage: 4 },
      },
      data: { gatesSatisfied },
    });

    // Check if partner has also ranked
    const partnerId = await getPartnerUserId(sessionId, user.id);
    const rankings = await prisma.strategyRanking.findMany({
      where: { sessionId },
    });

    const partnerRanked = rankings.some((r) => r.userId === partnerId);
    const canReveal = rankings.length >= 2;

    // Notify partner
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.ranking_submitted', {
        stage: 4,
        submittedBy: user.id,
      });
    }

    successResponse(res, {
      ranked: true,
      rankedAt: new Date().toISOString(),
      partnerRanked,
      canReveal,
    });
  } catch (error) {
    console.error('[submitRanking] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit ranking', 500);
  }
}

/**
 * Get ranking overlap between partners
 * GET /sessions/:id/strategies/overlap
 */
export async function getOverlap(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    const partnerId = await getPartnerUserId(sessionId, user.id);

    // Get all rankings for this session
    const rankings = await prisma.strategyRanking.findMany({
      where: { sessionId },
    });

    // Check if both have ranked
    if (rankings.length < 2) {
      successResponse(res, {
        overlap: null,
        waitingForPartner: true,
        agreementCandidates: null,
      });
      return;
    }

    // Calculate overlap
    const myRanking = rankings.find((r) => r.userId === user.id);
    const partnerRanking = rankings.find((r) => r.userId === partnerId);

    if (!myRanking || !partnerRanking) {
      successResponse(res, {
        overlap: null,
        waitingForPartner: true,
        agreementCandidates: null,
      });
      return;
    }

    // Simple overlap: strategies in both top 3
    const myTop3 = new Set(myRanking.rankedIds.slice(0, 3));
    const partnerTop3 = new Set(partnerRanking.rankedIds.slice(0, 3));
    const topOverlapIds = [...myTop3].filter((id) => partnerTop3.has(id));

    // Get strategy details for overlapping strategies
    const overlapStrategies = topOverlapIds.length > 0
      ? await prisma.strategyProposal.findMany({
          where: { id: { in: topOverlapIds } },
          select: {
            id: true,
            description: true,
            needsAddressed: true,
            duration: true,
          },
        })
      : [];

    // Agreement candidates: overlapping or top choices from each
    const agreementCandidateIds = topOverlapIds.length > 0
      ? topOverlapIds
      : [myRanking.rankedIds[0], partnerRanking.rankedIds[0]].filter(Boolean);

    const agreementCandidates = await prisma.strategyProposal.findMany({
      where: { id: { in: agreementCandidateIds } },
      select: {
        id: true,
        description: true,
        duration: true,
      },
    });

    successResponse(res, {
      overlap: overlapStrategies,
      waitingForPartner: false,
      agreementCandidates,
    });
  } catch (error) {
    console.error('[getOverlap] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get overlap', 500);
  }
}

/**
 * Create agreement from a strategy
 * POST /sessions/:id/agreements
 */
export async function createAgreement(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = createAgreementRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { strategyId, description, type, followUpDate } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot create agreement: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Get or verify the strategy if provided
    if (strategyId) {
      const strategy = await prisma.strategyProposal.findUnique({
        where: { id: strategyId },
      });
      if (!strategy || strategy.sessionId !== sessionId) {
        errorResponse(res, 'NOT_FOUND', 'Strategy not found', 404);
        return;
      }
    }

    // Get shared vessel
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      errorResponse(res, 'NOT_FOUND', 'Shared vessel not found', 404);
      return;
    }

    // Determine user slot
    const userSlot = await getUserSlot(sessionId, user.id);

    // Create agreement - proposer auto-agrees
    const agreement = await prisma.agreement.create({
      data: {
        sharedVesselId: sharedVessel.id,
        description,
        type,
        proposalId: strategyId || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        status: 'PROPOSED',
        agreedByA: userSlot === 'A',
        agreedByB: userSlot === 'B',
      },
    });

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'agreement.proposed', {
        agreementId: agreement.id,
        proposedBy: user.id,
      });
    }

    successResponse(
      res,
      {
        agreement: {
          id: agreement.id,
          description: agreement.description,
          type: agreement.type,
          status: agreement.status,
          followUpDate: agreement.followUpDate?.toISOString() ?? null,
        },
        awaitingPartnerConfirmation: true,
      },
      201
    );
  } catch (error) {
    console.error('[createAgreement] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to create agreement', 500);
  }
}

/**
 * Confirm or decline an agreement
 * POST /sessions/:id/agreements/:agreementId/confirm
 */
export async function confirmAgreement(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId, agreementId } = req.params;

    // Validate request body
    const parseResult = confirmAgreementRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { confirmed } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm agreement: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Get the agreement
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        sharedVessel: true,
      },
    });

    if (!agreement) {
      errorResponse(res, 'NOT_FOUND', 'Agreement not found', 404);
      return;
    }

    // Verify agreement belongs to this session
    if (agreement.sharedVessel.sessionId !== sessionId) {
      errorResponse(res, 'NOT_FOUND', 'Agreement not found', 404);
      return;
    }

    // Determine user slot
    const userSlot = await getUserSlot(sessionId, user.id);

    // Update agreement based on confirmation
    const updateData: Prisma.AgreementUpdateInput = {};

    if (confirmed) {
      if (userSlot === 'A') {
        updateData.agreedByA = true;
      } else if (userSlot === 'B') {
        updateData.agreedByB = true;
      }

      // Check if both have now agreed
      const willBothAgree =
        (userSlot === 'A' && agreement.agreedByB) ||
        (userSlot === 'B' && agreement.agreedByA);

      if (willBothAgree) {
        updateData.status = 'AGREED';
        updateData.agreedAt = new Date();
      }
    }
    // If not confirmed, we don't change agreement status - it stays PROPOSED for renegotiation

    const updatedAgreement = await prisma.agreement.update({
      where: { id: agreementId },
      data: updateData,
    });

    const bothConfirmed = updatedAgreement.agreedByA && updatedAgreement.agreedByB;

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'agreement.confirmed', {
        agreementId: agreement.id,
        confirmedBy: user.id,
        confirmed,
        bothConfirmed,
      });
    }

    // Check if session can be marked complete
    const sessionComplete = bothConfirmed && updatedAgreement.status === 'AGREED';

    if (sessionComplete) {
      await publishSessionEvent(sessionId, 'session.resolved', {
        agreementId: updatedAgreement.id,
      });
    }

    successResponse(res, {
      confirmed,
      confirmedAt: new Date().toISOString(),
      partnerConfirmed: bothConfirmed,
      sessionComplete,
    });
  } catch (error) {
    console.error('[confirmAgreement] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm agreement', 500);
  }
}

/**
 * Request AI strategy suggestions
 * POST /sessions/:id/strategies/suggestions
 */
export async function requestSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const { count = 3, focusNeeds } = req.body as {
      count?: number;
      focusNeeds?: string[];
    };

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot request suggestions: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // TODO: Call AI service to generate strategy suggestions based on common ground
    // For now, return empty array - implement AI suggestion service separately
    const suggestions: never[] = [];

    successResponse(res, {
      suggestions,
      source: 'AI_GENERATED',
      count: suggestions.length,
    });
  } catch (error) {
    console.error('[requestSuggestions] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to request suggestions', 500);
  }
}

/**
 * Mark ready to rank strategies
 * POST /sessions/:id/strategies/ready
 */
export async function markReady(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot mark ready: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Update gate
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> | null || {}),
      readyToRank: true,
      readyAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: { sessionId, userId: user.id, stage: 4 },
      },
      data: { gatesSatisfied },
    });

    // Check if partner is also ready
    const partnerId = await getPartnerUserId(sessionId, user.id);
    const partnerProgress = partnerId ? await prisma.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: { sessionId, userId: partnerId, stage: 4 },
      },
    }) : null;

    const partnerGates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;
    const partnerReady = partnerGates?.readyToRank === true;
    const canStartRanking = partnerReady;

    // Notify partner
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.ready_to_rank', {
        stage: 4,
        readyBy: user.id,
      });
    }

    successResponse(res, {
      ready: true,
      readyAt: new Date().toISOString(),
      partnerReady,
      canStartRanking,
    });
  } catch (error) {
    console.error('[markReady] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to mark ready', 500);
  }
}

/**
 * Get agreements list
 * GET /sessions/:id/agreements
 */
export async function getAgreements(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: {
        relationship: {
          include: {
            members: {
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Get shared vessel
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      successResponse(res, {
        agreements: [],
      });
      return;
    }

    // Get agreements for this shared vessel
    const agreements = await prisma.agreement.findMany({
      where: { sharedVesselId: sharedVessel.id },
    });

    // Determine if user is A or B
    const members = session.relationship.members;
    const userIsA = members[0]?.userId === user.id;

    successResponse(res, {
      agreements: agreements.map((a) => ({
        id: a.id,
        description: a.description,
        type: a.type,
        duration: null, // Field removed from schema
        measureOfSuccess: null, // Field removed from schema
        status: a.status,
        agreedByMe: userIsA ? a.agreedByA : a.agreedByB,
        agreedByPartner: userIsA ? a.agreedByB : a.agreedByA,
        agreedAt: a.agreedAt?.toISOString() ?? null,
        followUpDate: a.followUpDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[getAgreements] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get agreements', 500);
  }
}
