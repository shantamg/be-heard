/**
 * Conversation Summarizer Service
 *
 * Generates rolling summaries of long conversations to maintain context
 * without exceeding token limits. Uses fire-and-forget pattern for non-blocking
 * summarization.
 *
 * Strategy:
 * - When a conversation exceeds a threshold (e.g., 30 messages), summarize older portions
 * - Store summaries in the session/vessel for retrieval
 * - New prompts get: [Summary of older messages] + [Recent full messages] + [Retrieved context]
 */

import { prisma } from '../lib/prisma';
import { getHaikuJson } from '../lib/bedrock';
import { estimateTokens } from '../utils/token-budget';

// ============================================================================
// Types
// ============================================================================

export interface ConversationSummary {
  /** Summary text covering older messages */
  text: string;

  /** Number of messages summarized */
  messageCount: number;

  /** Timestamp of the oldest message included */
  oldestMessageAt: Date;

  /** Timestamp of the newest message included */
  newestMessageAt: Date;

  /** Token count of the summary */
  tokenCount: number;

  /** When this summary was generated */
  generatedAt: Date;
}

export interface SummarizationResult {
  summary: string;
  keyThemes: string[];
  emotionalJourney: string;
  unresolvedTopics: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for when to trigger summarization
 */
export const SUMMARIZATION_CONFIG = {
  /** Minimum messages before summarization kicks in */
  minMessagesForSummary: 30,

  /** How many recent messages to keep in full (not summarized) */
  recentMessagesToKeep: 15,

  /** Target token count for summaries */
  targetSummaryTokens: 500,

  /** How often to re-summarize (every N new messages after initial summary) */
  resummaryInterval: 20,
};

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate a summary of conversation messages using Haiku.
 * Designed for quick execution with structured output.
 */
async function generateConversationSummary(
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
  userName: string,
  partnerName: string,
  stage: number
): Promise<SummarizationResult | null> {
  if (messages.length === 0) {
    return null;
  }

  // Build conversation text
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? userName : 'MWF'}: ${m.content}`)
    .join('\n\n');

  const stageContext = getStageContext(stage);

  const systemPrompt = `You are summarizing a conflict resolution conversation to preserve context for an AI assistant.

STAGE CONTEXT: ${stageContext}

OUTPUT FORMAT (JSON):
{
  "summary": "2-3 paragraph narrative summary capturing the emotional journey and key points discussed",
  "keyThemes": ["theme1", "theme2", ...],
  "emotionalJourney": "One sentence describing how the user's emotional state evolved",
  "unresolvedTopics": ["topic1", "topic2", ...]
}

GUIDELINES:
- Capture the emotional tone, not just facts
- Note any patterns or recurring concerns
- Identify what seems unresolved or needs follow-up
- Write the summary as if briefing a therapist who will continue the session
- Keep the summary under 500 words`;

  const userPrompt = `Summarize this conversation between ${userName} and Meet Without Fear:

${conversationText}`;

  const result = await getHaikuJson<SummarizationResult>({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 800,
  });

  return result;
}

function getStageContext(stage: number): string {
  switch (stage) {
    case 0:
      return 'Invitation crafting - user is preparing to invite their partner';
    case 1:
      return 'Witnessing - user is sharing their experience and being heard';
    case 2:
      return 'Perspective Stretch - user is trying to understand their partner\'s viewpoint';
    case 3:
      return 'Need Mapping - user is identifying underlying needs';
    case 4:
      return 'Strategic Repair - user is designing experiments and agreements';
    default:
      return 'Ongoing conversation';
  }
}

// ============================================================================
// Session Summarization
// ============================================================================

/**
 * Check if a session needs summarization based on message count.
 */
export function needsSummarization(messageCount: number, existingSummary?: string): boolean {
  if (messageCount < SUMMARIZATION_CONFIG.minMessagesForSummary) {
    return false;
  }

  // If no summary exists yet, we need one
  if (!existingSummary) {
    return true;
  }

  // Check if we've accumulated enough new messages since last summary
  // This would require tracking when the summary was made
  // For simplicity, we re-summarize every resummaryInterval messages beyond the threshold
  const messagesOverThreshold = messageCount - SUMMARIZATION_CONFIG.minMessagesForSummary;
  return messagesOverThreshold % SUMMARIZATION_CONFIG.resummaryInterval === 0;
}

/**
 * Summarize older messages in a session and update the vessel.
 * Call this as fire-and-forget: updateSessionSummary(sessionId, userId).catch(console.warn)
 */
export async function updateSessionSummary(
  sessionId: string,
  userId: string
): Promise<ConversationSummary | null> {
  try {
    // Get session with messages and vessel
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          where: {
            OR: [{ senderId: userId }, { role: 'AI' }],
          },
          orderBy: { timestamp: 'asc' },
        },
        relationship: {
          include: {
            members: {
              include: { user: true },
            },
          },
        },
        userVessels: {
          where: { userId },
        },
        stageProgress: {
          where: { userId },
          orderBy: { stage: 'desc' },
          take: 1,
        },
      },
    });

    if (!session || !session.userVessels[0]) {
      return null;
    }

    const vessel = session.userVessels[0];
    const messageCount = session.messages.length;

    // Check if we actually need to summarize
    const existingSummary = vessel.conversationSummary as string | null;
    if (!needsSummarization(messageCount, existingSummary ?? undefined)) {
      return null;
    }

    // Get user and partner names
    const currentMember = session.relationship.members.find((m) => m.userId === userId);
    const partnerMember = session.relationship.members.find((m) => m.userId !== userId);
    const userName = currentMember?.user.name || currentMember?.user.firstName || 'User';
    const partnerName = partnerMember?.user.name || partnerMember?.nickname || 'Partner';

    // Get current stage
    const stage = session.stageProgress[0]?.stage ?? 1;

    // Determine which messages to summarize (older ones, keeping recent in full)
    const messagesToSummarize = session.messages.slice(
      0,
      -SUMMARIZATION_CONFIG.recentMessagesToKeep
    );

    if (messagesToSummarize.length < 10) {
      // Not enough old messages to summarize
      return null;
    }

    // Generate summary
    const summaryResult = await generateConversationSummary(
      messagesToSummarize.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
        timestamp: m.timestamp,
      })),
      userName,
      partnerName,
      stage
    );

    if (!summaryResult) {
      return null;
    }

    // Build the stored summary object
    const summary: ConversationSummary = {
      text: summaryResult.summary,
      messageCount: messagesToSummarize.length,
      oldestMessageAt: messagesToSummarize[0].timestamp,
      newestMessageAt: messagesToSummarize[messagesToSummarize.length - 1].timestamp,
      tokenCount: estimateTokens(summaryResult.summary),
      generatedAt: new Date(),
    };

    // Store in vessel
    await prisma.userVessel.update({
      where: { id: vessel.id },
      data: {
        conversationSummary: JSON.stringify({
          ...summary,
          keyThemes: summaryResult.keyThemes,
          emotionalJourney: summaryResult.emotionalJourney,
          unresolvedTopics: summaryResult.unresolvedTopics,
        }),
      },
    });

    console.log(
      `[ConversationSummarizer] Summarized ${messagesToSummarize.length} messages for session ${sessionId}`
    );

    return summary;
  } catch (error) {
    console.error('[ConversationSummarizer] Failed to summarize session:', error);
    return null;
  }
}

// ============================================================================
// Summary Retrieval
// ============================================================================

/**
 * Get the conversation summary for a session vessel, if one exists.
 */
export async function getSessionSummary(
  sessionId: string,
  userId: string
): Promise<{
  summary: ConversationSummary;
  keyThemes: string[];
  emotionalJourney: string;
  unresolvedTopics: string[];
} | null> {
  const vessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: { userId, sessionId },
    },
    select: { conversationSummary: true },
  });

  if (!vessel?.conversationSummary) {
    return null;
  }

  try {
    const parsed = JSON.parse(vessel.conversationSummary as string);
    return {
      summary: {
        text: parsed.text,
        messageCount: parsed.messageCount,
        oldestMessageAt: new Date(parsed.oldestMessageAt),
        newestMessageAt: new Date(parsed.newestMessageAt),
        tokenCount: parsed.tokenCount,
        generatedAt: new Date(parsed.generatedAt),
      },
      keyThemes: parsed.keyThemes || [],
      emotionalJourney: parsed.emotionalJourney || '',
      unresolvedTopics: parsed.unresolvedTopics || [],
    };
  } catch {
    return null;
  }
}

/**
 * Format a conversation summary for prompt injection.
 */
export function formatSummaryForPrompt(
  summaryData: {
    summary: ConversationSummary;
    keyThemes: string[];
    emotionalJourney: string;
    unresolvedTopics: string[];
  }
): string {
  const parts: string[] = [];

  parts.push('[CONVERSATION SUMMARY - Earlier messages condensed]');
  parts.push(summaryData.summary.text);

  if (summaryData.keyThemes.length > 0) {
    parts.push(`\nKey themes: ${summaryData.keyThemes.join(', ')}`);
  }

  if (summaryData.emotionalJourney) {
    parts.push(`Emotional journey: ${summaryData.emotionalJourney}`);
  }

  if (summaryData.unresolvedTopics.length > 0) {
    parts.push(`Topics that may need follow-up: ${summaryData.unresolvedTopics.join(', ')}`);
  }

  parts.push(`\n[Summary covers ${summaryData.summary.messageCount} earlier messages]`);

  return parts.join('\n');
}
