/**
 * Session Creation Handler
 *
 * Handles the CREATE_SESSION intent with multi-turn info gathering.
 * Allows users to start sessions by naturally mentioning a person.
 */

import { ChatIntent, SessionCreationState, SessionSummaryDTO } from '@be-heard/shared';
import { prisma } from '../../../lib/prisma';
import { mapSessionToSummary } from '../../../utils/session';
import {
  IntentHandler,
  IntentHandlerContext,
  IntentHandlerResult,
  createStateStore,
} from '../types';
import { generateConversationalResponse } from '../response-generator';
import { embedSessionVessel, embedMessages } from '../../embedding';

// State store for multi-turn session creation
const creationState = createStateStore<SessionCreationState>();

/**
 * Session Creation Intent Handler
 */
export const sessionCreationHandler: IntentHandler = {
  id: 'session-creation',
  name: 'Session Creation',
  supportedIntents: [ChatIntent.CREATE_SESSION],
  priority: 100,

  canHandle(context: IntentHandlerContext): boolean {
    // Always handle CREATE_SESSION intent
    // Also handle if we have pending creation state
    return (
      context.intent.intent === ChatIntent.CREATE_SESSION ||
      creationState.has(context.userId)
    );
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    const { userId, intent, message } = context;

    // Get or create state
    let state = creationState.get(userId);
    if (!state) {
      console.log('[SessionCreation] Creating new state for user:', userId);
      state = {
        step: 'GATHERING_PERSON',
        person: {},
        confirmedByUser: false,
        conversationHistory: [],
      };
      creationState.set(userId, state);
    } else {
      console.log('[SessionCreation] Existing state:', {
        step: state.step,
        person: state.person,
        historyLength: state.conversationHistory?.length || 0,
      });
    }

    // Capture user message in conversation history
    const history = state.conversationHistory || [];
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });
    state = creationState.update(userId, { conversationHistory: history });
    console.log('[SessionCreation] Added user message, history length:', history.length);

    // Update with newly extracted info
    if (intent.person) {
      state = creationState.update(userId, {
        person: {
          firstName: intent.person.firstName || state.person.firstName,
          lastName: intent.person.lastName || state.person.lastName,
          contactInfo: intent.person.contactInfo || state.person.contactInfo,
        },
      });
    }

    if (intent.sessionContext) {
      state = creationState.update(userId, { context: intent.sessionContext });
    }

    // Check if we have enough info to create
    if (canCreate(state)) {
      return await createSession(userId, state);
    }

    // Need more info - also capture the assistant response
    const result = askForMissingInfo(userId, state, intent);

    // Add assistant response to history
    const updatedHistory = creationState.get(userId)?.conversationHistory || [];
    updatedHistory.push({
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    });
    creationState.update(userId, { conversationHistory: updatedHistory });

    return result;
  },

  cleanup(userId: string): void {
    creationState.delete(userId);
  },
};

// ============================================================================
// Helpers
// ============================================================================

function canCreate(state: SessionCreationState): boolean {
  return Boolean(
    state.person.firstName &&
      state.person.contactInfo?.value &&
      (state.person.contactInfo.type === 'email' ||
        state.person.contactInfo.type === 'phone')
  );
}

function askForMissingInfo(
  userId: string,
  state: SessionCreationState,
  intent: IntentHandlerContext['intent']
): IntentHandlerResult {
  let message: string;

  if (!state.person.firstName) {
    message = "Who would you like to start a session with?";
    creationState.update(userId, { step: 'GATHERING_PERSON' });
  } else if (!state.person.contactInfo?.value) {
    // Offer both email and phone - be direct about getting contact info
    message = `Great! What's ${state.person.firstName}'s email or phone number? I'll send them an invitation to join.`;
    creationState.update(userId, { step: 'GATHERING_CONTACT' });
  } else {
    message = "I'm ready to create the session.";
  }

  // Use AI's follow-up question if available, otherwise use our direct prompt
  const finalMessage = intent.followUpQuestion || message;

  return {
    actionType: 'NEED_MORE_INFO',
    message: finalMessage,
    data: {
      missingFields: !state.person.firstName
        ? ['firstName']
        : !state.person.contactInfo?.value
          ? ['contact']
          : [],
      partialPerson: state.person,
    },
    actions: [
      {
        id: 'cancel-creation',
        label: 'Cancel',
        type: 'cancel',
      },
    ],
  };
}

async function createSession(
  userId: string,
  state: SessionCreationState
): Promise<IntentHandlerResult> {
  const { person, context, conversationHistory } = state;

  console.log('[SessionCreation] Creating session:', {
    person,
    context,
    conversationHistoryLength: conversationHistory?.length || 0,
  });

  if (!person.firstName || !person.contactInfo?.value) {
    throw new Error('Missing required person info');
  }

  try {
    // Create relationship
    const relationship = await prisma.relationship.create({
      data: {
        members: {
          create: [
            {
              userId,
              nickname:
                person.firstName + (person.lastName ? ` ${person.lastName}` : ''),
            },
          ],
        },
      },
      include: {
        members: { include: { user: true } },
      },
    });

    // Create session with user vessel and stage progress
    const session = await prisma.session.create({
      data: {
        relationshipId: relationship.id,
        status: 'INVITED',
        userVessels: {
          create: [{ userId }],
        },
        stageProgress: {
          create: [{ userId, stage: 0, status: 'NOT_STARTED' }],
        },
      },
      include: {
        relationship: {
          include: {
            members: { include: { user: true } },
          },
        },
        userVessels: true,
        stageProgress: true,
      },
    });

    // Create invitation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.invitation.create({
      data: {
        sessionId: session.id,
        invitedById: userId,
        email:
          person.contactInfo.type === 'email' ? person.contactInfo.value : undefined,
        phone:
          person.contactInfo.type === 'phone' ? person.contactInfo.value : undefined,
        name: person.firstName + (person.lastName ? ` ${person.lastName}` : ''),
        expiresAt,
      },
    });

    // Store context if provided
    if (context?.topic) {
      const vessel = session.userVessels.find((v) => v.userId === userId);
      if (vessel) {
        await prisma.userDocument.create({
          data: {
            vesselId: vessel.id,
            title: 'Initial Context',
            type: 'INITIAL_CONTEXT',
            content: context.topic,
          },
        });
      }
    }

    // Save conversation history as messages in the session
    let messageIds: string[] = [];
    if (conversationHistory && conversationHistory.length > 0) {
      console.log('[SessionCreation] Saving conversation history:', conversationHistory.length, 'messages');
      // Create messages and get their IDs
      const messages = await Promise.all(
        conversationHistory.map(async (msg, index) => {
          return prisma.message.create({
            data: {
              sessionId: session.id,
              senderId: msg.role === 'user' ? userId : null,
              role: msg.role === 'user' ? 'USER' : 'AI',
              content: msg.content,
              stage: 0,
              timestamp: new Date(msg.timestamp),
            },
          });
        })
      );
      messageIds = messages.map((m) => m.id);
      console.log('[SessionCreation] Saved messages:', messageIds);
    } else {
      console.log('[SessionCreation] No conversation history to save');
    }

    // Generate embeddings for the session and messages (non-blocking)
    const vesselToEmbed = session.userVessels.find((v) => v.userId === userId);
    if (vesselToEmbed) {
      // Run embedding generation in background - don't block session creation
      embedSessionVessel(session.id, userId).catch((err) =>
        console.warn('[SessionCreation] Failed to embed session vessel:', err)
      );
      if (messageIds.length > 0) {
        embedMessages(messageIds).catch((err) =>
          console.warn('[SessionCreation] Failed to embed messages:', err)
        );
      }
    }

    // Clear creation state
    creationState.delete(userId);

    const summary = mapSessionToSummary(session, userId);
    const invitationUrl = `${process.env.APP_URL || 'https://beheard.app'}/invite/${invitation.id}`;

    const message = await generateConversationalResponse({
      action: 'session_created',
      context: {
        personName: person.firstName,
        contactValue: person.contactInfo.value,
        contactType: person.contactInfo.type,
      },
    });

    return {
      actionType: 'CREATE_SESSION',
      message,
      sessionChange: {
        type: 'created',
        sessionId: session.id,
        session: summary,
      },
      data: {
        invitationId: invitation.id,
        invitationUrl,
      },
    };
  } catch (error) {
    console.error('[SessionCreation] Failed to create session:', error);
    creationState.delete(userId);

    return {
      actionType: 'ERROR',
      message:
        "I had trouble creating that session. Let's try again - who would you like to talk to?",
    };
  }
}

/**
 * Cancel pending creation for a user
 */
export function cancelCreation(userId: string): void {
  creationState.delete(userId);
}

/**
 * Check if user has pending creation
 */
export function hasPendingCreation(userId: string): boolean {
  return creationState.has(userId);
}

/**
 * Get pending creation state
 */
export function getPendingCreation(userId: string): SessionCreationState | undefined {
  return creationState.get(userId);
}

/**
 * Start a pending creation for a specific person
 * Used when switching to a session that doesn't exist yet
 */
export function startPendingCreation(userId: string, personFirstName: string): void {
  // Clear any existing state first
  creationState.delete(userId);
  // Set up new state for this person
  creationState.set(userId, {
    step: 'GATHERING_CONTACT',
    person: {
      firstName: personFirstName,
    },
    confirmedByUser: false,
    conversationHistory: [],
  });
  console.log('[SessionCreation] Started pending creation for:', personFirstName);
}
