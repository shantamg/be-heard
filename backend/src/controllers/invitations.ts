import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendInvitationEmail } from '../services/email';
import { notifyPartner } from '../services/realtime';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

// Note: AuthenticatedRequest uses the global Express.Request.user type
// defined in middleware/auth.ts via declare global

// API Response helpers
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function successResponse<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data } as ApiResponse<T>);
}

function errorResponse(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
): void {
  res.status(status).json({
    success: false,
    error: { code, message, details },
  } as ApiResponse<never>);
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createSessionSchema = z.object({
  personId: z.string().optional(),
  inviteEmail: z.string().email().optional(),
  invitePhone: z.string().optional(),
  inviteName: z.string().optional(),
  context: z.string().optional(),
}).refine(
  (data) => data.personId || data.inviteEmail || data.invitePhone,
  { message: 'Must provide personId, inviteEmail, or invitePhone' }
);

const declineInvitationSchema = z.object({
  reason: z.string().optional(),
});

// ============================================================================
// Controllers
// ============================================================================

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

    const { personId, inviteEmail, invitePhone, inviteName } = parseResult.data;

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
            create: { userId: user.id },
          },
        },
      });
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
        email: inviteEmail,
        phone: invitePhone,
        name: inviteName,
        expiresAt,
      },
    });

    // Generate invitation URL
    const appUrl = process.env.APP_URL || 'https://beheard.app';
    const invitationUrl = `${appUrl}/invitation/${invitation.id}`;

    // Send invitation email if provided
    if (inviteEmail) {
      const inviterName = user.name || 'Someone';
      await sendInvitationEmail(inviteEmail, inviterName, invitationUrl);
    }

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
 * Resend an invitation email
 * POST /invitations/:id/resend
 */
export async function resendInvitation(req: Request, res: Response): Promise<void> {
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
        invitedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      errorResponse(res, 'NOT_FOUND', 'Invitation not found', 404);
      return;
    }

    // Only the inviter can resend
    if (invitation.invitedById !== user.id) {
      errorResponse(res, 'FORBIDDEN', 'Only the inviter can resend the invitation', 403);
      return;
    }

    // Can only resend pending invitations
    if (invitation.status !== 'PENDING') {
      errorResponse(res, 'VALIDATION_ERROR', 'Can only resend pending invitations', 400);
      return;
    }

    // Must have an email to resend
    if (!invitation.email) {
      errorResponse(res, 'VALIDATION_ERROR', 'No email address for this invitation', 400);
      return;
    }

    // Generate invitation URL
    const appUrl = process.env.APP_URL || 'https://beheard.app';
    const invitationUrl = `${appUrl}/invitation/${invitation.id}`;

    const inviterName = user.name || 'Someone';
    const emailResult = await sendInvitationEmail(invitation.email, inviterName, invitationUrl);

    if (!emailResult.success) {
      errorResponse(res, 'EMAIL_FAILED', 'Failed to send invitation email', 500);
      return;
    }

    successResponse(res, {
      resent: true,
    });
  } catch (error) {
    console.error('[resendInvitation] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to resend invitation', 500);
  }
}
