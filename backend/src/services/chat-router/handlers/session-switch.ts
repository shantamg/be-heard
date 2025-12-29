/**
 * Session Switch Handler
 *
 * Handles SWITCH_SESSION intent - switches to an existing session
 * and processes the message within that session's context.
 */

import { ChatIntent } from '@meet-without-fear/shared';
import { prisma } from '../../../lib/prisma';
import { mapSessionToSummary } from '../../../utils/session';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';
import { convertPreSessionToSessionMessages } from '../../witnessing';
import { processSessionMessage } from '../session-processor';

// Get access to the creation state management
import { startPendingCreation } from './session-creation';

/**
 * Session Switch Handler
 * Switches to an existing session and processes the message there
 */
export const sessionSwitchHandler: IntentHandler = {
  id: 'session-switch',
  name: 'Session Switch',
  supportedIntents: [ChatIntent.SWITCH_SESSION],
  priority: 90,

  canHandle(context: IntentHandlerContext): boolean {
    // Handle if we have a session ID or person name to switch to
    return !!(context.intent.sessionId || context.intent.person?.firstName);
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    const { userId, intent, message } = context;

    console.log('[SessionSwitch] Handling switch:', {
      intentSessionId: intent.sessionId,
      person: intent.person,
    });

    // Try to find the session
    let session = null;

    // First try by session ID from intent
    if (intent.sessionId) {
      session = await prisma.session.findFirst({
        where: {
          id: intent.sessionId,
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
          stageProgress: true,
          userVessels: true,
        },
      });
    }

    // If not found by ID, try by partner name
    if (!session && intent.person?.firstName) {
      const partnerName = intent.person.firstName.toLowerCase();
      console.log('[SessionSwitch] Searching by partner name:', partnerName);

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
          userVessels: true,
        },
      });

      // Find session where partner name matches
      session = sessions.find((s) => {
        const partner = s.relationship.members.find((m) => m.userId !== userId);
        const myMember = s.relationship.members.find((m) => m.userId === userId);
        // Partner name: partner's actual name if joined, or the nickname I gave them
        const name =
          partner?.user.firstName ||
          partner?.user.name ||
          partner?.nickname ||
          myMember?.nickname ||
          '';
        return name.toLowerCase().includes(partnerName);
      });

      if (session) {
        console.log('[SessionSwitch] Found session by name:', session.id);
      }
    }

    if (!session) {
      console.log('[SessionSwitch] No session found');
      // No session found - offer to create one
      const personName = intent.person?.firstName || 'that person';

      // Set up pending creation state for this person
      if (intent.person?.firstName) {
        startPendingCreation(userId, intent.person.firstName);
      }

      return {
        actionType: 'NOT_FOUND',
        message: `I don't see an existing session with ${personName}. Would you like to start one?`,
        actions: [
          {
            id: 'create-session',
            label: `Start session with ${personName}`,
            type: 'select',
          },
          {
            id: 'list-sessions',
            label: 'See my sessions',
            type: 'select',
          },
        ],
      };
    }

    // Found the session - switch to it
    const partner = session.relationship.members.find((m) => m.userId !== userId);
    const myMember = session.relationship.members.find((m) => m.userId === userId);
    const partnerName =
      partner?.user.firstName ||
      partner?.user.name ||
      partner?.nickname ||
      myMember?.nickname ||
      'your partner';

    const summary = mapSessionToSummary(session, userId);

    console.log('[SessionSwitch] Switching to session:', session.id, 'with', partnerName);

    // Convert any pre-session messages to session messages
    try {
      const preSessionCount = await convertPreSessionToSessionMessages(userId, session.id);
      if (preSessionCount > 0) {
        console.log('[SessionSwitch] Converted pre-session messages:', preSessionCount);
      }
    } catch (err) {
      console.warn('[SessionSwitch] Failed to convert pre-session messages:', err);
    }

    // Get user info for AI context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true },
    });
    const userName = user?.firstName || user?.name || 'there';

    // Process the message in the session - the original message that triggered
    // the switch should be treated as a message IN that session
    const result = await processSessionMessage({
      sessionId: session.id,
      userId,
      userName,
      content: message,
    });

    console.log('[SessionSwitch] Processed message in session, AI responded');

    return {
      actionType: 'SWITCH_SESSION',
      message: result.aiResponse.content,
      sessionChange: {
        type: 'switched',
        sessionId: session.id,
        session: summary,
      },
      passThrough: {
        sessionId: session.id,
        userMessage: result.userMessage,
        aiResponse: result.aiResponse,
      },
    };
  },
};
