/**
 * Intent Detector
 *
 * Uses Haiku (small, fast model) to detect user intent from natural language.
 * Extensible through detection plugins.
 */

import { getHaikuJson } from '../../lib/bedrock';
import {
  ChatIntent,
  IntentDetectionResult,
  MissingInfo,
  IntentConfidence,
  SessionCreationState,
} from '@be-heard/shared';
import { handlerRegistry } from './registry';
import { IntentDetectionHint } from './types';

// ============================================================================
// Intent Detection
// ============================================================================

export interface SessionInfo {
  id: string;
  partnerName: string;
  status: string;
  lastActivity?: string;
}

export interface SemanticMatch {
  sessionId: string;
  partnerName: string;
  similarity: number;
}

export interface DetectionInput {
  message: string;
  hasActiveSession: boolean;
  activeSessionPartnerName?: string;
  /** All sessions the user has, for context-aware detection */
  userSessions?: SessionInfo[];
  /** Semantically similar sessions from vector search */
  semanticMatches?: SemanticMatch[];
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingState?: {
    type: string;
    data: unknown;
  };
}

interface HaikuIntentResponse {
  intent: string;
  confidence: string;
  /** Session ID if referencing an existing session */
  existingSessionId?: string | null;
  person?: {
    firstName?: string | null;
    lastName?: string | null;
    contactInfo?: { type: 'email' | 'phone'; value: string } | null;
  };
  sessionContext?: {
    topic?: string | null;
    emotionalTone?: string;
  };
  missingInfo?: Array<{
    field: string;
    required: boolean;
    promptText: string;
  }>;
  followUpQuestion?: string;
}

/**
 * Build the intent detection prompt with user context
 */
function buildDetectionPrompt(
  userSessions?: SessionInfo[],
  semanticMatches?: SemanticMatch[]
): string {
  const pluginHints = handlerRegistry.getDetectionHints();

  let additionalIntents = '';
  if (pluginHints.length > 0) {
    additionalIntents = '\n\nADDITIONAL INTENTS FROM PLUGINS:\n';
    for (const hint of pluginHints) {
      additionalIntents += `\n${hint.intent} - ${hint.description}`;
      additionalIntents += `\n   Keywords: ${hint.keywords.join(', ')}`;
      additionalIntents += `\n   Examples: ${hint.examples.slice(0, 2).join('; ')}`;
    }
  }

  // Build session context for the prompt
  let sessionContext = '';
  if (userSessions && userSessions.length > 0) {
    sessionContext = '\n\nUSER\'S EXISTING SESSIONS:\n';
    for (const session of userSessions) {
      sessionContext += `- Session with "${session.partnerName}" (ID: ${session.id}, Status: ${session.status})`;
      if (session.lastActivity) {
        sessionContext += ` - Last activity: ${session.lastActivity}`;
      }
      sessionContext += '\n';
    }
    sessionContext += '\nIMPORTANT: If the user mentions someone who matches an existing session, use SWITCH_SESSION or CONTINUE_CONVERSATION with that session\'s ID. Only use CREATE_SESSION for NEW people.';
  }

  // Add semantic matches from vector search
  let semanticContext = '';
  if (semanticMatches && semanticMatches.length > 0) {
    semanticContext = '\n\nSEMANTIC MATCHES (from vector similarity search):\n';
    semanticContext += 'These sessions are semantically similar to what the user is saying:\n';
    for (const match of semanticMatches) {
      const similarityPercent = Math.round(match.similarity * 100);
      semanticContext += `- Session with "${match.partnerName}" (ID: ${match.sessionId}) - ${similarityPercent}% match\n`;
    }
    semanticContext += '\nHighly relevant semantic matches (>70%) strongly suggest SWITCH_SESSION.';
  }

  return `You are an intent detection system for BeHeard, a conflict resolution app.

Your job is to analyze user messages and determine their intent. The app helps people have difficult conversations with others (partners, family, friends, coworkers).

CONTEXT:
- Users chat with an AI assistant that helps them process feelings and prepare for conversations
- Users can start "sessions" with specific people they want to work things out with
- The main interface is a chat - users naturally talk about their relationships and feelings
${sessionContext}${semanticContext}

INTENTS (choose the most appropriate):

1. CREATE_SESSION - User wants to start a NEW session with someone not in their existing sessions
   - Mentions a person by name who is NOT in their existing sessions
   - Expresses emotions, conflict, or issues with a specific person
   - Examples: "I'm frustrated with my mom Lisa", "I had a fight with David", "I'm still mad about Tara"

2. SWITCH_SESSION - User references someone they ALREADY have a session with
   - If the person's name matches an existing session, this is likely SWITCH_SESSION
   - Include the existingSessionId in your response

3. CONTINUE_CONVERSATION - User is continuing within the current context
   - Sharing feelings, responding to AI, general conversation
   - Not clearly referring to a specific person or new topic

4. CHECK_STATUS - User asks about progress or status

5. LIST_SESSIONS - User wants to see their sessions

6. HELP - User needs help understanding the app

7. UNKNOWN - Can't determine intent (use sparingly - try to infer intent)
${additionalIntents}

EXTRACTION RULES:
- If a person is mentioned, extract firstName (and lastName if given)
- If they mention email or phone, extract contactInfo
- Extract the emotional tone and topic if present
- If the person matches an existing session, include existingSessionId

RESPONSE FORMAT (JSON only):
{
  "intent": "CREATE_SESSION" | "SWITCH_SESSION" | "CONTINUE_CONVERSATION" | "CHECK_STATUS" | "LIST_SESSIONS" | "HELP" | "UNKNOWN",
  "confidence": "high" | "medium" | "low",
  "existingSessionId": "session ID if referencing existing session, or null",
  "person": {
    "firstName": "string or null",
    "lastName": "string or null",
    "contactInfo": { "type": "email" | "phone", "value": "string" } | null
  },
  "sessionContext": {
    "topic": "what they want to discuss or null",
    "emotionalTone": "neutral" | "upset" | "hopeful" | "anxious"
  },
  "missingInfo": [
    { "field": "firstName" | "contact", "required": true, "promptText": "natural question" }
  ],
  "followUpQuestion": "natural language question if more info needed"
}

KEY RULES:
1. Match names against existing sessions - if "Tara" matches a session, use SWITCH_SESSION not CREATE_SESSION
2. For CREATE_SESSION, we need firstName and contact (email OR phone) - ask briefly if missing
3. Lean toward action - if someone mentions a person with emotion/conflict, they want to work on that relationship
4. Only output valid JSON, no explanation`;
}

/**
 * Detect intent from user message using Haiku
 */
export async function detectIntent(input: DetectionInput): Promise<IntentDetectionResult> {
  const {
    message,
    hasActiveSession,
    activeSessionPartnerName,
    userSessions,
    semanticMatches,
    recentMessages,
    pendingState,
  } = input;

  // Build context for the model
  let contextInfo = '';
  if (hasActiveSession && activeSessionPartnerName) {
    contextInfo += `\nCurrent active session: with ${activeSessionPartnerName}`;
  }
  if (pendingState) {
    contextInfo += `\nPending ${pendingState.type}: ${JSON.stringify(pendingState.data)}`;
  }
  if (recentMessages && recentMessages.length > 0) {
    contextInfo += '\nRecent conversation:';
    for (const msg of recentMessages.slice(-3)) {
      contextInfo += `\n${msg.role}: ${msg.content}`;
    }
  }

  const userMessage = contextInfo
    ? `Context:${contextInfo}\n\nUser message: "${message}"`
    : `User message: "${message}"`;

  const result = await getHaikuJson<HaikuIntentResponse>({
    systemPrompt: buildDetectionPrompt(userSessions, semanticMatches),
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 512,
  });

  // Handle null result (AI not available or parse error)
  if (!result) {
    return createFallbackResult(message, hasActiveSession, userSessions, semanticMatches);
  }

  // Map the response to our types
  const mapped = mapHaikuResponse(result);

  // Run through detection plugins for post-processing
  const plugins = handlerRegistry.getPlugins();
  let finalResult = mapped;
  for (const plugin of plugins) {
    if (plugin.postProcess) {
      finalResult = plugin.postProcess(finalResult);
    }
  }

  return finalResult;
}

/**
 * Create fallback result when AI is unavailable
 */
function createFallbackResult(
  message: string,
  hasActiveSession: boolean,
  userSessions?: SessionInfo[],
  semanticMatches?: SemanticMatch[]
): IntentDetectionResult {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('help') || lowerMessage.includes('how do')) {
    return { intent: ChatIntent.HELP, confidence: 'low' };
  }

  if (
    lowerMessage.includes('session') &&
    (lowerMessage.includes('show') || lowerMessage.includes('list'))
  ) {
    return { intent: ChatIntent.LIST_SESSIONS, confidence: 'low' };
  }

  // Check semantic matches first (more reliable than name matching)
  if (semanticMatches && semanticMatches.length > 0) {
    const bestMatch = semanticMatches[0];
    if (bestMatch.similarity >= 0.7) {
      return {
        intent: ChatIntent.SWITCH_SESSION,
        confidence: 'medium',
        sessionId: bestMatch.sessionId,
        person: { firstName: bestMatch.partnerName },
      };
    }
  }

  // Try to match against existing sessions by name
  if (userSessions && userSessions.length > 0) {
    for (const session of userSessions) {
      const partnerNameLower = session.partnerName.toLowerCase();
      // Check if message contains the partner's name
      if (lowerMessage.includes(partnerNameLower)) {
        return {
          intent: ChatIntent.SWITCH_SESSION,
          confidence: 'low',
          sessionId: session.id,
          person: { firstName: session.partnerName },
        };
      }
    }
  }

  if (hasActiveSession) {
    return { intent: ChatIntent.CONTINUE_CONVERSATION, confidence: 'low' };
  }

  return {
    intent: ChatIntent.UNKNOWN,
    confidence: 'low',
    followUpQuestion:
      "I'm here to help you work through difficult conversations. You can start a session with someone by telling me their name, or ask for help to learn more.",
  };
}

/**
 * Map Haiku response to our types
 */
function mapHaikuResponse(response: HaikuIntentResponse): IntentDetectionResult {
  const intent = mapIntent(response.intent);
  const confidence = mapConfidence(response.confidence);

  const result: IntentDetectionResult = { intent, confidence };

  // Include session ID if referencing an existing session
  if (response.existingSessionId) {
    result.sessionId = response.existingSessionId;
  }

  if (response.person) {
    const { firstName, lastName, contactInfo } = response.person;
    if (firstName) {
      result.person = {
        firstName,
        lastName: lastName || undefined,
        contactInfo: contactInfo || undefined,
      };
    }
  }

  if (response.sessionContext) {
    result.sessionContext = {
      topic: response.sessionContext.topic || undefined,
      emotionalTone: mapEmotionalTone(response.sessionContext.emotionalTone),
    };
  }

  if (response.missingInfo && response.missingInfo.length > 0) {
    result.missingInfo = response.missingInfo.map((info) => ({
      field: info.field as MissingInfo['field'],
      required: info.required,
      promptText: info.promptText,
    }));
  }

  if (response.followUpQuestion) {
    result.followUpQuestion = response.followUpQuestion;
  }

  return result;
}

function mapIntent(intentStr: string): ChatIntent {
  const mapping: Record<string, ChatIntent> = {
    CREATE_SESSION: ChatIntent.CREATE_SESSION,
    SWITCH_SESSION: ChatIntent.SWITCH_SESSION,
    CONTINUE_CONVERSATION: ChatIntent.CONTINUE_CONVERSATION,
    CHECK_STATUS: ChatIntent.CHECK_STATUS,
    LIST_SESSIONS: ChatIntent.LIST_SESSIONS,
    HELP: ChatIntent.HELP,
    UNKNOWN: ChatIntent.UNKNOWN,
  };
  return mapping[intentStr] || ChatIntent.UNKNOWN;
}

function mapConfidence(confidenceStr: string): IntentConfidence {
  if (
    confidenceStr === 'high' ||
    confidenceStr === 'medium' ||
    confidenceStr === 'low'
  ) {
    return confidenceStr;
  }
  return 'low';
}

function mapEmotionalTone(
  tone?: string
): 'neutral' | 'upset' | 'hopeful' | 'anxious' {
  const validTones = ['neutral', 'upset', 'hopeful', 'anxious'];
  if (tone && validTones.includes(tone)) {
    return tone as 'neutral' | 'upset' | 'hopeful' | 'anxious';
  }
  return 'neutral';
}
