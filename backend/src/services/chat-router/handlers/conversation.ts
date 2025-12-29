/**
 * Conversation Handler
 *
 * Handles CONTINUE_CONVERSATION intent - passes messages through
 * to the session's regular message handler.
 */

import { ChatIntent } from '@be-heard/shared';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';

/**
 * Conversation Continuation Handler
 * Passes messages through to session message handler
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

    return {
      actionType: 'CONTINUE_CONVERSATION',
      message: '', // Will be filled by session handler
      passThrough: {
        sessionId: context.activeSession.id,
      },
    };
  },
};
