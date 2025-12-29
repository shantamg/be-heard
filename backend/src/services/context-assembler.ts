/**
 * Context Assembler Service
 *
 * Builds stage-scoped context bundles for the AI.
 * The AI receives pre-assembled context - it does NOT decide what to retrieve.
 *
 * From architecture docs:
 * "The large model receives a pre-assembled context bundle. It does not decide what to retrieve."
 */

import { prisma } from '../lib/prisma';
import {
  type MemoryIntentResult,
  type RetrievalDepth,
  getTurnBufferSize,
} from './memory-intent';

// ============================================================================
// Types
// ============================================================================

/**
 * A message in the conversation context
 */
export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Emotional thread tracking for continuity
 */
export interface EmotionalThread {
  initialIntensity: number | null;
  currentIntensity: number | null;
  trend: 'escalating' | 'stable' | 'de-escalating' | 'unknown';
  notableShifts: Array<{
    turn: number;
    from: number;
    to: number;
    triggerSummary?: string;
  }>;
}

/**
 * Session summary for long sessions (>30 min)
 */
export interface SessionSummary {
  keyThemes: string[];
  emotionalJourney: string;
  currentFocus: string;
  userStatedGoals: string[];
}

/**
 * Prior themes from previous sessions in this relationship
 */
export interface PriorThemes {
  themes: string[];
  lastSessionDate: string | null;
  sessionCount: number;
}

/**
 * The assembled context bundle provided to the AI
 */
export interface ContextBundle {
  // Conversation context
  conversationContext: {
    recentTurns: ContextMessage[];
    turnCount: number;
    sessionDurationMinutes: number;
  };

  // Emotional state
  emotionalThread: EmotionalThread;

  // Prior session context (if depth allows)
  priorThemes?: PriorThemes;

  // Session summary (for long sessions)
  sessionSummary?: SessionSummary;

  // Stage-specific data
  stageContext: {
    stage: number;
    gatesSatisfied: Record<string, unknown>;
  };

  // User info
  userName: string;
  partnerName?: string;

  // Metadata
  intent: MemoryIntentResult;
  assembledAt: string;
}

// ============================================================================
// Context Assembly
// ============================================================================

/**
 * Assemble a context bundle for the AI based on the memory intent.
 */
export async function assembleContextBundle(
  sessionId: string,
  userId: string,
  stage: number,
  intent: MemoryIntentResult
): Promise<ContextBundle> {
  const now = new Date();
  const depth = intent.depth;

  // Get session and user info
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: { user: true },
          },
        },
      },
      stageProgress: {
        where: { userId },
        orderBy: { stage: 'desc' },
        take: 1,
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Get user and partner names
  const currentMember = session.relationship.members.find((m) => m.userId === userId);
  const partnerMember = session.relationship.members.find((m) => m.userId !== userId);
  const userName = currentMember?.user.name || 'there';
  const partnerName = partnerMember?.user.name || 'your partner';

  // Get stage progress
  const progress = session.stageProgress[0];
  const gatesSatisfied = (progress?.gatesSatisfied as Record<string, unknown>) || {};

  // Build conversation context based on depth
  const turnBufferSize = getTurnBufferSize(stage, intent.intent);
  const conversationContext = await buildConversationContext(
    sessionId,
    userId,
    turnBufferSize,
    depth
  );

  // Build emotional thread
  const emotionalThread = await buildEmotionalThread(sessionId, userId, depth);

  // Build prior themes (if depth allows)
  const priorThemes = depth === 'full' || depth === 'light'
    ? await buildPriorThemes(sessionId, userId, session.relationshipId)
    : undefined;

  // Build session summary (for long sessions, if depth allows)
  const sessionDurationMinutes = Math.floor(
    (now.getTime() - session.createdAt.getTime()) / 60000
  );
  const sessionSummary = sessionDurationMinutes >= 30 && depth !== 'none'
    ? await buildSessionSummary(sessionId, userId)
    : undefined;

  return {
    conversationContext: {
      recentTurns: conversationContext,
      turnCount: conversationContext.length,
      sessionDurationMinutes,
    },
    emotionalThread,
    priorThemes,
    sessionSummary,
    stageContext: {
      stage,
      gatesSatisfied,
    },
    userName,
    partnerName,
    intent,
    assembledAt: now.toISOString(),
  };
}

/**
 * Build conversation context with recent messages
 */
async function buildConversationContext(
  sessionId: string,
  userId: string,
  bufferSize: number,
  depth: RetrievalDepth
): Promise<ContextMessage[]> {
  if (depth === 'none' || bufferSize === 0) {
    return [];
  }

  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      // Only get messages from this user's conversation (not partner's Stage 1)
      OR: [
        { senderId: userId },
        { senderId: null }, // AI messages have null senderId in some schemas
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: bufferSize * 2, // Get more to account for both user and assistant
    select: {
      content: true,
      role: true,
      timestamp: true,
    },
  });

  // Reverse to chronological order
  const chronological = messages.reverse();

  // Take last N turns (user + assistant pairs)
  const recentTurns = chronological.slice(-bufferSize * 2);

  return recentTurns.map((m) => ({
    role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
  }));
}

/**
 * Build emotional thread tracking
 */
async function buildEmotionalThread(
  sessionId: string,
  userId: string,
  depth: RetrievalDepth
): Promise<EmotionalThread> {
  if (depth === 'none') {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  // Get the user's vessel for this session
  const vessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: {
        userId,
        sessionId,
      },
    },
    select: { id: true },
  });

  if (!vessel) {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  // Get emotional readings from the vessel
  const readings = await prisma.emotionalReading.findMany({
    where: {
      vesselId: vessel.id,
    },
    orderBy: { timestamp: 'asc' },
    select: {
      intensity: true,
      timestamp: true,
    },
  });

  if (readings.length === 0) {
    return {
      initialIntensity: null,
      currentIntensity: null,
      trend: 'unknown',
      notableShifts: [],
    };
  }

  const initialIntensity = readings[0].intensity;
  const currentIntensity = readings[readings.length - 1].intensity;

  // Calculate trend
  let trend: EmotionalThread['trend'] = 'stable';
  if (readings.length >= 2) {
    const recent = readings.slice(-3);
    const avgRecent = recent.reduce((sum, r) => sum + r.intensity, 0) / recent.length;
    const earlier = readings.slice(0, Math.min(3, readings.length));
    const avgEarlier = earlier.reduce((sum, r) => sum + r.intensity, 0) / earlier.length;

    if (avgRecent - avgEarlier >= 2) {
      trend = 'escalating';
    } else if (avgEarlier - avgRecent >= 2) {
      trend = 'de-escalating';
    }
  }

  // Find notable shifts (changes of 3+ points)
  const notableShifts: EmotionalThread['notableShifts'] = [];
  for (let i = 1; i < readings.length && notableShifts.length < 3; i++) {
    const diff = Math.abs(readings[i].intensity - readings[i - 1].intensity);
    if (diff >= 3) {
      notableShifts.push({
        turn: i,
        from: readings[i - 1].intensity,
        to: readings[i].intensity,
      });
    }
  }

  return {
    initialIntensity,
    currentIntensity,
    trend,
    notableShifts,
  };
}

/**
 * Build prior themes from previous sessions in this relationship
 */
async function buildPriorThemes(
  sessionId: string,
  userId: string,
  relationshipId: string
): Promise<PriorThemes> {
  // Get previous completed sessions in this relationship
  const previousSessions = await prisma.session.findMany({
    where: {
      relationshipId,
      id: { not: sessionId },
      status: 'RESOLVED',
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: {
      id: true,
      updatedAt: true,
    },
  });

  if (previousSessions.length === 0) {
    return {
      themes: [],
      lastSessionDate: null,
      sessionCount: 0,
    };
  }

  // For now, return placeholder - will be populated by need extraction later
  // This would come from UserVessel needs/themes in full implementation
  return {
    themes: [], // TODO: Extract from UserVessel
    lastSessionDate: previousSessions[0].updatedAt.toISOString(),
    sessionCount: previousSessions.length,
  };
}

/**
 * Build session summary for long sessions
 */
async function buildSessionSummary(
  sessionId: string,
  userId: string
): Promise<SessionSummary | undefined> {
  // For now, return undefined - will be built by Haiku summarization in full implementation
  // This requires a separate AI call to summarize the session

  // TODO: Implement with Haiku summarization
  return undefined;
}

/**
 * Format context bundle for prompt injection
 */
export function formatContextForPrompt(bundle: ContextBundle): string {
  const parts: string[] = [];

  // Recent conversation
  if (bundle.conversationContext.recentTurns.length > 0) {
    parts.push('RECENT CONVERSATION:');
    for (const turn of bundle.conversationContext.recentTurns) {
      const role = turn.role === 'user' ? bundle.userName : 'Meet Without Fear';
      parts.push(`${role}: "${turn.content}"`);
    }
    parts.push('');
  }

  // Emotional thread
  if (bundle.emotionalThread.currentIntensity !== null) {
    parts.push(`EMOTIONAL STATE:`);
    parts.push(`Current intensity: ${bundle.emotionalThread.currentIntensity}/10`);
    parts.push(`Trend: ${bundle.emotionalThread.trend}`);
    if (bundle.emotionalThread.notableShifts.length > 0) {
      parts.push(`Notable shifts: ${bundle.emotionalThread.notableShifts.map(
        (s) => `${s.from} → ${s.to}`
      ).join(', ')}`);
    }
    parts.push('');
  }

  // Prior themes
  if (bundle.priorThemes && bundle.priorThemes.themes.length > 0) {
    parts.push(`FROM PRIOR SESSIONS (use for continuity only):`);
    parts.push(bundle.priorThemes.themes.join(', '));
    parts.push('');
  }

  // Session summary
  if (bundle.sessionSummary) {
    parts.push(`SESSION SUMMARY:`);
    parts.push(`Key themes: ${bundle.sessionSummary.keyThemes.join(', ')}`);
    parts.push(`Current focus: ${bundle.sessionSummary.currentFocus}`);
    parts.push('');
  }

  return parts.join('\n');
}
