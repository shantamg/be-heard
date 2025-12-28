/**
 * Sessions Controller
 *
 * Handles session-level operations:
 * - GET /sessions/:id - Get session details
 * - POST /sessions/:id/pause - Pause active session
 * - POST /sessions/:id/resume - Resume paused session
 * - GET /sessions/:id/progress - Get stage progress for both users
 * - POST /sessions/:id/resolve - Resolve session
 * - POST /sessions/:id/stages/advance - Advance to next stage
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiResponse, ErrorCode } from '@be-heard/shared';
import { notifyPartner } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get session details
 * GET /sessions/:id
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Get session with related data
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
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        stageProgress: {
          where: { userId: user.id },
          orderBy: { stage: 'desc' },
          take: 1,
        },
      },
    });

    if (!session) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Get partner info
    const partnerMember = session.relationship.members.find(
      (m) => m.userId !== user.id
    );

    // Get current stage progress
    const currentProgress = session.stageProgress[0];

    successResponse(res, {
      id: session.id,
      status: session.status,
      currentStage: currentProgress?.stage ?? 0,
      stageStatus: currentProgress?.status ?? 'NOT_STARTED',
      relationshipId: session.relationshipId,
      partner: partnerMember
        ? {
            id: partnerMember.userId,
            name: partnerMember.user.name,
          }
        : null,
      createdAt: session.createdAt.toISOString(),
      resolvedAt: session.resolvedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[getSession] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get session', 500);
  }
}

/**
 * Pause an active session
 * POST /sessions/:id/pause
 */
export async function pauseSession(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

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
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(
        res,
        ErrorCode.SESSION_NOT_ACTIVE,
        `Cannot pause session: current status is ${session.status}`,
        400
      );
      return;
    }

    // Update session status to PAUSED
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'PAUSED' },
    });

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'session.paused', {
        pausedBy: user.id,
        pausedAt: updatedSession.updatedAt.toISOString(),
      });
    }

    successResponse(res, {
      paused: true,
      pausedAt: updatedSession.updatedAt.toISOString(),
      status: updatedSession.status,
    });
  } catch (error) {
    console.error('[pauseSession] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to pause session', 500);
  }
}

/**
 * Resume a paused session
 * POST /sessions/:id/resume
 */
export async function resumeSession(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

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
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Check session is paused
    if (session.status !== 'PAUSED') {
      errorResponse(
        res,
        ErrorCode.VALIDATION_ERROR,
        `Cannot resume session: current status is ${session.status}`,
        400
      );
      return;
    }

    // Update session status to ACTIVE
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE' },
    });

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'session.resumed', {
        resumedBy: user.id,
        resumedAt: updatedSession.updatedAt.toISOString(),
      });
    }

    successResponse(res, {
      resumed: true,
      resumedAt: updatedSession.updatedAt.toISOString(),
      status: updatedSession.status,
    });
  } catch (error) {
    console.error('[resumeSession] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to resume session', 500);
  }
}

/**
 * Get stage progress for both users
 * GET /sessions/:id/progress
 */
export async function getProgress(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

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
        stageProgress: true,
        relationship: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    const partnerId = await getPartnerUserId(sessionId, user.id);

    // Get user's latest stage progress
    const myProgressRecord = session.stageProgress
      .filter((sp) => sp.userId === user.id)
      .sort((a, b) => b.stage - a.stage)[0];

    // Get partner's latest stage progress
    const partnerProgressRecord = partnerId
      ? session.stageProgress
          .filter((sp) => sp.userId === partnerId)
          .sort((a, b) => b.stage - a.stage)[0]
      : null;

    // Default progress for users who haven't started
    const defaultProgress = {
      stage: 0,
      status: 'NOT_STARTED' as const,
      startedAt: null,
      completedAt: null,
      gatesSatisfied: null,
    };

    const myProgress = myProgressRecord
      ? {
          stage: myProgressRecord.stage,
          status: myProgressRecord.status,
          startedAt: myProgressRecord.startedAt?.toISOString() ?? null,
          completedAt: myProgressRecord.completedAt?.toISOString() ?? null,
          gatesSatisfied: myProgressRecord.gatesSatisfied,
        }
      : defaultProgress;

    const partnerProgress = partnerProgressRecord
      ? {
          stage: partnerProgressRecord.stage,
          status: partnerProgressRecord.status,
          startedAt: partnerProgressRecord.startedAt?.toISOString() ?? null,
          completedAt: partnerProgressRecord.completedAt?.toISOString() ?? null,
          gatesSatisfied: partnerProgressRecord.gatesSatisfied,
        }
      : defaultProgress;

    successResponse(res, {
      myProgress,
      partnerProgress,
      sessionStatus: session.status,
    });
  } catch (error) {
    console.error('[getProgress] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get progress', 500);
  }
}

/**
 * Resolve session
 * POST /sessions/:id/resolve
 */
export async function resolveSession(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

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
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(
        res,
        ErrorCode.SESSION_NOT_ACTIVE,
        `Cannot resolve session: current status is ${session.status}`,
        400
      );
      return;
    }

    // Check if there are agreed agreements
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
      include: {
        agreements: {
          where: {
            status: 'AGREED',
          },
        },
      },
    });

    if (!sharedVessel || sharedVessel.agreements.length === 0) {
      errorResponse(
        res,
        ErrorCode.VALIDATION_ERROR,
        'Cannot resolve session: no agreed agreements found',
        400
      );
      return;
    }

    const now = new Date();

    // Update session status to RESOLVED
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
      },
    });

    // Mark all stage progress as COMPLETED
    await prisma.stageProgress.updateMany({
      where: { sessionId },
      data: { status: 'COMPLETED', completedAt: now },
    });

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'session.resolved', {
        resolvedBy: user.id,
        resolvedAt: now.toISOString(),
      });
    }

    // Get agreements with follow-up dates
    const followUpScheduled = sharedVessel.agreements.some(
      (a) => a.followUpDate !== null
    );

    successResponse(res, {
      resolved: true,
      resolvedAt: now.toISOString(),
      agreements: sharedVessel.agreements.map((a) => ({
        id: a.id,
        description: a.description,
        type: a.type,
        status: a.status,
        agreedAt: a.agreedAt?.toISOString() ?? null,
        followUpDate: a.followUpDate?.toISOString() ?? null,
      })),
      followUpScheduled,
    });
  } catch (error) {
    console.error('[resolveSession] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to resolve session', 500);
  }
}

// ============================================================================
// Stage Advancement
// ============================================================================

/**
 * Gate requirements for each stage
 */
const STAGE_GATES: Record<number, string[]> = {
  0: ['compactSigned'],
  1: ['feelHeard'],
  2: ['empathyValidated'],
  3: ['needsConfirmed', 'needsShared', 'commonGroundConfirmed'],
  4: ['rankingSubmitted', 'agreementCreated'],
};

/**
 * Check if all gates for a stage are satisfied
 */
function checkGates(
  stage: number,
  gatesSatisfied: Record<string, unknown> | null
): { satisfied: boolean; unsatisfiedGates: string[] } {
  const requiredGates = STAGE_GATES[stage] || [];
  const unsatisfiedGates: string[] = [];

  for (const gate of requiredGates) {
    if (!gatesSatisfied || !gatesSatisfied[gate]) {
      unsatisfiedGates.push(gate);
    }
  }

  return {
    satisfied: unsatisfiedGates.length === 0,
    unsatisfiedGates,
  };
}

/**
 * Advance to the next stage
 * POST /sessions/:id/stages/advance
 */
export async function advanceStage(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

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
        stageProgress: true,
        relationship: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(
        res,
        ErrorCode.SESSION_NOT_ACTIVE,
        `Cannot advance stage: session status is ${session.status}`,
        400
      );
      return;
    }

    // Get user's current progress
    const currentProgress = session.stageProgress
      .filter((sp) => sp.userId === user.id)
      .sort((a, b) => b.stage - a.stage)[0];

    const currentStage = currentProgress?.stage ?? 0;
    const nextStage = currentStage + 1;

    // Validate stage range
    if (nextStage > 4) {
      errorResponse(
        res,
        ErrorCode.VALIDATION_ERROR,
        'Already at final stage',
        400
      );
      return;
    }

    // Check gates for current stage
    const gatesSatisfied = currentProgress?.gatesSatisfied as Record<string, unknown> | null;
    const gateCheck = checkGates(currentStage, gatesSatisfied);

    if (!gateCheck.satisfied) {
      successResponse(res, {
        advanced: false,
        newStage: currentStage,
        newStatus: currentProgress?.status ?? 'NOT_STARTED',
        advancedAt: null,
        blockedReason: 'GATES_NOT_SATISFIED',
        unsatisfiedGates: gateCheck.unsatisfiedGates,
      });
      return;
    }

    // Special check for Stage 4: requires both users to complete Stage 3
    if (nextStage === 4) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        const partnerProgress = session.stageProgress
          .filter((sp) => sp.userId === partnerId)
          .sort((a, b) => b.stage - a.stage)[0];

        if (!partnerProgress || partnerProgress.stage < 3 || partnerProgress.status !== 'COMPLETED') {
          successResponse(res, {
            advanced: false,
            newStage: currentStage,
            newStatus: 'GATE_PENDING',
            advancedAt: null,
            blockedReason: 'PARTNER_NOT_READY',
          });
          return;
        }
      }
    }

    const now = new Date();

    // Mark current stage as completed
    if (currentProgress) {
      await prisma.stageProgress.update({
        where: { id: currentProgress.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });
    }

    // Create progress for next stage
    const newProgress = await prisma.stageProgress.create({
      data: {
        sessionId,
        userId: user.id,
        stage: nextStage,
        status: 'IN_PROGRESS',
        startedAt: now,
        gatesSatisfied: {},
      },
    });

    // Notify partner about stage advancement
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.advanced', {
        toStage: nextStage,
        advancedAt: now.toISOString(),
      });
    }

    successResponse(res, {
      advanced: true,
      newStage: nextStage,
      newStatus: newProgress.status,
      advancedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[advanceStage] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to advance stage', 500);
  }
}
