/**
 * Conversation Handler
 *
 * Handles CONTINUE_CONVERSATION intent - processes messages within
 * the active session, getting AI responses and saving to database.
 */

import { ChatIntent } from '@meet-without-fear/shared';
import { prisma } from '../../../lib/prisma';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';
import { processSessionMessage } from '../session-processor';

/**
 * Conversation Continuation Handler
 * Processes messages within active session
 */
export const conversationHandler: IntentHandler = {
  id: 'conversation',
  name: 'Conversation Continuation',
  supportedIntents: [ChatIntent.CONTINUE_CONVERSATION],
  priority: 50,

  canHandle(context: IntentHandlerContext): boolean {
    // Only handle if there's an active session
    return !!context.activeSession;
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    if (!context.activeSession) {
      return {
        actionType: 'FALLBACK',
        message:
          "I don't see an active session. Would you like to start one or see your existing sessions?",
        actions: [
          { id: 'start-session', label: 'Start a session', type: 'select' },
          { id: 'list-sessions', label: 'See my sessions', type: 'select' },
        ],
      };
    }

    // Get user info for AI context
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { name: true, firstName: true },
    });
    const userName = user?.firstName || user?.name || 'there';

    // Process message in session
    const result = await processSessionMessage({
      sessionId: context.activeSession.id,
      userId: context.userId,
      userName,
      content: context.message,
    });

    return {
      actionType: 'CONTINUE_CONVERSATION',
      message: result.aiResponse.content,
      passThrough: {
        sessionId: context.activeSession.id,
        userMessage: result.userMessage,
        aiResponse: result.aiResponse,
      },
    };
  },
};
