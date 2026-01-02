/**
 * Universal Context Retriever
 *
 * This service runs on EVERY message to ensure the AI always has
 * awareness of relevant history. It:
 *
 * 1. Analyzes the user's message for references to past content
 * 2. Searches embeddings across all accessible content
 * 3. Returns relevant context snippets to inject into prompts
 *
 * This layer runs REGARDLESS of stage, session, or intent.
 * It's the "memory backbone" that ensures nothing is forgotten.
 */

import { prisma } from '../lib/prisma';
import { getEmbedding, getHaikuJson } from '../lib/bedrock';
import { MemoryIntentResult } from './memory-intent';
import { MemoryPreferencesDTO } from '@meet-without-fear/shared';
import {
  getTimeContext,
  formatMessageWithTimeContext,
  getRecencyGuidance,
  type TimeContext,
} from '../utils/time-language';
import { CONTEXT_LIMITS } from '../utils/token-budget';

// ============================================================================
// Types
// ============================================================================

export interface RetrievedContext {
  /** Messages from current conversation (full history, not limited) */
  conversationHistory: ConversationMessage[];

  /** Semantically relevant messages from other sessions */
  relevantFromOtherSessions: RelevantMessage[];

  /** Semantically relevant messages from current session's history */
  relevantFromCurrentSession: RelevantMessage[];

  /** Pre-session messages not yet associated */
  preSessionMessages: ConversationMessage[];

  /** Detected references to past content */
  detectedReferences: DetectedReference[];

  /** Summary of what was retrieved */
  retrievalSummary: string;

  /** AI guidance for how to reference retrieved content based on recency */
  recencyGuidance?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sessionId?: string;
  partnerName?: string;
}

export interface RelevantMessage {
  content: string;
  sessionId: string;
  partnerName: string;
  similarity: number;
  timestamp: string;
  role: 'user' | 'assistant';
  /** Time context for this message (how long ago, phrasing) */
  timeContext?: TimeContext;
}

export interface DetectedReference {
  type: 'person' | 'event' | 'agreement' | 'feeling' | 'time';
  text: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface RetrievalOptions {
  /** User ID */
  userId: string;

  /** Current message being processed */
  currentMessage: string;

  /** Current session ID (if in a session) */
  currentSessionId?: string;

  /** Maximum messages to retrieve from other sessions */
  maxCrossSessionMessages?: number;

  /** Minimum similarity threshold for retrieval */
  similarityThreshold?: number;

  /** Whether to include pre-session messages */
  includePreSession?: boolean;

  /** Memory intent result from intent determination (provides stage-aware config) */
  memoryIntent?: MemoryIntentResult;

  /** User's memory preferences (controls cross-session recall permission) */
  userPreferences?: MemoryPreferencesDTO;
}

// ============================================================================
// Reference Detection
// ============================================================================

interface ReferenceDetectionResult {
  references: DetectedReference[];
  needsRetrieval: boolean;
  searchQueries: string[];
}

/**
 * Detect references to past content in the user's message.
 * Uses Haiku for fast detection.
 */
async function detectReferences(message: string): Promise<ReferenceDetectionResult> {
  const prompt = `Analyze this message for references to past events, people, agreements, or time periods.

Message: "${message}"

Look for:
- References to specific people (names, relationships like "my mom", "my partner")
- References to past events ("last time", "when we talked", "remember when")
- References to agreements or commitments ("we agreed", "you said", "I promised")
- References to past feelings ("I felt", "that time I was")
- Time references ("yesterday", "last week", "before")

Respond with JSON:
{
  "references": [
    { "type": "person|event|agreement|feeling|time", "text": "the reference text", "confidence": "high|medium|low" }
  ],
  "needsRetrieval": true/false (true if references suggest looking up past content),
  "searchQueries": ["query 1", "query 2"] (semantic search queries to find relevant content)
}

If no references, return empty arrays and needsRetrieval: false.`;

  const result = await getHaikuJson<ReferenceDetectionResult>({
    systemPrompt: 'You detect references to past content in messages. Output JSON only.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 512,
  });

  return result || { references: [], needsRetrieval: false, searchQueries: [] };
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Search for semantically similar messages across all user's sessions.
 */
async function searchAcrossSessions(
  userId: string,
  queryText: string,
  excludeSessionId?: string,
  limit: number = 5,
  threshold: number = 0.5
): Promise<RelevantMessage[]> {
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
    return [];
  }

  const vectorSql = `[${queryEmbedding.join(',')}]`;

  // Search messages across all user's sessions
  // Build query based on whether we need to exclude a session
  type MessageResult = {
    id: string;
    session_id: string;
    content: string;
    role: string;
    timestamp: Date;
    partner_name: string;
    distance: number;
  };

  let results: MessageResult[];

  // Data isolation: Only return user's own messages and AI responses TO them
  if (excludeSessionId) {
    results = await prisma.$queryRaw<MessageResult[]>`
      SELECT
        m.id,
        m."sessionId" as session_id,
        m.content,
        m.role,
        m.timestamp,
        COALESCE(partner_user.name, partner_user."firstName", partner_member.nickname, my_member.nickname, 'Unknown') as partner_name,
        m.embedding <=> ${vectorSql}::vector as distance
      FROM "Message" m
      JOIN "Session" s ON m."sessionId" = s.id
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
      LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
      LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
      WHERE m.embedding IS NOT NULL
        AND (m."senderId" = ${userId} OR (m.role = 'AI' AND m."forUserId" = ${userId}))
        AND m."sessionId" != ${excludeSessionId}
      ORDER BY distance ASC
      LIMIT ${limit * 2}
    `;
  } else {
    results = await prisma.$queryRaw<MessageResult[]>`
      SELECT
        m.id,
        m."sessionId" as session_id,
        m.content,
        m.role,
        m.timestamp,
        COALESCE(partner_user.name, partner_user."firstName", partner_member.nickname, my_member.nickname, 'Unknown') as partner_name,
        m.embedding <=> ${vectorSql}::vector as distance
      FROM "Message" m
      JOIN "Session" s ON m."sessionId" = s.id
      JOIN "Relationship" r ON s."relationshipId" = r.id
      JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
      LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
      LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
      WHERE m.embedding IS NOT NULL
        AND (m."senderId" = ${userId} OR (m.role = 'AI' AND m."forUserId" = ${userId}))
      ORDER BY distance ASC
      LIMIT ${limit * 2}
    `;
  }

  // Convert distance to similarity, add time context, and filter
  return results
    .map((r) => {
      const timestamp = r.timestamp.toISOString();
      return {
        content: r.content,
        sessionId: r.session_id,
        partnerName: r.partner_name,
        similarity: 1 - r.distance / 2,
        timestamp,
        role: r.role === 'USER' ? 'user' as const : 'assistant' as const,
        timeContext: getTimeContext(timestamp),
      };
    })
    .filter((r) => r.similarity >= threshold)
    .slice(0, limit);
}

/**
 * Search within a specific session.
 * Data isolation: Only returns user's own messages and AI responses to them.
 */
async function searchWithinSession(
  sessionId: string,
  userId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.5
): Promise<RelevantMessage[]> {
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
    return [];
  }

  const vectorSql = `[${queryEmbedding.join(',')}]`;

  // Data isolation: Only return user's own messages and AI responses TO them
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      role: string;
      timestamp: Date;
      distance: number;
    }>
  >`
    SELECT
      m.id,
      m.content,
      m.role,
      m.timestamp,
      m.embedding <=> ${vectorSql}::vector as distance
    FROM "Message" m
    WHERE m."sessionId" = ${sessionId}
      AND m.embedding IS NOT NULL
      AND (m."senderId" = ${userId} OR (m.role = 'AI' AND m."forUserId" = ${userId}))
    ORDER BY distance ASC
    LIMIT ${limit * 2}
  `;

  return results
    .map((r) => {
      const timestamp = r.timestamp.toISOString();
      return {
        content: r.content,
        sessionId,
        partnerName: '', // Will be filled by caller if needed
        similarity: 1 - r.distance / 2,
        timestamp,
        role: r.role === 'USER' ? 'user' as const : 'assistant' as const,
        timeContext: getTimeContext(timestamp),
      };
    })
    .filter((r) => r.similarity >= threshold)
    .slice(0, limit);
}

// ============================================================================
// Conversation History
// ============================================================================

/**
 * Get full conversation history for current session.
 * No arbitrary limits - we trust the model's context window.
 * Data isolation: only returns this user's messages and AI responses to them.
 */
async function getSessionHistory(
  sessionId: string,
  userId: string
): Promise<ConversationMessage[]> {
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        { senderId: userId },
        { role: 'AI', forUserId: userId },
      ],
    },
    orderBy: { timestamp: 'asc' },
    select: {
      content: true,
      role: true,
      timestamp: true,
    },
  });

  return messages.map((m) => ({
    role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
  }));
}

/**
 * Get unassociated pre-session messages for the user.
 */
async function getPreSessionMessages(userId: string): Promise<ConversationMessage[]> {
  const messages = await prisma.preSessionMessage.findMany({
    where: {
      userId,
      associatedSessionId: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      content: true,
      role: true,
      timestamp: true,
    },
  });

  return messages.map((m) => ({
    role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
  }));
}

/**
 * Search pre-session messages by semantic similarity.
 */
async function searchPreSessionMessages(
  userId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.5
): Promise<RelevantMessage[]> {
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
    return [];
  }

  const vectorSql = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      role: string;
      timestamp: Date;
      distance: number;
    }>
  >`
    SELECT
      id,
      content,
      role,
      timestamp,
      embedding <=> ${vectorSql}::vector as distance
    FROM "PreSessionMessage"
    WHERE "userId" = ${userId}
      AND embedding IS NOT NULL
      AND "associatedSessionId" IS NULL
      AND "expiresAt" > NOW()
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results
    .map((r) => ({
      content: r.content,
      sessionId: 'pre-session',
      partnerName: 'Pre-session',
      similarity: 1 - r.distance / 2,
      timestamp: r.timestamp.toISOString(),
      role: r.role === 'USER' ? 'user' as const : 'assistant' as const,
    }))
    .filter((r) => r.similarity >= threshold);
}

// ============================================================================
// Main Retrieval Function
// ============================================================================

/**
 * Retrieve all relevant context for a message.
 * This is the main entry point - call this for EVERY message.
 */
export async function retrieveContext(options: RetrievalOptions): Promise<RetrievedContext> {
  const {
    userId,
    currentMessage,
    currentSessionId,
    maxCrossSessionMessages = 10,
    similarityThreshold = 0.5,
    includePreSession = true,
    memoryIntent,
    userPreferences,
  } = options;

  const startTime = Date.now();

  // Use memory intent to override thresholds and limits if provided
  const effectiveThreshold = memoryIntent?.threshold ?? similarityThreshold;
  const effectiveMaxCrossSession = memoryIntent?.maxCrossSession ?? maxCrossSessionMessages;

  // Run detection and basic retrieval in parallel
  const [
    referenceDetection,
    conversationHistory,
    preSessionMessages,
  ] = await Promise.all([
    detectReferences(currentMessage),
    currentSessionId ? getSessionHistory(currentSessionId, userId) : Promise.resolve([]),
    includePreSession ? getPreSessionMessages(userId) : Promise.resolve([]),
  ]);

  // If we detected references that need retrieval, do semantic search
  let relevantFromOtherSessions: RelevantMessage[] = [];
  let relevantFromCurrentSession: RelevantMessage[] = [];

  if (referenceDetection.needsRetrieval && referenceDetection.searchQueries.length > 0) {
    // Determine if cross-session recall is allowed
    // Cross-session is allowed if:
    // 1. memoryIntent says allowCrossSession is true, OR
    // 2. User explicitly referenced past content (needsRetrieval), OR
    // 3. User has enabled crossSessionRecall in preferences
    const shouldSearchCrossSession =
      (memoryIntent?.allowCrossSession ?? true) ||
      referenceDetection.needsRetrieval ||
      (userPreferences?.crossSessionRecall ?? false);

    // Search using the generated queries
    const searchPromises = referenceDetection.searchQueries.map(async (query) => {
      const [crossSession, withinSession] = await Promise.all([
        // Only search cross-session if allowed
        shouldSearchCrossSession
          ? searchAcrossSessions(userId, query, currentSessionId, effectiveMaxCrossSession, effectiveThreshold)
          : Promise.resolve([]),
        currentSessionId
          ? searchWithinSession(currentSessionId, userId, query, 5, effectiveThreshold)
          : Promise.resolve([]),
      ]);
      return { crossSession, withinSession };
    });

    const searchResults = await Promise.all(searchPromises);

    // Deduplicate and merge results
    const seenCross = new Set<string>();
    const seenWithin = new Set<string>();

    for (const result of searchResults) {
      for (const msg of result.crossSession) {
        const key = `${msg.sessionId}:${msg.content.slice(0, 50)}`;
        if (!seenCross.has(key)) {
          seenCross.add(key);
          relevantFromOtherSessions.push(msg);
        }
      }
      for (const msg of result.withinSession) {
        const key = msg.content.slice(0, 50);
        if (!seenWithin.has(key)) {
          seenWithin.add(key);
          relevantFromCurrentSession.push(msg);
        }
      }
    }

    // Sort by similarity and limit
    relevantFromOtherSessions = relevantFromOtherSessions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, effectiveMaxCrossSession);

    relevantFromCurrentSession = relevantFromCurrentSession
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  // Build retrieval summary
  const parts: string[] = [];
  if (conversationHistory.length > 0) {
    parts.push(`${conversationHistory.length} messages in current conversation`);
  }
  if (preSessionMessages.length > 0) {
    parts.push(`${preSessionMessages.length} pre-session messages`);
  }
  if (relevantFromOtherSessions.length > 0) {
    parts.push(`${relevantFromOtherSessions.length} relevant from other sessions`);
  }
  if (relevantFromCurrentSession.length > 0) {
    parts.push(`${relevantFromCurrentSession.length} relevant from earlier in session`);
  }
  if (referenceDetection.references.length > 0) {
    parts.push(`${referenceDetection.references.length} references detected`);
  }

  const duration = Date.now() - startTime;
  console.log(`[ContextRetriever] Retrieved in ${duration}ms: ${parts.join(', ') || 'no additional context'}`);

  // Generate recency guidance for retrieved content
  const allTimestamps = [
    ...relevantFromOtherSessions.map((m) => m.timestamp),
    ...relevantFromCurrentSession.map((m) => m.timestamp),
  ];
  const recencyGuidance = allTimestamps.length > 0
    ? getRecencyGuidance(allTimestamps)
    : undefined;

  return {
    conversationHistory,
    relevantFromOtherSessions,
    relevantFromCurrentSession,
    preSessionMessages,
    detectedReferences: referenceDetection.references,
    retrievalSummary: parts.join('; ') || 'No additional context retrieved',
    recencyGuidance,
  };
}

// ============================================================================
// Context Formatting
// ============================================================================

/**
 * Format retrieved context for injection into prompts.
 * Uses natural time language instead of formulaic headers.
 */
export function formatRetrievedContext(context: RetrievedContext): string {
  const sections: string[] = [];

  // Add recency guidance at the top if we have retrieved content
  if (context.recencyGuidance && (
    context.relevantFromOtherSessions.length > 0 ||
    context.relevantFromCurrentSession.length > 0
  )) {
    sections.push(`[MEMORY CONTEXT GUIDANCE: ${context.recencyGuidance}]`);
  }

  // Pre-session messages (if any and not in a session)
  if (context.preSessionMessages.length > 0) {
    sections.push('\n[Earlier in this conversation]');
    for (const msg of context.preSessionMessages.slice(-CONTEXT_LIMITS.maxPreSessionMessages)) {
      sections.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
    }
  }

  // Relevant messages from other sessions - with time context
  if (context.relevantFromOtherSessions.length > 0) {
    sections.push('\n[Related content from previous sessions]');
    for (const msg of context.relevantFromOtherSessions) {
      // Use the time context for natural phrasing
      const timePhrase = msg.timeContext?.phrase ?? new Date(msg.timestamp).toLocaleDateString();
      const useMemoryLanguage = msg.timeContext?.useRememberingLanguage ?? true;

      if (useMemoryLanguage) {
        sections.push(`[Session with ${msg.partnerName}, ${timePhrase}]`);
      } else {
        // For very recent content, minimal framing
        sections.push(`[${msg.partnerName}]`);
      }
      sections.push(`${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`);
    }
  }

  // Relevant from current session (older messages) - with time context
  if (context.relevantFromCurrentSession.length > 0) {
    sections.push('\n[Related content from earlier in this session]');
    for (const msg of context.relevantFromCurrentSession) {
      const timePhrase = msg.timeContext?.phrase;
      if (timePhrase && msg.timeContext?.useRememberingLanguage) {
        sections.push(`[${timePhrase}]`);
      }
      sections.push(`${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`);
    }
  }

  // Detected references (for AI awareness)
  if (context.detectedReferences.length > 0) {
    sections.push('\n[Detected references in user message]');
    for (const ref of context.detectedReferences) {
      sections.push(`- ${ref.type}: "${ref.text}" (${ref.confidence} confidence)`);
    }
  }

  return sections.join('\n');
}

/**
 * Build messages array with full context for AI.
 */
export function buildMessagesWithFullContext(
  context: RetrievedContext,
  currentMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add conversation history (full, not limited)
  for (const msg of context.conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // If we have relevant context from retrieval, inject it
  const retrievedContext = formatRetrievedContext({
    ...context,
    conversationHistory: [], // Don't duplicate history
    preSessionMessages: context.conversationHistory.length === 0 ? context.preSessionMessages : [],
  });

  // Add current message with retrieved context
  if (retrievedContext.trim()) {
    messages.push({
      role: 'user',
      content: `[Retrieved context:\n${retrievedContext}]\n\n${currentMessage}`,
    });
  } else {
    messages.push({ role: 'user', content: currentMessage });
  }

  return messages;
}

