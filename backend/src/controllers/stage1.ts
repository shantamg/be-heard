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
import { getOrchestratedResponse, type FullAIContext } from '../services/ai';
import { getSonnetResponse } from '../lib/bedrock';
import { buildInitialMessagePrompt, buildStagePrompt } from '../services/stage-prompts';
import { extractJsonFromResponse } from '../utils/json-extractor';
import {
  sendMessageRequestSchema,
  feelHeardRequestSchema,
  getMessagesQuerySchema,
  ApiResponse,
  ErrorCode,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId, isSessionCreator } from '../utils/session';
import { embedMessage } from '../services/embedding';

// ============================================================================
// Helpers
// ============================================================================

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
      console.log('[sendMessage] Validation failed:', JSON.stringify(parseResult.error.issues, null, 2));
      console.log('[sendMessage] Request body:', JSON.stringify(req.body, null, 2));
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

    // Check session allows messaging
    // Allow ACTIVE status for all users, and CREATED/INVITED status for the session creator
    // CREATED: Creator is crafting invitation message
    // INVITED: Creator is working on Stages 0-1 while waiting for partner
    if (session.status !== 'ACTIVE') {
      if (session.status === 'CREATED' || session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          console.log(`[sendMessage] Session ${sessionId} is ${session.status} and user ${user.id} is not the creator`);
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
        // Creator can proceed while session is CREATED or INVITED
      } else {
        console.log(`[sendMessage] Session ${sessionId} is not active: ${session.status}`);
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Get user's current stage progress
    let progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 1, auto-advance from Stage 0 if compact is signed
    let currentStage = progress?.stage ?? 0;
    if (currentStage === 0) {
      // During CREATED status (invitation crafting), allow messages at Stage 0
      if (session.status === 'CREATED') {
        console.log(`[sendMessage] Allowing Stage 0 message during invitation crafting phase`);
        // Stay at Stage 0, allow message
      } else {
        // Check if compact is signed - if so, auto-advance to Stage 1
        const gates = progress?.gatesSatisfied as Record<string, unknown> | null;
        if (gates?.compactSigned) {
          console.log(`[sendMessage] Auto-advancing user ${user.id} from Stage 0 to Stage 1`);
          const now = new Date();

          // Complete Stage 0
          if (progress) {
            await prisma.stageProgress.update({
              where: { id: progress.id },
              data: { status: 'COMPLETED', completedAt: now },
            });
          }

          // Create Stage 1 progress
          progress = await prisma.stageProgress.create({
            data: {
              sessionId,
              userId: user.id,
              stage: 1,
              status: 'IN_PROGRESS',
              startedAt: now,
              gatesSatisfied: {},
            },
          });
          currentStage = 1;
        } else {
          // Compact not signed yet - they need to sign first
          errorResponse(
            res,
            'VALIDATION_ERROR',
            'Please sign the Curiosity Compact before starting your conversation',
            400
          );
          return;
        }
      }
    } else if (currentStage !== 1) {
      console.log(`[sendMessage] User ${user.id} in session ${sessionId} is in stage ${currentStage}, not stage 1`);
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
        stage: currentStage,
      },
    });

    // Embed message for cross-session retrieval (non-blocking)
    embedMessage(userMessage.id).catch((err) =>
      console.warn('[sendMessage] Failed to embed user message:', err)
    );

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

    // Detect stage transition: check if this is the first message in Stage 1
    // A stage transition happens when:
    // 1. There are previous messages in the session (from Stage 0 invitation phase)
    // 2. This is the first Stage 1 message from this user (excluding the just-saved message)
    const previousStage1Messages = history.filter(
      (m) => m.stage === 1 && m.senderId === user.id && m.id !== userMessage.id
    );
    // history includes the just-saved message, so we check if there are OTHER Stage 1 messages
    const hasStage0Messages = history.some((m) => m.stage === 0);
    const isStageTransition = hasStage0Messages && previousStage1Messages.length === 0;

    // If it's a stage transition, determine the previous stage
    let previousStage: number | undefined;
    if (isStageTransition) {
      const previousStages = history
        .filter((m) => m.stage !== currentStage)
        .map((m) => m.stage);
      if (previousStages.length > 0) {
        previousStage = Math.max(...previousStages);
      }
      console.log(
        `[sendMessage] Stage transition detected: ${previousStage ?? 'unknown'} → ${currentStage}`
      );
    }

    // Get partner name for context
    const partnerId = await getPartnerUserId(sessionId, user.id);
    let partnerName: string | undefined;
    if (partnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { name: true },
      });
      partnerName = partner?.name || undefined;
    } else if (session.status === 'CREATED') {
      // During invitation phase, get partner name from the invitation
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Get session for duration calculation
    const sessionForDuration = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const sessionDurationMinutes = sessionForDuration
      ? Math.floor((Date.now() - sessionForDuration.createdAt.getTime()) / 60000)
      : 0;

    // Determine if this is the first turn in the session
    const isFirstTurnInSession = userTurnCount === 1;

    // Check if we're in the invitation crafting phase (session status is CREATED)
    const isInvitationPhase = session.status === 'CREATED';

    // Check if user is trying to refine their invitation (session is INVITED and they ask to refine)
    const isRefiningInvitation =
      session.status === 'INVITED' &&
      content.toLowerCase().includes('refine') &&
      content.toLowerCase().includes('invitation');

    // Fetch current invitation message for refinement context
    let currentInvitationMessage: string | null = null;
    if (isRefiningInvitation || isInvitationPhase) {
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { invitationMessage: true, name: true },
      });
      currentInvitationMessage = invitation?.invitationMessage || null;
      // Also get partner name from invitation if not already set
      if (!partnerName && invitation?.name) {
        partnerName = invitation.name;
      }
    }

    // Build full context for orchestrated response
    const aiContext: FullAIContext = {
      sessionId,
      userId: user.id,
      userName: user.name || 'there',
      partnerName,
      stage: currentStage,
      turnCount: userTurnCount,
      emotionalIntensity: 5, // TODO: Get from emotional barometer when implemented
      sessionDurationMinutes,
      isFirstTurnInSession,
      isInvitationPhase: isInvitationPhase || isRefiningInvitation,
      isRefiningInvitation,
      isStageTransition,
      previousStage,
      currentInvitationMessage,
    };

    // Get AI response using full orchestration pipeline
    const orchestratorResult = await getOrchestratedResponse(
      history.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      aiContext
    );

    console.log(
      `[sendMessage] Orchestrator: intent=${orchestratorResult.memoryIntent.intent}, depth=${orchestratorResult.memoryIntent.depth}, mock=${orchestratorResult.usedMock}`
    );

    // The orchestrator already parses structured JSON responses and extracts:
    // - response: the text to show in chat
    // - invitationMessage: the proposed invitation (if any)
    const aiResponseContent = orchestratorResult.response;
    const extractedInvitationMessage = orchestratorResult.invitationMessage ?? null;

    // Only save invitation message during invitation phase
    if ((isInvitationPhase || isRefiningInvitation) && extractedInvitationMessage) {
      console.log(`[sendMessage] Extracted invitation draft: "${extractedInvitationMessage}"`);

      // Save draft to invitation record
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: user.id },
        data: { invitationMessage: extractedInvitationMessage },
      });
    }

    // Save AI response (just the conversational part)
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        role: 'AI',
        content: aiResponseContent,
        stage: currentStage,
      },
    });

    // Embed AI message for cross-session retrieval (non-blocking)
    embedMessage(aiMessage.id).catch((err) =>
      console.warn('[sendMessage] Failed to embed AI message:', err)
    );

    successResponse(res, {
      userMessage: {
        id: userMessage.id,
        sessionId: userMessage.sessionId,
        senderId: userMessage.senderId,
        role: userMessage.role,
        content: userMessage.content,
        stage: userMessage.stage,
        timestamp: userMessage.timestamp.toISOString(),
      },
      aiResponse: {
        id: aiMessage.id,
        sessionId: aiMessage.sessionId,
        senderId: aiMessage.senderId,
        role: aiMessage.role,
        content: aiMessage.content,
        stage: aiMessage.stage,
        timestamp: aiMessage.timestamp.toISOString(),
      },
      // Include structured response fields from AI
      offerFeelHeardCheck: orchestratorResult.offerFeelHeardCheck,
      invitationMessage: extractedInvitationMessage,
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

    // Check session allows feel-heard confirmation
    // Allow ACTIVE status for all users, and INVITED status for the session creator
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
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

    const confirmedAt = new Date().toISOString();

    // Generate AI transition message when user confirms they feel heard
    let transitionMessage: {
      id: string;
      content: string;
      timestamp: string;
      stage: number;
    } | null = null;

    if (confirmed) {
      try {
        // Get partner name for the transition message
        const partnerId = await getPartnerUserId(sessionId, user.id);
        let partnerName: string | undefined;
        if (partnerId) {
          const partner = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { name: true },
          });
          partnerName = partner?.name || undefined;
        } else {
          // Get from invitation if partner hasn't joined yet
          const invitation = await prisma.invitation.findFirst({
            where: { sessionId, invitedById: user.id },
            select: { name: true },
          });
          partnerName = invitation?.name || undefined;
        }

        // Build a simple transition prompt for Stage 1 → Stage 2
        const transitionPrompt = `You are Meet Without Fear, a Process Guardian. ${user.name || 'The user'} has been sharing their experience in the Witness stage and has confirmed they feel fully heard. Now it's time to gently transition to exploring ${partnerName || 'their partner'}'s perspective.

Generate a brief, warm transition message (2-3 sentences) that:
1. Acknowledges the important work they've done sharing and feeling heard
2. Gently introduces the idea of exploring ${partnerName || 'their partner'}'s perspective
3. Ends with an open question to begin the perspective exploration

Keep it natural and conversational. Don't use clinical language or mention "stages".

Respond in JSON format:
\`\`\`json
{
  "response": "Your transition message"
}
\`\`\``;

        const aiResponse = await getSonnetResponse({
          systemPrompt: transitionPrompt,
          messages: [],
          maxTokens: 512,
        });

        let transitionContent: string;
        if (aiResponse) {
          try {
            const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
            transitionContent = typeof parsed.response === 'string'
              ? parsed.response
              : `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
          } catch {
            transitionContent = `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
          }
        } else {
          transitionContent = `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
        }

        // Save the transition message to the database
        const aiMessage = await prisma.message.create({
          data: {
            sessionId,
            senderId: null,
            role: 'AI',
            content: transitionContent,
            stage: 1, // Still Stage 1, but this is the transition message
          },
        });

        // Embed for cross-session retrieval (non-blocking)
        embedMessage(aiMessage.id).catch((err) =>
          console.warn('[confirmFeelHeard] Failed to embed transition message:', err)
        );

        transitionMessage = {
          id: aiMessage.id,
          content: aiMessage.content,
          timestamp: aiMessage.timestamp.toISOString(),
          stage: aiMessage.stage,
        };

        console.log(`[confirmFeelHeard] Generated transition message for session ${sessionId}`);
      } catch (error) {
        console.error('[confirmFeelHeard] Failed to generate transition message:', error);
        // Continue without transition message - not a critical failure
      }
    }

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
      confirmedAt,
      canAdvance,
      partnerCompleted,
      transitionMessage,
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

    const { limit, before, after, order } = parseResult.data;

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
      orderBy: { timestamp: order },
      take: limit + 1, // Fetch one extra to check for more
    });

    // Check if there are more messages
    const hasMore = messages.length > limit;
    let resultMessages = hasMore ? messages.slice(0, limit) : messages;

    // If fetched in descending order, reverse to return chronological order for display
    // This allows us to fetch the latest N messages but display them oldest-first
    if (order === 'desc') {
      resultMessages = resultMessages.reverse();
    }

    successResponse(res, {
      messages: resultMessages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        senderId: m.senderId,
        role: m.role,
        content: m.content,
        stage: m.stage,
        timestamp: m.timestamp.toISOString(),
      })),
      hasMore,
    });
  } catch (error) {
    console.error('[getConversationHistory] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get messages', 500);
  }
}

/**
 * Get AI-generated initial message for a session/stage
 * POST /sessions/:id/messages/initial
 */
export async function getInitialMessage(
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

    // Check if there are already messages in this session for this user
    const existingMessages = await prisma.message.findFirst({
      where: {
        sessionId,
        OR: [{ senderId: user.id }, { role: 'AI', senderId: null }],
      },
    });

    if (existingMessages) {
      // Already has messages, don't generate a new initial message
      errorResponse(res, 'VALIDATION_ERROR', 'Session already has messages', 400);
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

    const currentStage = progress?.stage ?? 0;

    // Determine if this is the invitation phase
    const isInvitationPhase = session.status === 'CREATED';

    // Get user's first name and partner name from invitation
    const userName = user.firstName || user.name || 'there';
    const invitation = await prisma.invitation.findFirst({
      where: { sessionId, invitedById: user.id },
      select: { name: true },
    });
    const partnerName = invitation?.name || undefined;

    // Build the initial message prompt
    const prompt = buildInitialMessagePrompt(
      currentStage,
      { userName, partnerName },
      isInvitationPhase
    );

    // Get AI response
    let responseContent: string;
    try {
      const aiResponse = await getSonnetResponse({
        systemPrompt: prompt,
        messages: [],
        maxTokens: 512,
      });

      if (aiResponse) {
        // Parse the JSON response
        const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
        responseContent = typeof parsed.response === 'string'
          ? parsed.response
          : `Hey ${userName}, what's going on with ${partnerName || 'them'}?`;
      } else {
        // Fallback if AI unavailable
        responseContent = isInvitationPhase
          ? `Hey ${userName}, what's going on with ${partnerName || 'them'}?`
          : `Hey ${userName}, what's on your mind?`;
      }
    } catch (error) {
      console.error('[getInitialMessage] AI response error:', error);
      responseContent = isInvitationPhase
        ? `Hey ${userName}, what's going on with ${partnerName || 'them'}?`
        : `Hey ${userName}, what's on your mind?`;
    }

    // Save the AI message
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        role: 'AI',
        content: responseContent,
        stage: currentStage,
      },
    });

    // Embed initial message for cross-session retrieval (non-blocking)
    embedMessage(aiMessage.id).catch((err) =>
      console.warn('[getInitialMessage] Failed to embed message:', err)
    );

    console.log(`[getInitialMessage] Generated initial message for session ${sessionId}, stage ${currentStage}`);

    successResponse(res, {
      message: {
        id: aiMessage.id,
        sessionId: aiMessage.sessionId,
        senderId: aiMessage.senderId,
        role: aiMessage.role,
        content: aiMessage.content,
        stage: aiMessage.stage,
        timestamp: aiMessage.timestamp.toISOString(),
      },
    });
  } catch (error) {
    console.error('[getInitialMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get initial message', 500);
  }
}
