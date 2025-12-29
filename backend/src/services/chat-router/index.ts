/**
 * Chat Router Service
 *
 * Main entry point for the extensible chat router system.
 * Uses Haiku for fast intent detection and routes to appropriate handlers.
 */

import { ChatIntent, UnifiedChatMessage, SendUnifiedChatResponse } from '@meet-without-fear/shared';
import { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { mapSessionToSummary } from '../../utils/session';
import { handlerRegistry } from './registry';
import { detectIntent, SessionInfo, SemanticMatch } from './intent-detector';
import { registerBuiltInHandlers, hasPendingCreation, getPendingCreation } from './handlers';
import { IntentHandlerContext } from './types';
import { findRelevantSessions } from '../embedding';
import { getModelCompletion } from '../../lib/bedrock';

// Export types and registry for external use
export * from './types';
export { handlerRegistry, registerHandler, registerPlugin } from './registry';
export { detectIntent } from './intent-detector';
export { generateConversationalResponse } from './response-generator';
export { registerBuiltInHandlers } from './handlers';

// ============================================================================
// Initialize Router
// ============================================================================

let initialized = false;

/**
 * Initialize the chat router (call once at startup)
 */
export function initializeChatRouter(): void {
  if (initialized) return;

  registerBuiltInHandlers();
  initialized = true;

  console.log('[ChatRouter] Initialized with handlers:',
    handlerRegistry.getAllHandlers().map(h => h.name).join(', ')
  );
}

// ============================================================================
// Process Message
// ============================================================================

export interface ProcessMessageInput {
  userId: string;
  content: string;
  currentSessionId?: string;
  req: Request;
}

export interface ProcessMessageResult {
  userMessage: UnifiedChatMessage;
  assistantResponse: UnifiedChatMessage;
  sessionChange?: SendUnifiedChatResponse['sessionChange'];
  passThrough?: SendUnifiedChatResponse['passThrough'];
}

/**
 * Process a message through the chat router
 */
export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { userId, content, currentSessionId, req } = input;

  // Ensure initialized
  if (!initialized) {
    initializeChatRouter();
  }

  // Get current context
  let activeSession: IntentHandlerContext['activeSession'];
  if (currentSessionId) {
    const session = await prisma.session.findFirst({
      where: {
        id: currentSessionId,
        relationship: {
          members: { some: { userId } },
        },
      },
      include: {
        relationship: {
          include: {
            members: { include: { user: true } },
          },
        },
      },
    });

    if (session) {
      const partner = session.relationship.members.find((m) => m.userId !== userId);
      activeSession = {
        id: session.id,
        partnerName:
          partner?.nickname || partner?.user.firstName || partner?.user.name || undefined,
      };
    }
  }

  // Check for pending state (e.g., session creation in progress)
  const pendingCreation = getPendingCreation(userId);
  const pendingState = pendingCreation
    ? { type: 'session_creation', data: pendingCreation }
    : undefined;

  // Fetch user's sessions for context-aware intent detection
  const userSessionsData = await prisma.session.findMany({
    where: {
      relationship: {
        members: { some: { userId } },
      },
      status: { notIn: ['ABANDONED', 'RESOLVED'] },
    },
    include: {
      relationship: {
        include: {
          members: { include: { user: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10, // Limit to recent sessions for context
  });

  // Map to SessionInfo format for intent detection
  const userSessions: SessionInfo[] = userSessionsData.map((session) => {
    const partner = session.relationship.members.find((m) => m.userId !== userId);
    const myMember = session.relationship.members.find((m) => m.userId === userId);
    // Partner name: use partner's actual name if they've joined,
    // otherwise use the nickname I gave them when creating the session
    const partnerName =
      partner?.user.firstName ||
      partner?.user.name ||
      partner?.nickname ||
      myMember?.nickname ||
      'Unknown';
    return {
      id: session.id,
      partnerName,
      status: session.status,
      lastActivity: session.updatedAt.toISOString(),
    };
  });

  // Get semantic matches from vector search (if embeddings available)
  let semanticMatches: SemanticMatch[] = [];
  try {
    const vectorResults = await findRelevantSessions(userId, content);
    semanticMatches = vectorResults.map((r) => ({
      sessionId: r.sessionId,
      partnerName: r.partnerName,
      similarity: r.similarity,
    }));
    if (semanticMatches.length > 0) {
      console.log('[ChatRouter] Semantic matches:', semanticMatches);
    }
  } catch (error) {
    // Vector search failed - continue without it
    console.warn('[ChatRouter] Vector search failed:', error);
  }

  // Detect intent with session context and semantic matches
  console.log('[ChatRouter] Detecting intent for:', {
    message: content.slice(0, 50),
    hasActiveSession: !!activeSession,
    sessionCount: userSessions.length,
    semanticMatchCount: semanticMatches.length,
    hasPendingState: !!pendingState,
  });

  const intent = await detectIntent({
    message: content,
    hasActiveSession: !!activeSession,
    activeSessionPartnerName: activeSession?.partnerName,
    userSessions,
    semanticMatches,
    pendingState,
  });

  console.log('[ChatRouter] Intent detected:', {
    intent: intent.intent,
    confidence: intent.confidence,
    sessionId: intent.sessionId,
    person: intent.person,
  });

  // Create user message
  const userMessage: UnifiedChatMessage = {
    id: `msg_${Date.now()}_user`,
    type: pendingCreation ? 'router' : activeSession ? 'session' : 'router',
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
    sessionId: activeSession?.id,
  };

  // Build handler context
  const handlerContext: IntentHandlerContext = {
    userId,
    message: content,
    intent,
    activeSession,
    req,
  };

  // Find and execute handler
  const handlers = handlerRegistry.getHandlers(intent.intent);

  for (const handler of handlers) {
    const canHandle = await handler.canHandle(handlerContext);
    if (canHandle) {
      const result = await handler.handle(handlerContext);

      // Build assistant response
      const assistantResponse: UnifiedChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        type: result.passThrough ? 'session' : 'router',
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
        sessionId: result.passThrough?.sessionId || result.sessionChange?.sessionId,
        actions: result.actions,
      };

      return {
        userMessage,
        assistantResponse,
        sessionChange: result.sessionChange,
        passThrough: result.passThrough
          ? {
              sessionId: result.passThrough.sessionId,
              userMessage: userMessage as unknown as import('@meet-without-fear/shared').MessageDTO,
              aiResponse: assistantResponse as unknown as import('@meet-without-fear/shared').MessageDTO,
            }
          : undefined,
      };
    }
  }

  // No handler found - use fallback
  const assistantResponse: UnifiedChatMessage = {
    id: `msg_${Date.now()}_assistant`,
    type: 'router',
    role: 'assistant',
    content:
      intent.followUpQuestion ||
      "I'm here to help. Tell me who you'd like to work things out with, or ask for help to learn more.",
    timestamp: new Date().toISOString(),
  };

  return {
    userMessage,
    assistantResponse,
  };
}

// ============================================================================
// Context Helpers
// ============================================================================

/**
 * Get chat context for a user
 */
export async function getChatContext(userId: string) {
  const sessions = await prisma.session.findMany({
    where: {
      relationship: {
        members: { some: { userId } },
      },
      status: { notIn: ['ABANDONED', 'RESOLVED'] },
    },
    include: {
      relationship: {
        include: {
          members: { include: { user: true } },
        },
      },
      stageProgress: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  const summaries = sessions.map((s) => mapSessionToSummary(s, userId));
  const pendingCreation = getPendingCreation(userId);

  // Generate personalized welcome message based on context
  const welcomeMessage = await generateWelcomeMessage(userId, sessions);

  return {
    activeSessions: summaries,
    hasPendingCreation: !!pendingCreation,
    pendingCreationStep: pendingCreation?.step,
    welcomeMessage,
  };
}

// ============================================================================
// Welcome Message Generation
// ============================================================================

/**
 * Generate a personalized welcome message based on user's recent activity.
 * Uses Haiku for fast generation.
 */
async function generateWelcomeMessage(
  userId: string,
  sessions: Array<{
    id: string;
    status: string;
    updatedAt: Date;
    stageProgress: Array<{ stage: number }>;
    relationship: {
      members: Array<{
        userId: string;
        nickname: string | null;
        user: { firstName: string | null; name: string | null };
      }>;
    };
  }>
): Promise<string | undefined> {
  // If no sessions, return undefined (will use default message)
  if (sessions.length === 0) {
    return undefined;
  }

  // Get the most recent session for context
  const recentSession = sessions[0];
  const partner = recentSession.relationship.members.find((m) => m.userId !== userId);
  const partnerName =
    partner?.user.firstName || partner?.user.name || partner?.nickname || 'your partner';

  // Get the current stage from stageProgress (highest stage number)
  const currentStage = recentSession.stageProgress.length > 0
    ? Math.max(...recentSession.stageProgress.map((sp) => sp.stage))
    : 0;

  // Format the session info for the prompt
  const sessionContext = {
    partnerName,
    stage: currentStage,
    status: recentSession.status,
    lastActivity: recentSession.updatedAt.toISOString(),
  };

  // Build prompt for Haiku
  const systemPrompt = `You are a warm, supportive AI assistant for Meet Without Fear, an app that helps people navigate difficult conversations.
Generate a brief, personalized welcome message (1-2 sentences max) that acknowledges the user's recent session.

Guidelines:
- Be warm but not overly effusive
- Reference their most recent session naturally
- Encourage them without pressure
- Keep it short and conversational
- Don't use emojis
- Don't say "Welcome back" - just reference what they were working on

Examples of good messages:
- "Last time, you were working through things with Sarah. Ready to continue when you are."
- "You've been making progress with your conversation about John. Pick up where you left off whenever you're ready."`;

  const userMessage = `Generate a welcome message for a user whose most recent session:
- Partner name: ${sessionContext.partnerName}
- Current stage: ${sessionContext.stage || 'just started'}
- Status: ${sessionContext.status}
- Last active: ${new Date(sessionContext.lastActivity).toLocaleDateString()}

Just output the welcome message, nothing else.`;

  try {
    const response = await getModelCompletion('haiku', {
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 100,
    });

    return response?.trim() || undefined;
  } catch (error) {
    console.error('[ChatRouter] Failed to generate welcome message:', error);
    return undefined;
  }
}

/**
 * Cancel any pending creation for a user
 */
export function cancelPendingCreation(userId: string): void {
  const handlers = handlerRegistry.getAllHandlers();
  for (const handler of handlers) {
    if (handler.cleanup) {
      handler.cleanup(userId);
    }
  }
}
