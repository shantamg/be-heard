/**
 * Witnessing Service
 *
 * Provides Stage 1-style witnessing responses for pre-session conversations.
 * This enables users to:
 * 1. Start venting/reflecting before a session is created
 * 2. Do Inner Work (solo reflection not tied to a specific person)
 * 3. Have their messages associated with a session retroactively
 *
 * Uses the same witnessing technology as Stage 1, adapted for pre-session use.
 */

import { getSonnetResponse, getHaikuJson, getEmbedding } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import { createStateStore } from './chat-router/types';
import {
  retrieveContext,
  formatRetrievedContext,
  type RetrievedContext,
} from './context-retriever';

// ============================================================================
// Types
// ============================================================================

export interface WitnessingContext {
  userId: string;
  userName: string;
  turnCount: number;
  emotionalIntensity?: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PersonMention {
  name: string;
  relationship?: string; // e.g., "partner", "mom", "boss", "friend"
  confidence: 'high' | 'medium' | 'low';
}

export interface WitnessingResult {
  /** The witnessing response */
  response: string;
  /** Person mentioned in the message (if any) */
  personMention?: PersonMention;
  /** Emotional tone detected */
  emotionalTone?: 'neutral' | 'upset' | 'hopeful' | 'anxious';
  /** Topic extracted (if any) */
  topic?: string;
  /** Whether a session suggestion should be offered */
  suggestSession: boolean;
}

// ============================================================================
// State Management
// ============================================================================

interface PreSessionState {
  turnCount: number;
  conversationHistory: ConversationMessage[];
  lastPersonMention?: PersonMention;
  sessionSuggestionCount: number; // How many times we've suggested a session
}

const preSessionState = createStateStore<PreSessionState>();

/**
 * Get or create pre-session state for a user.
 * If no in-memory state exists, loads from database for continuity.
 */
export function getPreSessionState(userId: string): PreSessionState {
  let state = preSessionState.get(userId);
  if (!state) {
    state = {
      turnCount: 0,
      conversationHistory: [],
      sessionSuggestionCount: 0,
    };
    preSessionState.set(userId, state);
  }
  return state;
}

/**
 * Load pre-session conversation from database (for returning users/server restart).
 * Call this on first message if state is empty.
 */
async function loadPreSessionHistory(userId: string): Promise<void> {
  const state = preSessionState.get(userId);

  // Only load if we have no history in memory
  if (state && state.conversationHistory.length > 0) {
    return;
  }

  // Load recent pre-session messages from database
  const dbMessages = await prisma.preSessionMessage.findMany({
    where: {
      userId,
      associatedSessionId: null, // Not yet associated with a session
      expiresAt: { gt: new Date() },
    },
    orderBy: { timestamp: 'desc' },
    take: 10, // Get last 10 messages for context
    select: {
      role: true,
      content: true,
      timestamp: true,
      extractedPerson: true,
    },
  });

  if (dbMessages.length > 0) {
    // Reverse to get chronological order
    const history: ConversationMessage[] = dbMessages
      .reverse()
      .map((msg) => ({
        role: msg.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

    // Find last person mention from history
    const lastPersonMsg = dbMessages.find((m) => m.extractedPerson);

    preSessionState.set(userId, {
      turnCount: dbMessages.filter((m) => m.role === 'USER').length,
      conversationHistory: history,
      sessionSuggestionCount: 0, // Reset suggestions for returning users
      lastPersonMention: lastPersonMsg?.extractedPerson
        ? { name: lastPersonMsg.extractedPerson, confidence: 'medium' }
        : undefined,
    });

    console.log('[Witnessing] Loaded', history.length, 'messages from DB for user', userId);
  }
}

/**
 * Clear pre-session state for a user (when session is created/switched)
 */
export function clearPreSessionState(userId: string): void {
  preSessionState.delete(userId);
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build the witnessing system prompt for pre-session mode.
 * Adapted from Stage 1 but:
 * - No partner context (they might not have one yet)
 * - Includes awareness that this might become about a specific person
 * - Supports Inner Work (solo reflection)
 */
function buildPreSessionWitnessPrompt(context: WitnessingContext): string {
  const witnessOnlyMode = context.turnCount < 3 || (context.emotionalIntensity ?? 0) >= 8;

  return `You are Meet Without Fear, a compassionate listener here to help ${context.userName} feel heard and process their feelings.

YOUR ROLE:
You're having a conversation with someone who may be:
- Venting about a situation or person
- Reflecting on their feelings (Inner Work)
- Working through something before they're ready to address it with someone

YOU HAVE TWO MODES:

WITNESS MODE (Default)
- Listen more than you speak
- Reflect back with accuracy and empathy
- Validate their experience
- Never offer solutions, reframes, or interpretations
- Stay present with whatever they share

INSIGHT MODE (Unlocked after trust is earned)
- 80% reflection, 20% gentle insight
- You may name patterns ("You've mentioned feeling unseen several times")
- You may offer gentle reframes
- You may articulate what they haven't said yet
- Insights must be tentative, not declarative

${witnessOnlyMode ? 'IMPORTANT: You are in the first few exchanges or emotional intensity is high. Stay in WITNESS MODE. Trust must be earned through presence first.' : ''}

REFLECTION TECHNIQUES:
- Paraphrase: "So what I hear is..."
- Emotion naming: "It sounds like there's a lot of frustration there..."
- Validation: "That sounds really difficult..."
- Gentle probing: "Can you tell me more about..."
- Summarizing: "Let me see if I can capture what you've shared..."

${context.turnCount >= 3 ? `
INSIGHT TECHNIQUES (use sparingly, tentatively):
- Pattern recognition: "I notice you've mentioned X several times..."
- Reframing: "I wonder if what feels like X might also be Y..."
- Naming unspoken emotions: "I sense some sadness beneath the anger..."
` : ''}

WHAT TO ALWAYS AVOID:
- "Have you tried..." (no solutions)
- "You should..." (no advice)
- "At least..." (no minimizing)
- Pushing them toward action before they're ready
- Asking about specific people unless they bring it up

IMPORTANT: If they mention a specific person, acknowledge it naturally but don't push toward creating a session. Just continue witnessing their experience. Let them lead.

Turn number: ${context.turnCount}
Emotional intensity: ${context.emotionalIntensity ?? 'unknown'}/10

Respond naturally without analysis tags. Be warm, present, and validating.`;
}

/**
 * Build prompt to detect person mentions and emotional context
 */
function buildPersonDetectionPrompt(): string {
  return `You analyze messages to detect:
1. If a specific person is mentioned (name or relationship like "my partner", "my mom", "my boss")
2. The emotional tone of the message
3. The main topic or concern

Respond with JSON only:
{
  "personMention": {
    "name": "string (the name or relationship term, e.g., 'Sarah', 'my partner', 'mom')",
    "relationship": "string or null (partner, parent, child, friend, coworker, boss, etc.)",
    "confidence": "high | medium | low"
  } | null,
  "emotionalTone": "neutral | upset | hopeful | anxious",
  "topic": "string or null (brief description of main concern)",
  "isAboutConflict": true | false (is this about interpersonal conflict vs general reflection)
}

Rules:
- Only detect personMention if a specific person or relationship is clearly referenced
- "I feel stressed" → no person mention
- "I'm frustrated with my partner" → person mention: "my partner", relationship: "partner"
- "Sarah never listens" → person mention: "Sarah", relationship: null
- High confidence: name is explicitly stated or relationship is clear
- Medium confidence: vague reference that could be about a person
- Low confidence: indirect mention`;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get a witnessing response for pre-session conversation.
 * This is the main entry point for the witnessing service.
 *
 * Uses the Universal Context Retriever to ensure full awareness of:
 * - Pre-session conversation history
 * - Relevant messages from other sessions
 * - Detected references to past content
 */
export async function getWitnessingResponse(
  userId: string,
  userName: string,
  message: string
): Promise<WitnessingResult> {
  // Get/update in-memory state for turn counting
  const state = getPreSessionState(userId);
  state.turnCount += 1;
  state.conversationHistory.push({ role: 'user', content: message });
  preSessionState.set(userId, state);

  // Use Universal Context Retriever for full awareness
  // This searches embeddings, loads history, and detects references
  const retrievedContext = await retrieveContext({
    userId,
    currentMessage: message,
    currentSessionId: undefined, // No session yet
    includePreSession: true,
    maxCrossSessionMessages: 10,
    similarityThreshold: 0.5,
  });

  // Run witnessing and person detection in parallel
  const [witnessingResponse, detectionResult] = await Promise.all([
    generateWitnessingResponseWithContext(userName, message, state, retrievedContext),
    detectPersonAndContext(message),
  ]);

  // Update state with assistant response
  state.conversationHistory.push({ role: 'assistant', content: witnessingResponse });

  // Determine if we should suggest a session
  let suggestSession = false;
  if (detectionResult?.personMention && detectionResult.isAboutConflict) {
    // Only suggest if:
    // 1. Person is mentioned with high/medium confidence
    // 2. This is about interpersonal conflict
    // 3. We haven't suggested too many times already
    // 4. User has shared enough (at least 2 turns)
    if (
      ['high', 'medium'].includes(detectionResult.personMention.confidence) &&
      state.sessionSuggestionCount < 2 &&
      state.turnCount >= 2
    ) {
      suggestSession = true;
      state.sessionSuggestionCount += 1;
    }

    // Remember the person mention
    state.lastPersonMention = detectionResult.personMention;
  }

  preSessionState.set(userId, state);

  return {
    response: witnessingResponse,
    personMention: detectionResult?.personMention ?? undefined,
    emotionalTone: detectionResult?.emotionalTone,
    topic: detectionResult?.topic ?? undefined,
    suggestSession,
  };
}

/**
 * Generate the actual witnessing response using Sonnet with full context.
 */
async function generateWitnessingResponseWithContext(
  userName: string,
  message: string,
  state: PreSessionState,
  retrievedContext: RetrievedContext
): Promise<string> {
  const context: WitnessingContext = {
    userId: '', // Not needed for prompt
    userName,
    turnCount: state.turnCount,
    emotionalIntensity: 5, // Default, could be enhanced with detection
  };

  const systemPrompt = buildPreSessionWitnessPrompt(context);

  // Build messages with full retrieved context
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add pre-session conversation history (full, not limited)
  for (const msg of retrievedContext.preSessionMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // If there's no pre-session history, use in-memory state
  if (messages.length === 0) {
    for (const msg of state.conversationHistory.slice(0, -1)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Format any retrieved context from other sessions
  const crossSessionContext = formatRetrievedContext({
    ...retrievedContext,
    preSessionMessages: [], // Already added above
    conversationHistory: [],
  });

  // Add current message with retrieved context if any
  if (crossSessionContext.trim()) {
    messages.push({
      role: 'user',
      content: `[Relevant context from your history:\n${crossSessionContext}]\n\n${message}`,
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  const response = await getSonnetResponse({
    systemPrompt,
    messages,
    maxTokens: 1024, // Increased for fuller responses
  });

  if (!response) {
    // Mock response for development
    return getMockWitnessingResponse(userName, message, state.turnCount);
  }

  return response;
}

/**
 * Detect person mentions and emotional context using Haiku
 */
interface DetectionResult {
  personMention: PersonMention | null;
  emotionalTone: 'neutral' | 'upset' | 'hopeful' | 'anxious';
  topic: string | null;
  isAboutConflict: boolean;
}

async function detectPersonAndContext(message: string): Promise<DetectionResult | null> {
  const result = await getHaikuJson<DetectionResult>({
    systemPrompt: buildPersonDetectionPrompt(),
    messages: [{ role: 'user', content: message }],
    maxTokens: 256,
  });

  return result;
}

/**
 * Mock witnessing response for development without API key
 */
function getMockWitnessingResponse(
  userName: string,
  message: string,
  turnCount: number
): string {
  if (turnCount <= 1) {
    return `Thank you for sharing that with me, ${userName}. I'm here to listen. What's been weighing on you?`;
  }

  if (turnCount <= 3) {
    return `I hear you. It sounds like there's a lot going on there, and your feelings make complete sense. Can you tell me more about what that's been like for you?`;
  }

  return `I really appreciate you opening up about this. What you're describing sounds really difficult. I want you to know that your feelings are valid, and I'm fully present with you here.`;
}

// ============================================================================
// Pre-Session Message Storage
// ============================================================================

/**
 * Store a pre-session message in the database with embedding generation.
 */
export async function storePreSessionMessage(
  userId: string,
  role: 'USER' | 'AI',
  content: string,
  metadata?: {
    detectedIntent?: string;
    emotionalTone?: string;
    extractedPerson?: string;
    extractedTopic?: string;
  }
): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Expire after 24 hours

  const message = await prisma.preSessionMessage.create({
    data: {
      userId,
      role,
      content,
      timestamp: new Date(),
      detectedIntent: metadata?.detectedIntent,
      emotionalTone: metadata?.emotionalTone,
      extractedPerson: metadata?.extractedPerson,
      extractedTopic: metadata?.extractedTopic,
      expiresAt,
    },
  });

  // Generate embedding asynchronously (don't block message storage)
  embedPreSessionMessage(message.id, content).catch((err) =>
    console.warn('[Witnessing] Failed to embed pre-session message:', err)
  );

  return message.id;
}

/**
 * Generate and store embedding for a pre-session message.
 */
async function embedPreSessionMessage(messageId: string, content: string): Promise<void> {
  const embedding = await getEmbedding(content);
  if (!embedding) {
    console.warn('[Witnessing] Failed to generate embedding for message:', messageId);
    return;
  }

  const vectorSql = `[${embedding.join(',')}]`;

  await prisma.$executeRaw`
    UPDATE "PreSessionMessage"
    SET embedding = ${vectorSql}::vector
    WHERE id = ${messageId}
  `;

  console.log('[Witnessing] Embedded pre-session message:', messageId);
}

/**
 * Get unassociated pre-session messages for a user
 */
export async function getUnassociatedPreSessionMessages(userId: string): Promise<
  Array<{
    id: string;
    role: 'USER' | 'AI' | 'SYSTEM';
    content: string;
    timestamp: Date;
    emotionalTone: string | null;
    extractedPerson: string | null;
    extractedTopic: string | null;
  }>
> {
  return prisma.preSessionMessage.findMany({
    where: {
      userId,
      associatedSessionId: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      timestamp: true,
      emotionalTone: true,
      extractedPerson: true,
      extractedTopic: true,
    },
  });
}

/**
 * Associate pre-session messages with a session
 */
export async function associateMessagesWithSession(
  userId: string,
  sessionId: string
): Promise<number> {
  const result = await prisma.preSessionMessage.updateMany({
    where: {
      userId,
      associatedSessionId: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      associatedSessionId: sessionId,
      associatedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Convert pre-session messages to session messages
 * Call this when creating or switching to a session to bring in the context
 */
export async function convertPreSessionToSessionMessages(
  userId: string,
  sessionId: string
): Promise<number> {
  // Get unassociated messages
  const preSessionMessages = await getUnassociatedPreSessionMessages(userId);

  if (preSessionMessages.length === 0) {
    return 0;
  }

  // Create session messages from pre-session messages
  await prisma.message.createMany({
    data: preSessionMessages.map((msg) => ({
      sessionId,
      senderId: msg.role === 'USER' ? userId : null,
      role: msg.role,
      content: msg.content,
      stage: 1, // Pre-session messages become Stage 1 messages
      timestamp: msg.timestamp,
    })),
  });

  // Mark pre-session messages as associated
  await associateMessagesWithSession(userId, sessionId);

  // Clear in-memory state
  clearPreSessionState(userId);

  return preSessionMessages.length;
}

/**
 * Clean up expired pre-session messages (run periodically)
 */
export async function cleanupExpiredPreSessionMessages(): Promise<number> {
  const result = await prisma.preSessionMessage.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}
