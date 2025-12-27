import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiResponse, ErrorCode } from '@be-heard/shared';
import { NotFoundError, ValidationError } from '../middleware/errors';

// Validation schemas aligned with shared types
const recordEmotionSchema = z.object({
  intensity: z.number().int().min(1, 'Intensity must be at least 1').max(10, 'Intensity must be at most 10'),
  context: z.string().max(500, 'Context too long').optional(),
});

const completeExerciseSchema = z.object({
  type: z.enum(['BREATHING_EXERCISE', 'BODY_SCAN', 'GROUNDING', 'PAUSE_SESSION']),
  intensityBefore: z.number().int().min(1).max(10).optional(),
  intensityAfter: z.number().int().min(1).max(10).optional(),
});

// Response types
interface EmotionalReadingResponse {
  id: string;
  intensity: number;
  timestamp: Date;
}

interface RecordEmotionData {
  reading: EmotionalReadingResponse;
  suggestExercise: boolean;
}

interface ReadingItem {
  id: string;
  intensity: number;
  context: string | null;
  stage: number;
  timestamp: Date;
}

interface GetEmotionsData {
  readings: ReadingItem[];
}

interface ExerciseCompletionData {
  logged: boolean;
  completion: {
    id: string;
    type: string;
    completedAt: Date;
    intensityDelta: number | null;
  };
}

/**
 * POST /sessions/:id/emotions
 * Record an emotional reading for the current user in a session
 */
export async function recordEmotion(req: Request, res: Response): Promise<void> {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  // Validate request body
  const parseResult = recordEmotionSchema.safeParse(req.body);
  if (!parseResult.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid request body',
        details: parseResult.error.flatten(),
      },
    };
    res.status(400).json(response);
    return;
  }

  const { intensity, context } = parseResult.data;

  try {
    // Get user's vessel for this session
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });

    if (!vessel) {
      const response: ApiResponse<never> = {
        success: false,
        error: { code: ErrorCode.NOT_FOUND, message: 'Session not found or you are not a participant' },
      };
      res.status(404).json(response);
      return;
    }

    // Get current stage (if any in progress)
    const progress = await prisma.stageProgress.findFirst({
      where: { sessionId, userId, status: 'IN_PROGRESS' },
      orderBy: { stage: 'desc' },
    });

    // Create emotional reading
    const reading = await prisma.emotionalReading.create({
      data: {
        vesselId: vessel.id,
        intensity,
        context: context ?? null,
        stage: progress?.stage ?? 0,
      },
    });

    // Check if intervention is needed (intensity >= 8)
    const needsIntervention = intensity >= 8;

    const response: ApiResponse<RecordEmotionData> = {
      success: true,
      data: {
        reading: {
          id: reading.id,
          intensity: reading.intensity,
          timestamp: reading.timestamp,
        },
        suggestExercise: needsIntervention,
      },
    };
    res.json(response);
  } catch (error) {
    console.error('Error recording emotion:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to record emotion' },
    };
    res.status(500).json(response);
  }
}

/**
 * GET /sessions/:id/emotions
 * Get emotion history for the current user in a session
 */
export async function getEmotions(req: Request, res: Response): Promise<void> {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  try {
    // Get user's vessel for this session
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });

    if (!vessel) {
      const response: ApiResponse<never> = {
        success: false,
        error: { code: ErrorCode.NOT_FOUND, message: 'Session not found or you are not a participant' },
      };
      res.status(404).json(response);
      return;
    }

    // Get readings (only user's own readings for privacy)
    const readings = await prisma.emotionalReading.findMany({
      where: { vesselId: vessel.id },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const response: ApiResponse<GetEmotionsData> = {
      success: true,
      data: {
        readings: readings.map((r) => ({
          id: r.id,
          intensity: r.intensity,
          context: r.context,
          stage: r.stage,
          timestamp: r.timestamp,
        })),
      },
    };
    res.json(response);
  } catch (error) {
    console.error('Error getting emotions:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to get emotions' },
    };
    res.status(500).json(response);
  }
}

/**
 * POST /sessions/:id/exercises/complete
 * Log completion of an emotional regulation exercise
 */
export async function completeExercise(req: Request, res: Response): Promise<void> {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  // Validate request body
  const parseResult = completeExerciseSchema.safeParse(req.body);
  if (!parseResult.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid request body',
        details: parseResult.error.flatten(),
      },
    };
    res.status(400).json(response);
    return;
  }

  const { type, intensityBefore, intensityAfter } = parseResult.data;

  try {
    // Verify user is participant in session
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });

    if (!vessel) {
      const response: ApiResponse<never> = {
        success: false,
        error: { code: ErrorCode.NOT_FOUND, message: 'Session not found or you are not a participant' },
      };
      res.status(404).json(response);
      return;
    }

    // Log exercise completion
    const completion = await prisma.emotionalExerciseCompletion.create({
      data: {
        sessionId,
        userId,
        type,
        intensityBefore: intensityBefore ?? null,
        intensityAfter: intensityAfter ?? null,
      },
    });

    const response: ApiResponse<ExerciseCompletionData> = {
      success: true,
      data: {
        logged: true,
        completion: {
          id: completion.id,
          type: completion.type,
          completedAt: completion.completedAt,
          intensityDelta:
            intensityBefore != null && intensityAfter != null
              ? intensityBefore - intensityAfter
              : null,
        },
      },
    };
    res.json(response);
  } catch (error) {
    console.error('Error completing exercise:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to log exercise completion' },
    };
    res.status(500).json(response);
  }
}
