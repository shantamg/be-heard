/**
 * Inner Work Controller
 *
 * Handles inner work (solo self-reflection) session operations:
 * - POST /inner-work - Create new inner work session
 * - GET /inner-work - List inner work sessions
 * - GET /inner-work/:id - Get inner work session with messages
 * - POST /inner-work/:id/messages - Send message and get AI response
 * - PATCH /inner-work/:id - Update session (title, status)
 * - DELETE /inner-work/:id - Archive session
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser, AuthUser } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errors';
import {
  ApiResponse,
  InnerWorkSessionSummaryDTO,
  InnerWorkSessionDetailDTO,
  InnerWorkMessageDTO,
  CreateInnerWorkSessionResponse,
  ListInnerWorkSessionsResponse,
  GetInnerWorkSessionResponse,
  SendInnerWorkMessageResponse,
  UpdateInnerWorkSessionResponse,
  ArchiveInnerWorkSessionResponse,
  InnerWorkStatus,
  createInnerWorkSessionRequestSchema,
  sendInnerWorkMessageRequestSchema,
  updateInnerWorkSessionRequestSchema,
  listInnerWorkSessionsQuerySchema,
} from '@meet-without-fear/shared';
import { getCompletion, getHaikuJson } from '../lib/bedrock';
import { buildInnerWorkPrompt, buildInnerWorkInitialMessagePrompt, buildInnerWorkSummaryPrompt } from '../services/stage-prompts';
import { extractJsonSafe } from '../utils/json-extractor';
import { embedInnerWorkMessage } from '../services/embedding';

// ============================================================================
// Helper Functions
// ============================================================================

function mapSessionToSummary(
  session: {
    id: string;
    title: string | null;
    summary: string | null;
    theme: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    _count?: { messages: number };
  }
): InnerWorkSessionSummaryDTO {
  return {
    id: session.id,
    title: session.title,
    summary: session.summary,
    theme: session.theme,
    status: session.status as InnerWorkStatus,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount: session._count?.messages ?? 0,
  };
}

function mapMessageToDTO(message: {
  id: string;
  role: string;
  content: string;
  timestamp: Date;
}): InnerWorkMessageDTO {
  return {
    id: message.id,
    role: message.role as 'USER' | 'AI',
    content: message.content,
    timestamp: message.timestamp.toISOString(),
  };
}

/**
 * Get recent themes from user's inner work sessions for context.
 */
async function getRecentThemes(userId: string, excludeSessionId?: string): Promise<string[]> {
  const recentSessions = await prisma.innerWorkSession.findMany({
    where: {
      userId,
      theme: { not: null },
      id: excludeSessionId ? { not: excludeSessionId } : undefined,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { theme: true },
  });

  return recentSessions
    .map((s) => s.theme)
    .filter((t): t is string => t !== null);
}

/**
 * Generate and update session metadata (title, summary, theme) after new messages.
 * Uses Haiku for fast, non-blocking updates on every message.
 */
async function updateSessionMetadata(sessionId: string): Promise<void> {
  try {
    const session = await prisma.innerWorkSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          take: 20, // Last 20 messages for context
        },
      },
    });

    if (!session || session.messages.length < 2) {
      // Need at least a user message to summarize
      return;
    }

    const prompt = buildInnerWorkSummaryPrompt(
      session.messages.map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }))
    );

    const parsed = await getHaikuJson<{ title?: string; summary?: string; theme?: string }>({
      systemPrompt: prompt,
      messages: [{ role: 'user', content: 'Generate the metadata.' }],
      maxTokens: 256,
    });

    if (parsed && (parsed.title || parsed.summary || parsed.theme)) {
      await prisma.innerWorkSession.update({
        where: { id: sessionId },
        data: {
          title: parsed.title || session.title,
          summary: parsed.summary || session.summary,
          theme: parsed.theme || session.theme,
        },
      });
    }
  } catch (error) {
    console.error('[Inner Work] Failed to update metadata:', error);
    // Non-fatal - don't throw
  }
}

// ============================================================================
// POST /inner-work - Create new inner work session
// ============================================================================

export const createInnerWorkSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    // Validate request body
    const parseResult = createInnerWorkSessionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { title } = parseResult.data;

    // Create the session
    const session = await prisma.innerWorkSession.create({
      data: {
        userId: user.id,
        title,
        status: 'ACTIVE',
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    // Generate initial AI message
    const userName = user.firstName || user.name || 'there';
    const prompt = buildInnerWorkInitialMessagePrompt(userName);
    const aiResponse = await getCompletion({
      systemPrompt: prompt,
      messages: [{ role: 'user', content: 'Start the conversation.' }],
      maxTokens: 256,
    });
    const parsed = extractJsonSafe<{ response?: string }>(aiResponse || '', {
      response: "Hey there. What's on your mind today?",
    });

    const aiMessage = await prisma.innerWorkMessage.create({
      data: {
        sessionId: session.id,
        role: 'AI',
        content: parsed.response || "Hey there. What's on your mind today?",
      },
    });

    // Embed the initial message (non-blocking)
    embedInnerWorkMessage(aiMessage.id).catch((err) =>
      console.warn('[Inner Work] Failed to embed initial message:', err)
    );

    const response: ApiResponse<CreateInnerWorkSessionResponse> = {
      success: true,
      data: {
        session: mapSessionToSummary({ ...session, _count: { messages: 1 } }),
        initialMessage: mapMessageToDTO(aiMessage),
      },
    };

    res.status(201).json(response);
  }
);

// ============================================================================
// GET /inner-work - List inner work sessions
// ============================================================================

export const listInnerWorkSessions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    // Validate query params
    const parseResult = listInnerWorkSessionsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { status, limit, offset } = parseResult.data;

    const sessions = await prisma.innerWorkSession.findMany({
      where: {
        userId: user.id,
        status: status || { not: 'ARCHIVED' }, // Default: exclude archived
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: { select: { messages: true } },
      },
    });

    const response: ApiResponse<ListInnerWorkSessionsResponse> = {
      success: true,
      data: {
        sessions: sessions.map(mapSessionToSummary),
      },
    };

    res.json(response);
  }
);

// ============================================================================
// GET /inner-work/:id - Get inner work session with messages
// ============================================================================

export const getInnerWorkSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const sessionId = req.params.id;

    const session = await prisma.innerWorkSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!session) {
      throw new ValidationError('Session not found');
    }

    const detail: InnerWorkSessionDetailDTO = {
      ...mapSessionToSummary(session),
      messages: session.messages.map(mapMessageToDTO),
    };

    const response: ApiResponse<GetInnerWorkSessionResponse> = {
      success: true,
      data: {
        session: detail,
      },
    };

    res.json(response);
  }
);

// ============================================================================
// POST /inner-work/:id/messages - Send message and get AI response
// ============================================================================

export const sendInnerWorkMessage = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const sessionId = req.params.id;

    // Validate request body
    const parseResult = sendInnerWorkMessageRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid message data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { content } = parseResult.data;

    // Verify session exists and belongs to user
    const session = await prisma.innerWorkSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          take: 20, // Last 20 messages for context
        },
      },
    });

    if (!session) {
      throw new ValidationError('Session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new ValidationError('Session is not active');
    }

    // Save user message
    const userMessage = await prisma.innerWorkMessage.create({
      data: {
        sessionId,
        role: 'USER',
        content,
      },
    });

    // Build conversation history
    const history = session.messages.map((m) => ({
      role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    history.push({ role: 'user', content });

    // Get recent themes for context
    const recentThemes = await getRecentThemes(user.id, sessionId);

    // Build prompt and get AI response
    const userName = user.firstName || user.name || 'there';
    const prompt = buildInnerWorkPrompt({
      userName,
      turnCount: session.messages.length + 1,
      emotionalIntensity: 5, // Could be enhanced with intensity detection
      sessionSummary: session.summary || undefined,
      recentThemes: recentThemes.length > 0 ? recentThemes : undefined,
    });

    const fallbackResponse = "I'm here with you. Tell me more about what's on your mind.";
    const aiResponse = await getCompletion({
      systemPrompt: prompt,
      messages: history,
      maxTokens: 1024,
    });
    const parsed = extractJsonSafe<{ response?: string; analysis?: string }>(aiResponse || '', {
      response: fallbackResponse,
    });

    // Use parsed response, never raw JSON
    const aiContent = parsed.response || fallbackResponse;

    // Save AI message
    const aiMessage = await prisma.innerWorkMessage.create({
      data: {
        sessionId,
        role: 'AI',
        content: aiContent,
      },
    });

    // Update session timestamp
    await prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    // Embed messages (non-blocking)
    Promise.all([
      embedInnerWorkMessage(userMessage.id),
      embedInnerWorkMessage(aiMessage.id),
    ]).catch((err) =>
      console.warn('[Inner Work] Failed to embed messages:', err)
    );

    // Update session metadata with Haiku (non-blocking, runs on every message)
    updateSessionMetadata(sessionId).catch((err) =>
      console.warn('[Inner Work] Failed to update metadata:', err)
    );

    const response: ApiResponse<SendInnerWorkMessageResponse> = {
      success: true,
      data: {
        userMessage: mapMessageToDTO(userMessage),
        aiMessage: mapMessageToDTO(aiMessage),
      },
    };

    res.json(response);
  }
);

// ============================================================================
// PATCH /inner-work/:id - Update session (title, status)
// ============================================================================

export const updateInnerWorkSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const sessionId = req.params.id;

    // Validate request body
    const parseResult = updateInnerWorkSessionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid update data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { title, status } = parseResult.data;

    // Verify session exists and belongs to user
    const existing = await prisma.innerWorkSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new ValidationError('Session not found');
    }

    // Update session
    const session = await prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: {
        title: title !== undefined ? title : undefined,
        status: status !== undefined ? status : undefined,
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    const response: ApiResponse<UpdateInnerWorkSessionResponse> = {
      success: true,
      data: {
        session: mapSessionToSummary(session),
      },
    };

    res.json(response);
  }
);

// ============================================================================
// DELETE /inner-work/:id - Archive session
// ============================================================================

export const archiveInnerWorkSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const sessionId = req.params.id;

    // Verify session exists and belongs to user
    const existing = await prisma.innerWorkSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new ValidationError('Session not found');
    }

    // Archive (soft delete)
    const now = new Date();
    await prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: { status: 'ARCHIVED' },
    });

    const response: ApiResponse<ArchiveInnerWorkSessionResponse> = {
      success: true,
      data: {
        archived: true,
        archivedAt: now.toISOString(),
      },
    };

    res.json(response);
  }
);
