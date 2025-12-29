/**
 * Help Handler
 *
 * Handles HELP and UNKNOWN intents.
 * Provides guidance on how to use Meet Without Fear.
 */

import { ChatIntent } from '@meet-without-fear/shared';
import { IntentHandler, IntentHandlerContext, IntentHandlerResult } from '../types';

/**
 * Help Handler
 */
export const helpHandler: IntentHandler = {
  id: 'help',
  name: 'Help & Guidance',
  supportedIntents: [ChatIntent.HELP, ChatIntent.UNKNOWN],
  priority: 10, // Low priority - catch-all

  canHandle(): boolean {
    return true;
  },

  async handle(context: IntentHandlerContext): Promise<IntentHandlerResult> {
    const { intent, activeSession } = context;

    if (intent.intent === ChatIntent.HELP) {
      return {
        actionType: 'HELP',
        message: getHelpMessage(!!activeSession),
        actions: [
          { id: 'start-session', label: 'Start a session', type: 'select' },
          { id: 'list-sessions', label: 'See my sessions', type: 'select' },
        ],
      };
    }

    // UNKNOWN intent - provide helpful fallback
    if (activeSession) {
      // If in a session, maybe they're just chatting
      return {
        actionType: 'CONTINUE_CONVERSATION',
        message: '',
        passThrough: { sessionId: activeSession.id },
      };
    }

    return {
      actionType: 'FALLBACK',
      message: intent.followUpQuestion || getFallbackMessage(),
      actions: [
        { id: 'start-session', label: 'Start a session', type: 'select' },
        { id: 'get-help', label: 'How does this work?', type: 'select' },
      ],
    };
  },
};

function getHelpMessage(hasActiveSession: boolean): string {
  if (hasActiveSession) {
    return `Meet Without Fear helps you have difficult conversations in a healthy way. Here's how it works:

In your current session, you can:
• Share how you're feeling - I'll listen and help you feel heard
• Work through understanding your partner's perspective
• Discover what you both truly need
• Find solutions that work for everyone

Just share what's on your mind, and I'll guide you through the process.`;
  }

  return `I'm here to help you work through difficult conversations. Here's how Meet Without Fear works:

1. **Start a session** - Tell me who you'd like to talk to (e.g., "I need to talk to my partner John")
2. **Feel heard** - Share your feelings privately with me first
3. **Build empathy** - Understand each other's perspectives
4. **Find solutions** - Discover what you both need and create agreements

To get started, just tell me who you'd like to work things out with.`;
}

function getFallbackMessage(): string {
  return "I'm here to help you work through difficult conversations. You can start a session with someone by telling me their name, or ask for help to learn more about how Meet Without Fear works.";
}
