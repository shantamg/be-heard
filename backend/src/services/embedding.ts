/**
 * Embedding Service
 *
 * Generates and stores embeddings for semantic search.
 * Uses Titan for embedding generation and pgvector for storage/querying.
 */

import { prisma } from '../lib/prisma';
import { getEmbedding, EMBEDDING_DIMENSIONS } from '../lib/bedrock';
import { Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface SessionSummary {
  id: string;
  partnerName: string;
  topic?: string;
  recentContext?: string;
  status: string;
}

export interface SimilarSession {
  sessionId: string;
  partnerName: string;
  similarity: number;
}

export interface SimilarMessage {
  messageId: string;
  sessionId: string;
  content: string;
  similarity: number;
}

// ============================================================================
// Session Embeddings
// ============================================================================

/**
 * Generate a text summary for a session to embed.
 * Combines partner name, topic, and recent context.
 */
function buildSessionEmbeddingText(session: SessionSummary): string {
  const parts: string[] = [];

  parts.push(`Session with ${session.partnerName}`);

  if (session.topic) {
    parts.push(`Topic: ${session.topic}`);
  }

  if (session.recentContext) {
    parts.push(`Recent: ${session.recentContext}`);
  }

  parts.push(`Status: ${session.status}`);

  return parts.join('. ');
}

/**
 * Generate and store embedding for a user's session vessel.
 * This embeds the session summary for semantic search.
 */
export async function embedSessionVessel(
  sessionId: string,
  userId: string
): Promise<boolean> {
  console.log('[Embedding] Starting embedSessionVessel for session:', sessionId);

  // Get session details
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: { include: { user: true } },
        },
      },
      userVessels: {
        where: { userId },
        include: {
          documents: {
            where: { type: 'INITIAL_CONTEXT' },
            take: 1,
          },
        },
      },
      messages: {
        where: { senderId: userId },
        orderBy: { timestamp: 'desc' },
        take: 3,
        select: { content: true },
      },
    },
  });

  if (!session) {
    console.warn(`[Embedding] Session ${sessionId} not found`);
    return false;
  }

  const vessel = session.userVessels[0];
  if (!vessel) {
    console.warn(`[Embedding] No vessel found for user ${userId} in session ${sessionId}`);
    return false;
  }

  // Build session summary
  const partner = session.relationship.members.find((m) => m.userId !== userId);
  const myMember = session.relationship.members.find((m) => m.userId === userId);
  // Partner name: use partner's actual name if they've joined,
  // otherwise use the nickname I gave them when creating the session
  const partnerName =
    partner?.user.firstName ||
    partner?.user.name ||
    partner?.nickname ||
    myMember?.nickname ||
    'Unknown';
  const topic = vessel.documents[0]?.content;
  const recentContext = session.messages.map((m) => m.content).join(' ');

  const summary: SessionSummary = {
    id: sessionId,
    partnerName,
    topic,
    recentContext: recentContext.slice(0, 500), // Limit context length
    status: session.status,
  };

  const embeddingText = buildSessionEmbeddingText(summary);

  // Generate embedding
  const embedding = await getEmbedding(embeddingText);
  if (!embedding) {
    console.warn(`[Embedding] Failed to generate embedding for session ${sessionId}`);
    return false;
  }

  // Store embedding using raw SQL (Prisma doesn't support vector types directly)
  await prisma.$executeRaw`
    UPDATE "UserVessel"
    SET embedding = ${vectorToSql(embedding)}::vector
    WHERE id = ${vessel.id}
  `;

  console.log(`[Embedding] Embedded session vessel ${vessel.id}`);
  return true;
}

// ============================================================================
// Message Embeddings
// ============================================================================

/**
 * Generate and store embedding for a message.
 */
export async function embedMessage(messageId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, content: true },
  });

  if (!message) {
    console.warn(`[Embedding] Message ${messageId} not found`);
    return false;
  }

  const embedding = await getEmbedding(message.content);
  if (!embedding) {
    console.warn(`[Embedding] Failed to generate embedding for message ${messageId}`);
    return false;
  }

  await prisma.$executeRaw`
    UPDATE "Message"
    SET embedding = ${vectorToSql(embedding)}::vector
    WHERE id = ${messageId}
  `;

  return true;
}

/**
 * Embed multiple messages in batch.
 */
export async function embedMessages(messageIds: string[]): Promise<number> {
  let successCount = 0;

  // Process in parallel with concurrency limit
  const batchSize = 5;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((id) => embedMessage(id)));
    successCount += results.filter(Boolean).length;
  }

  return successCount;
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Find sessions similar to the given query text.
 * Searches across all of a user's session vessels.
 */
export async function findSimilarSessions(
  userId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.7 // Cosine similarity threshold (0-1, higher = more similar)
): Promise<SimilarSession[]> {
  console.log('[Embedding] findSimilarSessions - generating query embedding');
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
    console.warn('[Embedding] Failed to generate query embedding (Bedrock not configured?)');
    return [];
  }
  console.log('[Embedding] Query embedding generated, dimensions:', queryEmbedding.length);

  // Query using cosine similarity
  // Note: pgvector uses <=> for cosine distance (0 = identical, 2 = opposite)
  // We convert to similarity: 1 - (distance / 2)
  // The query handles both:
  // 1. Partner has joined: use their actual name
  // 2. Partner hasn't joined: use the nickname stored on the inviter's membership
  const results = await prisma.$queryRaw<
    Array<{ session_id: string; partner_name: string; distance: number }>
  >`
    SELECT
      s.id as session_id,
      COALESCE(partner_user.name, partner_member.nickname, my_member.nickname, 'Unknown') as partner_name,
      uv.embedding <=> ${vectorToSql(queryEmbedding)}::vector as distance
    FROM "UserVessel" uv
    JOIN "Session" s ON uv."sessionId" = s.id
    JOIN "Relationship" r ON s."relationshipId" = r.id
    JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
    LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
    LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
    WHERE uv."userId" = ${userId}
      AND uv.embedding IS NOT NULL
      AND s.status NOT IN ('ABANDONED', 'RESOLVED')
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  // Convert distance to similarity and filter by threshold
  return results
    .map((r) => ({
      sessionId: r.session_id,
      partnerName: r.partner_name,
      similarity: 1 - r.distance / 2, // Convert cosine distance to similarity
    }))
    .filter((r) => r.similarity >= threshold);
}

/**
 * Find messages similar to the given query text within a session.
 */
export async function findSimilarMessages(
  sessionId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.6
): Promise<SimilarMessage[]> {
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
    return [];
  }

  const results = await prisma.$queryRaw<
    Array<{ id: string; session_id: string; content: string; distance: number }>
  >`
    SELECT
      m.id,
      m."sessionId" as session_id,
      m.content,
      m.embedding <=> ${vectorToSql(queryEmbedding)}::vector as distance
    FROM "Message" m
    WHERE m."sessionId" = ${sessionId}
      AND m.embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results
    .map((r) => ({
      messageId: r.id,
      sessionId: r.session_id,
      content: r.content,
      similarity: 1 - r.distance / 2,
    }))
    .filter((r) => r.similarity >= threshold);
}

/**
 * Find sessions where the partner name or topic matches semantically.
 * Used by the chat router to find relevant sessions.
 */
export async function findRelevantSessions(
  userId: string,
  userMessage: string,
  limit: number = 3
): Promise<SimilarSession[]> {
  console.log('[Embedding] findRelevantSessions for:', userMessage.slice(0, 50));

  // First try vector search
  const vectorResults = await findSimilarSessions(userId, userMessage, limit, 0.5);

  console.log('[Embedding] Vector search results:', vectorResults.length);

  // If we have good matches, return them
  if (vectorResults.length > 0) {
    return vectorResults;
  }

  // Fallback: No embeddings available, return empty
  // The chat router will use name-based matching from its session list
  return [];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a number array to SQL vector format.
 * pgvector expects format: '[1.0, 2.0, 3.0, ...]'
 */
function vectorToSql(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Check if embeddings are enabled (Bedrock credentials available).
 */
export async function isEmbeddingEnabled(): Promise<boolean> {
  const testEmbedding = await getEmbedding('test');
  return testEmbedding !== null;
}
