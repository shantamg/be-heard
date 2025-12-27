/**
 * Stage 1 Controller
 *
 * Handles the Witness stage endpoints:
 * - POST /sessions/:id/messages - Send message and get AI response
 * - POST /sessions/:id/feel-heard - Confirm user feels heard
 * - GET /sessions/:id/messages - Get conversation history
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getWitnessResponse } from '../services/ai';
import {
  sendMessageRequestSchema,
  feelHeardRequestSchema,
  getMessagesQuerySchema,
} from '@be-heard/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// Response Helpers
// ============================================================================

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
// Helpers
// ============================================================================

/**
 * Get partner's user ID from a session
 */
async function getPartnerUserId(
  sessionId: string,
  currentUserId: string
): Promise<string | null> {
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

  if (!session) return null;

  const partner = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );

  return partner?.userId ?? null;
}

/**
 * Check if partner has completed stage 1 "feel heard"
 */
async function hasPartnerCompletedStage1(
  sessionId: string,
  currentUserId: string
): Promise<boolean> {
  const partnerId = await getPartnerUserId(sessionId, currentUserId);
  if (!partnerId) return false;

  const partnerProgress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 1,
      },
    },
  });

  if (!partnerProgress) return false;

  const gates = partnerProgress.gatesSatisfied as Record<string, unknown> | null;
  return gates?.feelHeard === true;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Send a message in Stage 1 and get AI witness response
 * POST /sessions/:id/messages
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = sendMessageRequestSchema.safeParse(req.body);
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

    const { content } = parseResult.data;

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

    // Check user is in stage 1
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 1) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot send messages: you are in stage ${currentStage}, but stage 1 is required`,
        400
      );
      return;
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: user.id,
        role: 'USER',
        content,
        stage: 1,
      },
    });

    // Get conversation history for context
    const history = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [{ senderId: user.id }, { role: 'AI', senderId: null }],
      },
      orderBy: { timestamp: 'asc' },
      take: 20, // Limit context window
    });

    // Count user turns for AI context
    const userTurnCount = history.filter((m) => m.role === 'USER').length;

    // Get AI witness response
    const aiContent = await getWitnessResponse(
      history.map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      })),
      {
        userName: user.name || 'there',
        turnCount: userTurnCount,
      }
    );

    // Save AI response
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        role: 'AI',
        content: aiContent,
        stage: 1,
      },
    });

    successResponse(res, {
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        timestamp: userMessage.timestamp.toISOString(),
      },
      aiResponse: {
        id: aiMessage.id,
        content: aiMessage.content,
        timestamp: aiMessage.timestamp.toISOString(),
      },
    });
  } catch (error) {
    console.error('[sendMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to send message', 500);
  }
}

/**
 * Confirm that user feels heard and can proceed
 * POST /sessions/:id/feel-heard
 */
export async function confirmFeelHeard(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = feelHeardRequestSchema.safeParse(req.body);
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

    const { confirmed, feedback } = parseResult.data;

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
            members: true,
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
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 1
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 1) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm feel-heard: you are in stage ${currentStage}, but stage 1 is required`,
        400
      );
      return;
    }

    // Build gates satisfied data
    const gatesSatisfied = {
      feelHeard: confirmed,
      confirmedAt: new Date().toISOString(),
      ...(feedback ? { feedback } : {}),
    } satisfies Prisma.InputJsonValue;

    // Update stage progress
    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 1,
        },
      },
      data: {
        gatesSatisfied,
        status: confirmed ? 'GATE_PENDING' : 'IN_PROGRESS',
      },
    });

    // Check if partner has also completed
    const partnerCompleted = await hasPartnerCompletedStage1(sessionId, user.id);
    const canAdvance = confirmed && partnerCompleted;

    // Notify partner of stage completion
    if (confirmed) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        await notifyPartner(sessionId, partnerId, 'partner.stage_completed', {
          stage: 1,
          completedBy: user.id,
        });
      }
    }

    // If both partners are ready, publish advancement event
    if (canAdvance) {
      await publishSessionEvent(sessionId, 'partner.advanced', {
        fromStage: 1,
        toStage: 2,
      });
    }

    successResponse(res, {
      confirmed,
      confirmedAt: new Date().toISOString(),
      canAdvance,
      partnerCompleted,
    });
  } catch (error) {
    console.error('[confirmFeelHeard] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm feel-heard', 500);
  }
}

/**
 * Get conversation history for the current user in a session
 * GET /sessions/:id/messages
 */
export async function getConversationHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate query params
    const parseResult = getMessagesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { limit, before, after } = parseResult.data;

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

    // Build cursor conditions
    const cursorCondition: Record<string, unknown> = {};
    if (before) {
      cursorCondition.timestamp = { lt: new Date(before) };
    }
    if (after) {
      cursorCondition.timestamp = { gt: new Date(after) };
    }

    // Get messages - only user's own messages and AI responses
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id },
          { role: 'AI', senderId: null },
        ],
        ...cursorCondition,
      },
      orderBy: { timestamp: 'asc' },
      take: limit + 1, // Fetch one extra to check for more
    });

    // Check if there are more messages
    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    successResponse(res, {
      messages: resultMessages.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        createdAt: m.timestamp.toISOString(),
      })),
      hasMore,
    });
  } catch (error) {
    console.error('[getConversationHistory] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get messages', 500);
  }
}
