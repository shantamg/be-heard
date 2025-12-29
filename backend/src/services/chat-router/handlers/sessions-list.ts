/**
 * Sessions List Handler
 *
 * Handles LIST_SESSIONS and CHECK_STATUS intents.
 * Shows users their active sessions.
 */

import { ChatIntent, SessionSummaryDTO } from '@be-heard/shared';
import { prisma } from '../../../lib/prisma';
import { mapSessionToSummary } from '../../../utils/session';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';

/**
 * Sessions List Handler
 */
export const sessionsListHandler: IntentHandler = {
  id: 'sessions-list',
  name: 'Sessions List',
  supportedIntents: [ChatIntent.LIST_SESSIONS, ChatIntent.CHECK_STATUS],
  priority: 80,

  canHandle(): boolean {
    return true;
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    const sessions = await prisma.session.findMany({
      where: {
        relationship: {
          members: { some: { userId: context.userId } },
        },
        status: { notIn: ['ABANDONED'] },
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
      take: 10,
    });

    const summaries = sessions.map((s) => mapSessionToSummary(s, context.userId));

    if (summaries.length === 0) {
      return {
        actionType: 'LIST_SESSIONS',
        message:
          "You don't have any active sessions yet. Would you like to start one? Just tell me who you'd like to work things out with.",
        data: { sessions: [] },
        actions: [
          { id: 'start-session', label: 'Start a session', type: 'select' },
        ],
      };
    }

    if (summaries.length === 1) {
      const s = summaries[0];
      const partner = s.partner.nickname || s.partner.name || 'your partner';
      const status = formatSessionStatus(s);

      return {
        actionType: 'LIST_SESSIONS',
        message: `You have one session with ${partner}. ${status}`,
        data: { sessions: summaries },
        actions: [
          {
            id: 'continue-session',
            label: `Continue with ${partner}`,
            type: 'select',
            payload: { sessionId: s.id },
          },
          { id: 'start-new', label: 'Start a new session', type: 'select' },
        ],
      };
    }

    // Multiple sessions
    const sessionList = summaries
      .slice(0, 3)
      .map((s, i) => {
        const partner = s.partner.nickname || s.partner.name || 'someone';
        return `${i + 1}. ${partner}`;
      })
      .join('\n');

    return {
      actionType: 'LIST_SESSIONS',
      message: `You have ${summaries.length} sessions:\n${sessionList}\n\nWhich would you like to continue?`,
      data: { sessions: summaries },
      actions: summaries.slice(0, 3).map((s) => ({
        id: `session-${s.id}`,
        label: s.partner.nickname || s.partner.name || 'Session',
        type: 'select' as const,
        payload: { sessionId: s.id },
      })),
    };
  },
};

function formatSessionStatus(session: SessionSummaryDTO): string {
  const { status, myProgress, selfActionNeeded } = session;

  if (status === 'INVITED') {
    return "They haven't joined yet.";
  }

  if (status === 'RESOLVED') {
    return 'This session has been resolved.';
  }

  if (status === 'PAUSED') {
    return "This session is paused. Would you like to resume?";
  }

  if (selfActionNeeded.length > 0) {
    return 'Your turn to continue.';
  }

  if (status === 'WAITING') {
    return "Waiting for your partner to catch up.";
  }

  return `Currently on stage ${myProgress.stage + 1}.`;
}
