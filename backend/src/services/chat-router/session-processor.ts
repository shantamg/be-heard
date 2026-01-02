/**
 * Session Message Processor
 *
 * Processes messages within a session context - saves to database,
 * calls AI orchestrator, returns response. Used by chat router handlers
 * when a message needs to be processed in a session.
 */

import { prisma } from '../../lib/prisma';
import { getOrchestratedResponse, type FullAIContext } from '../ai';
import { getPartnerUserId } from '../../utils/session';
import { embedMessage } from '../embedding';

export interface SessionMessageInput {
  sessionId: string;
  userId: string;
  userName: string;
  content: string;
}

export interface SessionMessageResult {
  userMessage: {
    id: string;
    sessionId: string;
    senderId: string | null;
    role: string;
    content: string;
    stage: number;
    timestamp: string;
  };
  aiResponse: {
    id: string;
    sessionId: string;
    senderId: string | null;
    role: string;
    content: string;
    stage: number;
    timestamp: string;
  };
  /** Stage 1: AI determined user may be ready for feel-heard confirmation */
  offerFeelHeardCheck?: boolean;
  /** Stage 0: Proposed invitation message from AI */
  invitationMessage?: string | null;
}

/**
 * Process a message within a session.
 * Saves messages to database and gets AI response.
 */
export async function processSessionMessage(
  input: SessionMessageInput
): Promise<SessionMessageResult> {
  const { sessionId, userId, userName, content } = input;

  // Get session and stage progress
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      stageProgress: {
        where: { userId },
        orderBy: { stage: 'desc' },
        take: 1,
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Determine current stage (default to 1 if no progress)
  let currentStage = session.stageProgress[0]?.stage ?? 0;

  // Auto-advance from Stage 0 to Stage 1 if compact is signed
  if (currentStage === 0) {
    const gates = session.stageProgress[0]?.gatesSatisfied as Record<string, unknown> | null;
    if (gates?.compactSigned) {
      // Complete Stage 0 and create Stage 1
      const now = new Date();
      if (session.stageProgress[0]) {
        await prisma.stageProgress.update({
          where: { id: session.stageProgress[0].id },
          data: { status: 'COMPLETED', completedAt: now },
        });
      }
      await prisma.stageProgress.create({
        data: {
          sessionId,
          userId,
          stage: 1,
          status: 'IN_PROGRESS',
          startedAt: now,
          gatesSatisfied: {},
        },
      });
      currentStage = 1;
    } else {
      // Default to Stage 1 for new sessions even without compact
      // (compact can be signed later)
      currentStage = 1;
    }
  }

  // Save user message
  const userMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: userId,
      role: 'USER',
      content,
      stage: currentStage,
    },
  });

  // Embed user message for cross-session retrieval (non-blocking)
  embedMessage(userMessage.id).catch((err) =>
    console.warn('[SessionProcessor] Failed to embed user message:', err)
  );

  // Get conversation history
  const history = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [{ senderId: userId }, { role: 'AI', senderId: null }],
    },
    orderBy: { timestamp: 'asc' },
    take: 20,
  });

  const userTurnCount = history.filter((m) => m.role === 'USER').length;

  // Detect stage transition: check if this is the first message in the current stage
  // A stage transition is detected when:
  // 1. There are previous messages in the session (not first message ever)
  // 2. No previous messages exist at the current stage for this user
  const previousStageMessages = history.filter(
    (m) => m.stage === currentStage && m.senderId === userId
  );
  const isStageTransition = history.length > 0 && previousStageMessages.length === 0;

  // If it's a stage transition, determine the previous stage
  let previousStage: number | undefined;
  if (isStageTransition && history.length > 0) {
    // Get the highest stage from previous messages
    const previousStages = history
      .filter((m) => m.stage !== currentStage)
      .map((m) => m.stage);
    if (previousStages.length > 0) {
      previousStage = Math.max(...previousStages);
    }
  }

  // Get partner name for context
  const partnerId = await getPartnerUserId(sessionId, userId);
  let partnerName: string | undefined;
  if (partnerId) {
    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
      select: { name: true, firstName: true },
    });
    partnerName = partner?.firstName || partner?.name || undefined;
  } else {
    // No partner yet - get nickname from relationship member
    const member = await prisma.relationshipMember.findFirst({
      where: {
        relationship: { sessions: { some: { id: sessionId } } },
        userId,
      },
      select: { nickname: true },
    });
    partnerName = member?.nickname || undefined;
  }

  // Calculate session duration
  const sessionDurationMinutes = Math.floor(
    (Date.now() - session.createdAt.getTime()) / 60000
  );

  // Determine if we're in invitation phase
  // Invitation phase: Stage 0 (or 1 if auto-advanced), session CREATED, invitation message not confirmed
  const invitation = session.invitations[0];
  const isInvitationPhase =
    session.status === 'CREATED' &&
    (!invitation?.messageConfirmed);

  // Build AI context
  const aiContext: FullAIContext = {
    sessionId,
    userId,
    userName,
    partnerName,
    stage: currentStage,
    turnCount: userTurnCount,
    emotionalIntensity: 5, // TODO: Get from emotional barometer
    sessionDurationMinutes,
    isFirstTurnInSession: userTurnCount === 1,
    isInvitationPhase,
    isStageTransition,
    previousStage,
  };

  if (isStageTransition) {
    console.log(
      `[SessionProcessor] Stage transition detected: ${previousStage ?? 'unknown'} → ${currentStage}`
    );
  }

  // Get AI response
  const orchestratorResult = await getOrchestratedResponse(
    history.map((m) => ({
      role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
    aiContext
  );

  console.log(
    `[SessionProcessor] Stage ${currentStage}, intent=${orchestratorResult.memoryIntent.intent}, mock=${orchestratorResult.usedMock}`
  );

  // Save AI response
  const aiMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: null,
      role: 'AI',
      content: orchestratorResult.response,
      stage: currentStage,
    },
  });

  // Embed AI message for cross-session retrieval (non-blocking)
  embedMessage(aiMessage.id).catch((err) =>
    console.warn('[SessionProcessor] Failed to embed AI message:', err)
  );

  return {
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
    offerFeelHeardCheck: orchestratorResult.offerFeelHeardCheck,
    invitationMessage: orchestratorResult.invitationMessage,
  };
}
