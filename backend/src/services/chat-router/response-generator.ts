/**
 * Response Generator
 *
 * Generates natural conversational responses for the chat router.
 * Uses templates for common cases and AI for more nuanced responses.
 */

import { getHaikuJson } from '../../lib/bedrock';

// ============================================================================
// Response Templates
// ============================================================================

const TEMPLATES: Record<string, (ctx: ResponseContext) => string> = {
  // Session creation
  session_created: (ctx) =>
    `Perfect! I've sent ${ctx.personName} an invitation at ${ctx.contactValue}. They'll receive a link to join your session. In the meantime, let's start preparing - what's been on your mind?`,

  session_creation_error: () =>
    "I had trouble creating that session. Let's try again - who would you like to talk to?",

  // Session switching
  session_switched: (ctx) =>
    `Switching to your session with ${ctx.personName}. What would you like to work on?`,

  // Info gathering
  ask_name: () =>
    "Who would you like to start a session with? Just tell me their name.",

  ask_email: (ctx) =>
    ctx.personName
      ? `What's ${ctx.personName}'s email address so I can send them an invitation?`
      : "What's their email address so I can send them an invitation?",

  ask_phone: (ctx) =>
    ctx.personName
      ? `What's ${ctx.personName}'s phone number?`
      : "What's their phone number?",

  // Help
  help_intro: () =>
    "I'm here to help you work through difficult conversations. Just tell me who you'd like to talk to and what's on your mind - for example, 'I need to talk to my partner John about our finances.' I'll help you prepare and then we can invite them to join.",

  // Fallback
  fallback: () =>
    "I'm here to help you work through difficult conversations. You can start a session with someone by telling me their name, or ask for help to learn more.",
};

// ============================================================================
// Types
// ============================================================================

export interface ResponseContext {
  personName?: string;
  contactValue?: string;
  contactType?: 'email' | 'phone';
  missingField?: string;
  errorMessage?: string;
  sessionCount?: number;
  [key: string]: unknown;
}

export interface ResponseInput {
  action: string;
  context?: ResponseContext;
}

// ============================================================================
// Generate Response
// ============================================================================

/**
 * Generate a conversational response
 * Uses templates for common cases, AI for nuanced responses
 */
export async function generateConversationalResponse(
  input: ResponseInput
): Promise<string> {
  const { action, context = {} } = input;

  // Try template first
  const template = TEMPLATES[action];
  if (template) {
    return template(context);
  }

  // Fall back to AI generation for complex cases
  return await generateWithAI(action, context);
}

/**
 * Generate response using Haiku for complex cases
 */
async function generateWithAI(
  action: string,
  context: ResponseContext
): Promise<string> {
  const systemPrompt = `You are a helpful assistant for Meet Without Fear, a conflict resolution app.

Generate a natural, conversational response based on the action and context provided.

TONE: Warm, empathetic, supportive. Like a trusted friend who's good at helping with relationships.

Keep responses SHORT (1-3 sentences max). Be direct but kind.

For session creation:
- Acknowledge the person they mentioned
- Ask for missing info naturally
- When you have everything, confirm you're sending the invitation

Output only JSON: { "response": "your response" }`;

  const prompt = JSON.stringify({
    action,
    context,
    instruction: 'Generate a natural conversational response.',
  });

  const result = await getHaikuJson<{ response: string }>({
    systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 256,
  });

  return result?.response || TEMPLATES.fallback({});
}
