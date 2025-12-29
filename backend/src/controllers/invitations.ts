import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { notifyPartner } from '../services/realtime';
import { z } from 'zod';
import { ApiResponse, ErrorCode } from '@meet-without-fear/shared';
import { successResponse, errorResponse } from '../utils/response';

// ============================================================================
// Types
// ============================================================================

// Note: AuthenticatedRequest uses the global Express.Request.user type
// defined in middleware/auth.ts via declare global

// ============================================================================
// Validation Schemas
// ============================================================================

const createSessionSchema = z.object({
  personId: z.string().optional(),
  inviteName: z.string().min(1).optional(),
  context: z.string().optional(),
}).refine(
  (data) => data.personId || data.inviteName,
  { message: 'Must provide personId or inviteName' }
);

const declineInvitationSchema = z.object({
  reason: z.string().optional(),
});

const updateNicknameSchema = z.object({
  nickname: z.string().min(1).max(100).nullable(),
});

// ============================================================================
// Controllers
// ============================================================================

/**
 * List user's sessions
 * GET /sessions
 */
export async function listSessions(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { status, limit = '20', cursor } = req.query;
    const takeLimit = parseInt(limit as string, 10);

    // Find sessions where user is a member of the relationship
    const sessions = await prisma.session.findMany({
      where: {
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
        ...(status && { status: status as 'INVITED' | 'ACTIVE' | 'PAUSED' | 'RESOLVED' | 'ABANDONED' }),
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
                    firstName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        stageProgress: true, // Get all stage progress records
      },
      orderBy: { updatedAt: 'desc' },
      take: takeLimit + 1,
      ...(cursor && { cursor: { id: cursor as string }, skip: 1 }),
    });

    const hasMore = sessions.length > takeLimit;
    const items = hasMore ? sessions.slice(0, -1) : sessions;

    const formattedSessions = items.map((session) => {
      // Find my membership record (for nickname I use for partner)
      const myMember = session.relationship.members.find(
        (m: { userId: string }) => m.userId === user.id
      );
      const partnerMember = session.relationship.members.find(
        (m: { userId: string }) => m.userId !== user.id
      );

      // Get user's latest stage progress
      const myProgressRecord = session.stageProgress
        .filter((sp: { userId: string }) => sp.userId === user.id)
        .sort((a: { stage: number }, b: { stage: number }) => b.stage - a.stage)[0];

      // Get partner's latest stage progress
      const partnerProgressRecord = partnerMember
        ? session.stageProgress
            .filter((sp: { userId: string }) => sp.userId === partnerMember.userId)
            .sort((a: { stage: number }, b: { stage: number }) => b.stage - a.stage)[0]
        : null;

      // Default progress for users who haven't started
      const defaultProgress = {
        stage: 0,
        status: 'NOT_STARTED' as const,
        startedAt: null,
        completedAt: null,
      };

      const myProgress = myProgressRecord
        ? {
            stage: myProgressRecord.stage,
            status: myProgressRecord.status,
            startedAt: myProgressRecord.startedAt?.toISOString() ?? null,
            completedAt: myProgressRecord.completedAt?.toISOString() ?? null,
          }
        : defaultProgress;

      const partnerProgress = partnerProgressRecord
        ? {
            stage: partnerProgressRecord.stage,
            status: partnerProgressRecord.status,
            startedAt: partnerProgressRecord.startedAt?.toISOString() ?? null,
            completedAt: partnerProgressRecord.completedAt?.toISOString() ?? null,
          }
        : defaultProgress;

      // Compute action needed arrays
      // selfActionNeeded: gates the user needs to satisfy
      // partnerActionNeeded: gates the partner needs to satisfy
      const selfActionNeeded: string[] = [];
      const partnerActionNeeded: string[] = [];

      // If user is behind partner or has incomplete status, they need action
      if (myProgress.status === 'IN_PROGRESS' || myProgress.status === 'NOT_STARTED') {
        selfActionNeeded.push('complete_stage');
      }

      // If partner is behind or has incomplete status
      if (partnerProgress.status === 'IN_PROGRESS' || partnerProgress.status === 'NOT_STARTED') {
        partnerActionNeeded.push('complete_stage');
      }

      // For invited sessions (partner hasn't joined), use nickname from my membership
      // For active sessions, still use nickname (what I call them) with fallback to their actual name
      const partnerDisplayName = partnerMember
        ? (myMember as { nickname?: string | null } | undefined)?.nickname || partnerMember.user.firstName || partnerMember.user.name
        : (myMember as { nickname?: string | null } | undefined)?.nickname || null;

      return {
        id: session.id,
        relationshipId: session.relationshipId,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        partner: partnerMember
          ? {
              id: partnerMember.user.id,
              name: partnerDisplayName,
              nickname: (myMember as { nickname?: string | null } | undefined)?.nickname || null,
            }
          : { id: '', name: partnerDisplayName, nickname: (myMember as { nickname?: string | null } | undefined)?.nickname || null },
        myProgress,
        partnerProgress,
        selfActionNeeded,
        partnerActionNeeded,
      };
    });

    successResponse(res, {
      items: formattedSessions,
      hasMore,
      cursor: hasMore ? items[items.length - 1]?.id : undefined,
    });
  } catch (error) {
    console.error('[listSessions] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to list sessions', 500);
  }
}

/**
 * Create a new session with an invitation
 * POST /sessions
 */
export async function createSession(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const parseResult = createSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const { personId, inviteName } = parseResult.data;

    // Create or find relationship
    let relationship;
    if (personId) {
      // Find existing relationship with this person
      const existingMember = await prisma.relationshipMember.findFirst({
        where: {
          userId: personId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
        include: { relationship: true },
      });

      if (existingMember) {
        relationship = existingMember.relationship;
      }
    }

    // If no existing relationship, create a new one
    if (!relationship) {
      relationship = await prisma.relationship.create({
        data: {
          members: {
            create: {
              userId: user.id,
              nickname: inviteName || null, // Store what inviter calls the invitee
            },
          },
        },
      });
    } else {
      // Update nickname on existing membership if inviteName provided
      if (inviteName) {
        await prisma.relationshipMember.update({
          where: {
            relationshipId_userId: {
              relationshipId: relationship.id,
              userId: user.id,
            },
          },
          data: { nickname: inviteName },
        });
      }
    }

    // Create session in INVITED status
    const session = await prisma.session.create({
      data: {
        relationshipId: relationship.id,
        status: 'INVITED',
      },
    });

    // Create invitation with 7-day expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await prisma.invitation.create({
      data: {
        sessionId: session.id,
        invitedById: user.id,
        name: inviteName,
        expiresAt,
      },
    });

    // Generate invitation URL (user shares via their own channels)
    const appUrl = process.env.APP_URL || 'https://meetwithoutfear.app';
    const invitationUrl = `${appUrl}/invitation/${invitation.id}`;

    // Create initial stage progress for inviter
    await prisma.stageProgress.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        stage: 0,
        status: 'IN_PROGRESS',
      },
    });

    // Create user vessel for inviter
    await prisma.userVessel.create({
      data: {
        sessionId: session.id,
        userId: user.id,
      },
    });

    // Create shared vessel
    await prisma.sharedVessel.create({
      data: {
        sessionId: session.id,
      },
    });

    successResponse(
      res,
      {
        session: {
          id: session.id,
          status: session.status,
          createdAt: session.createdAt,
          // Include partner info with nickname for immediate display
          partner: {
            id: '',
            name: inviteName || null,
            nickname: inviteName || null,
          },
        },
        invitationId: invitation.id,
        invitationUrl,
      },
      201
    );
  } catch (error) {
    console.error('[createSession] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to create session', 500);
  }
}

/**
 * Get invitation details
 * GET /invitations/:id
 */
export async function getInvitation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const invitation = await prisma.invitation.findUnique({
      where: { id },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        session: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!invitation) {
      errorResponse(res, 'NOT_FOUND', 'Invitation not found', 404);
      return;
    }

    // Check if expired
    const isExpired = new Date() > invitation.expiresAt;
    const status = isExpired && invitation.status === 'PENDING' ? 'EXPIRED' : invitation.status;

    successResponse(res, {
      invitation: {
        id: invitation.id,
        invitedBy: {
          id: invitation.invitedBy.id,
          name: invitation.invitedBy.name,
        },
        name: invitation.name,
        status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        session: invitation.session,
      },
    });
  } catch (error) {
    console.error('[getInvitation] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get invitation', 500);
  }
}

/**
 * Accept an invitation and join the session
 * POST /invitations/:id/accept
 */
export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id } = req.params;

    const invitation = await prisma.invitation.findUnique({
      where: { id },
      include: {
        session: true,
        invitedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      errorResponse(res, 'NOT_FOUND', 'Invitation not found', 404);
      return;
    }

    // Prevent self-acceptance
    if (invitation.invitedById === user.id) {
      errorResponse(res, 'VALIDATION_ERROR', 'Cannot accept your own invitation', 400);
      return;
    }

    // Check if already processed
    if (invitation.status !== 'PENDING') {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Invitation has already been ${invitation.status.toLowerCase()}`,
        400
      );
      return;
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      await prisma.invitation.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      errorResponse(res, 'EXPIRED', 'Invitation has expired', 410);
      return;
    }

    // Join the relationship
    const existingMembership = await prisma.relationshipMember.findUnique({
      where: {
        relationshipId_userId: {
          relationshipId: invitation.session.relationshipId,
          userId: user.id,
        },
      },
    });

    if (!existingMembership) {
      await prisma.relationshipMember.create({
        data: {
          relationshipId: invitation.session.relationshipId,
          userId: user.id,
        },
      });
    }

    // Update invitation status
    await prisma.invitation.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Update session to ACTIVE
    await prisma.session.update({
      where: { id: invitation.sessionId },
      data: { status: 'ACTIVE' },
    });

    // Create stage progress for accepter
    await prisma.stageProgress.create({
      data: {
        sessionId: invitation.sessionId,
        userId: user.id,
        stage: 0,
        status: 'IN_PROGRESS',
      },
    });

    // Create user vessel for accepter
    await prisma.userVessel.create({
      data: {
        sessionId: invitation.sessionId,
        userId: user.id,
      },
    });

    // Get session summary for response
    const session = await prisma.session.findUnique({
      where: { id: invitation.sessionId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        relationship: {
          select: {
            id: true,
            members: {
              select: {
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
      },
    });

    // Notify inviter via realtime that partner joined
    await notifyPartner(invitation.sessionId, invitation.invitedById, 'session.joined', {
      userId: user.id,
      userName: user.name,
    });

    successResponse(res, {
      session: {
        id: session?.id,
        status: session?.status,
        createdAt: session?.createdAt,
        members: session?.relationship.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
        })),
      },
    });
  } catch (error) {
    console.error('[acceptInvitation] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to accept invitation', 500);
  }
}

/**
 * Decline an invitation
 * POST /invitations/:id/decline
 */
export async function declineInvitation(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id } = req.params;

    const parseResult = declineInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const { reason } = parseResult.data;

    const invitation = await prisma.invitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      errorResponse(res, 'NOT_FOUND', 'Invitation not found', 404);
      return;
    }

    // Check if already processed
    if (invitation.status !== 'PENDING') {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Invitation has already been ${invitation.status.toLowerCase()}`,
        400
      );
      return;
    }

    // Update invitation status
    await prisma.invitation.update({
      where: { id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: reason,
      },
    });

    // Update session status to indicate abandonment
    await prisma.session.update({
      where: { id: invitation.sessionId },
      data: { status: 'ABANDONED' },
    });

    // Notify inviter via realtime that invitation was declined
    await notifyPartner(invitation.sessionId, invitation.invitedById, 'invitation.declined', {
      reason,
    });

    successResponse(res, { declined: true });
  } catch (error) {
    console.error('[declineInvitation] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to decline invitation', 500);
  }
}

/**
 * Update nickname for partner in a relationship
 * PATCH /relationships/:relationshipId/nickname
 */
export async function updateNickname(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { relationshipId } = req.params;

    const parseResult = updateNicknameSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const { nickname } = parseResult.data;

    // Verify user is a member of this relationship
    const member = await prisma.relationshipMember.findUnique({
      where: {
        relationshipId_userId: {
          relationshipId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      errorResponse(res, 'NOT_FOUND', 'Relationship not found', 404);
      return;
    }

    // Update the nickname
    const updatedMember = await prisma.relationshipMember.update({
      where: { id: member.id },
      data: { nickname },
    });

    successResponse(res, {
      nickname: updatedMember.nickname,
    });
  } catch (error) {
    console.error('[updateNickname] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to update nickname', 500);
  }
}
