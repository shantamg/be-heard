/**
 * Stage 0 Controller - Curiosity Compact Signing
 *
 * Handles the compact signing process where both parties agree to
 * engage in the BeHeard conflict resolution process.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { notifyPartner } from '../services/realtime';
import { ApiResponse, ErrorCode, signCompactRequestSchema } from '@be-heard/shared';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Types
// ============================================================================

interface CompactGates {
  compactSigned: boolean;
  signedAt: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets a partner's stage 0 progress
 */
async function getPartnerProgress(
  sessionId: string,
  currentUserId: string
): Promise<{ userId: string; gatesSatisfied: CompactGates | null } | null> {
  const partnerId = await getPartnerUserId(sessionId, currentUserId);

  if (!partnerId) {
    return null;
  }

  const progress = await prisma.stageProgress.findFirst({
    where: {
      sessionId,
      userId: partnerId,
      stage: 0,
    },
  });

  return {
    userId: partnerId,
    gatesSatisfied: progress?.gatesSatisfied as CompactGates | null,
  };
}

/**
 * Checks if a session exists and user has access
 */
async function validateSessionAccess(
  sessionId: string,
  userId: string
): Promise<{ valid: boolean; session?: unknown }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!session) {
    return { valid: false };
  }

  const isMember = session.relationship.members.some((m) => m.userId === userId);
  if (!isMember) {
    return { valid: false };
  }

  return { valid: true, session };
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Sign the Curiosity Compact
 * POST /sessions/:id/compact/sign
 */
export async function signCompact(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Validate request body
    const parseResult = signCompactRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        ErrorCode.VALIDATION_ERROR,
        'Invalid request: agreed must be true',
        400,
        parseResult.error.issues
      );
      return;
    }

    // Check session exists and user has access
    const sessionCheck = await validateSessionAccess(sessionId, user.id);
    if (!sessionCheck.valid) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Check if already signed
    const existing = await prisma.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 0,
        },
      },
    });

    const existingGates = existing?.gatesSatisfied as CompactGates | null;
    if (existingGates?.compactSigned) {
      errorResponse(res, ErrorCode.CONFLICT, 'Compact already signed', 409);
      return;
    }

    const signedAt = new Date().toISOString();

    // Update stage progress
    await prisma.stageProgress.upsert({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 0,
        },
      },
      create: {
        sessionId,
        userId: user.id,
        stage: 0,
        status: 'IN_PROGRESS',
        gatesSatisfied: { compactSigned: true, signedAt },
      },
      update: {
        gatesSatisfied: { compactSigned: true, signedAt },
      },
    });

    // Check if partner has signed
    const partner = await getPartnerProgress(sessionId, user.id);
    const partnerSigned = partner?.gatesSatisfied?.compactSigned ?? false;
    const canAdvance = partnerSigned;

    // Notify partner
    if (partner?.userId) {
      await notifyPartner(sessionId, partner.userId, 'partner.signed_compact', {
        signedAt,
      });
    }

    successResponse(res, {
      signed: true,
      signedAt,
      partnerSigned,
      canAdvance,
    });
  } catch (error) {
    console.error('[signCompact] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to sign compact', 500);
  }
}

/**
 * Get Compact signing status
 * GET /sessions/:id/compact/status
 */
export async function getCompactStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Check session exists and user has access
    const sessionCheck = await validateSessionAccess(sessionId, user.id);
    if (!sessionCheck.valid) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    // Get user's own progress
    const myProgress = await prisma.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 0,
        },
      },
    });

    const myGates = myProgress?.gatesSatisfied as CompactGates | null;
    const mySigned = myGates?.compactSigned ?? false;
    const mySignedAt = myGates?.signedAt ?? null;

    // Only show partner status if user has signed (privacy constraint)
    let partnerSigned = false;
    let partnerSignedAt: string | null = null;

    if (mySigned) {
      const partner = await getPartnerProgress(sessionId, user.id);
      partnerSigned = partner?.gatesSatisfied?.compactSigned ?? false;
      partnerSignedAt = partner?.gatesSatisfied?.signedAt ?? null;
    }

    successResponse(res, {
      mySigned,
      mySignedAt,
      partnerSigned,
      partnerSignedAt,
      canAdvance: mySigned && partnerSigned,
    });
  } catch (error) {
    console.error('[getCompactStatus] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get compact status', 500);
  }
}
