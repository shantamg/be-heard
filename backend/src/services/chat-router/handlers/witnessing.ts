/**
 * Witnessing Handler
 *
 * Handles pre-session conversations with Stage 1-style witnessing.
 * This is the primary handler for users who don't have an active session,
 * providing empathetic listening while gently detecting when they might
 * want to start a session with someone specific.
 *
 * Supports:
 * - Inner Work: Solo reflection not tied to a specific person
 * - Pre-session venting: Processing feelings before creating a session
 * - Soft session suggestions: Offering to create sessions without forcing
 */

import { ChatIntent } from '@meet-without-fear/shared';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';
import {
  getWitnessingResponse,
  storePreSessionMessage,
  getPreSessionState,
} from '../../witnessing';

/**
 * Witnessing Handler
 *
 * Priority: 40 (below session creation/switch, above help fallback)
 * This handles UNKNOWN and CONTINUE_CONVERSATION intents when there's no active session.
 */
export const witnessingHandler: IntentHandler = {
  id: 'witnessing',
  name: 'Pre-Session Witnessing',
  supportedIntents: [ChatIntent.UNKNOWN, ChatIntent.CONTINUE_CONVERSATION],
  priority: 40, // Below session handlers (100, 90, 80), above help (10)

  canHandle(context: IntentHandlerContext): boolean {
    // Handle when:
    // 1. No active session
    // 2. Intent is UNKNOWN or CONTINUE_CONVERSATION
    // 3. Not already in a pending creation flow
    const hasActiveSession = !!context.activeSession;
    const isWitnessableIntent =
      context.intent.intent === ChatIntent.UNKNOWN ||
      context.intent.intent === ChatIntent.CONTINUE_CONVERSATION;

    return !hasActiveSession && isWitnessableIntent;
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    const { userId, message, req } = context;
    const userName = req.user?.name || req.user?.firstName || 'there';

    try {
      // Get witnessing response with person detection
      const witnessingResult = await getWitnessingResponse(userId, userName, message);

      // Store messages for potential session association
      await Promise.all([
        storePreSessionMessage(userId, 'USER', message, {
          emotionalTone: witnessingResult.emotionalTone,
          extractedPerson: witnessingResult.personMention?.name,
          extractedTopic: witnessingResult.topic,
        }),
        storePreSessionMessage(userId, 'AI', witnessingResult.response),
      ]);

      // Build response with optional session suggestion
      let responseMessage = witnessingResult.response;
      const actions: IntentHandlerResult['actions'] = [];

      // If we should suggest a session, add a gentle prompt
      if (witnessingResult.suggestSession && witnessingResult.personMention) {
        const personName = witnessingResult.personMention.name;

        // Add a soft suggestion - don't interrupt the flow
        responseMessage += `\n\nIf you'd like, I can help you start a session to work through things with ${personName}. But there's no rush - we can also just keep talking here.`;

        actions.push({
          id: 'start-session-with-person',
          label: `Start session with ${personName}`,
          type: 'select',
          payload: { personName },
        });
        actions.push({
          id: 'continue-reflecting',
          label: 'Keep talking',
          type: 'select',
        });
      }

      // Get state for metadata
      const state = getPreSessionState(userId);

      return {
        actionType: 'WITNESSING',
        message: responseMessage,
        actions: actions.length > 0 ? actions : undefined,
        data: {
          turnCount: state.turnCount,
          personMention: witnessingResult.personMention,
          emotionalTone: witnessingResult.emotionalTone,
          topic: witnessingResult.topic,
          mode: 'inner_work', // or 'pre_session' if person mentioned
        },
      };
    } catch (error) {
      console.error('[WitnessingHandler] Error:', error);

      // Fallback to simple acknowledgment
      return {
        actionType: 'WITNESSING',
        message: `Thank you for sharing that. I'm here to listen. What else is on your mind?`,
      };
    }
  },

  cleanup(userId: string): void {
    // Note: We don't clear pre-session state here because we want to preserve
    // messages for potential session association. State is cleared when:
    // 1. A session is created/switched to
    // 2. Messages expire (24 hours)
  },
};

/**
 * Check if a user is in witnessing mode (has pre-session state)
 */
export function isInWitnessingMode(userId: string): boolean {
  const state = getPreSessionState(userId);
  return state.turnCount > 0;
}

/**
 * Get the last person mentioned in witnessing mode
 */
export function getLastPersonMention(
  userId: string
): { name: string; relationship?: string } | undefined {
  const state = getPreSessionState(userId);
  return state.lastPersonMention;
}
