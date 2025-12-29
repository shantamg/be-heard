/**
 * Session Switch Handler
 *
 * Handles SWITCH_SESSION intent - switches to an existing session.
 */

import { ChatIntent } from '@be-heard/shared';
import { prisma } from '../../../lib/prisma';
import { mapSessionToSummary } from '../../../utils/session';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';
import { generateConversationalResponse } from '../response-generator';

// Get access to the creation state management
import { startPendingCreation } from './session-creation';

/**
 * Session Switch Handler
 * Switches to an existing session by ID or partner name
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
        const name = partner?.nickname || partner?.user.firstName || partner?.user.name || '';
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
      // This clears any previous pending state (e.g., if user was creating session with Jason
      // but now wants to start one with Tara instead)
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
    const partnerName =
      partner?.nickname || partner?.user.firstName || partner?.user.name || 'your partner';

    const summary = mapSessionToSummary(session, userId);

    console.log('[SessionSwitch] Switching to session:', session.id, 'with', partnerName);

    const responseMessage = await generateConversationalResponse({
      action: 'session_switched',
      context: {
        personName: partnerName,
        sessionStatus: session.status,
      },
    });

    return {
      actionType: 'SWITCH_SESSION',
      message: responseMessage || `Switching to your session with ${partnerName}.`,
      sessionChange: {
        type: 'switched',
        sessionId: session.id,
        session: summary,
      },
      // Also pass through to load session messages
      passThrough: {
        sessionId: session.id,
      },
    };
  },
};
