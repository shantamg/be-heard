import { Request, Response } from 'express';
import {
  recordEmotion,
  getEmotions,
  completeExercise,
} from '../../controllers/emotions';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    userVessel: {
      findUnique: jest.fn(),
    },
    stageProgress: {
      findFirst: jest.fn(),
    },
    emotionalReading: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    emotionalExerciseCompletion: {
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}): Partial<Request> {
  return {
    user: options.user,
    params: options.params || {},
    body: options.body || {},
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

  return {
    res: {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
  };
}

describe('Emotional Barometer API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions/:id/emotions (recordEmotion)', () => {
    const mockUser = { id: 'user-1', email: 'user@example.com', name: 'Test User' };
    const mockVessel = { id: 'vessel-1', userId: 'user-1', sessionId: 'session-1' };
    const mockReading = {
      id: 'reading-1',
      intensity: 7,
      context: 'Feeling overwhelmed',
      stage: 1,
      timestamp: new Date(),
      vesselId: 'vessel-1',
    };

    it('records emotional reading successfully', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ stage: 1 });
      (prisma.$transaction as jest.Mock).mockResolvedValue([mockReading, {}]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 7, context: 'Feeling overwhelmed' },
      });
      const { res, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            reading: expect.objectContaining({
              id: 'reading-1',
              intensity: 7,
            }),
            suggestExercise: false,
          }),
        })
      );
    });

    it('suggests exercise when intensity is high (>=8)', async () => {
      const highIntensityReading = { ...mockReading, intensity: 8 };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ stage: 1 });
      (prisma.$transaction as jest.Mock).mockResolvedValue([highIntensityReading, {}]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 8, context: 'Very stressed' },
      });
      const { res, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            suggestExercise: true,
          }),
        })
      );
    });

    it('validates intensity must be at least 1', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 0 },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('validates intensity must be at most 10', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 15 },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('validates intensity must be an integer', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 5.5 },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-session' },
        body: { intensity: 5 },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });

    it('uses stage 0 when no stage progress exists', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        { ...mockReading, stage: 0 },
        {},
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 5 },
      });
      const { res, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('allows recording without context', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ stage: 1 });
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        { ...mockReading, context: null },
        {},
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 5 }, // No context provided
      });
      const { res, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('validates context length (max 500)', async () => {
      const longContext = 'x'.repeat(501);
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 5, context: longContext },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/emotions (getEmotions)', () => {
    const mockUser = { id: 'user-1', email: 'user@example.com', name: 'Test User' };
    const mockVessel = { id: 'vessel-1', userId: 'user-1', sessionId: 'session-1' };
    const mockReadings = [
      {
        id: 'reading-1',
        intensity: 7,
        context: 'Feeling overwhelmed',
        stage: 1,
        timestamp: new Date(),
      },
      {
        id: 'reading-2',
        intensity: 5,
        context: null,
        stage: 1,
        timestamp: new Date(Date.now() - 60000),
      },
    ];

    it('returns emotion history for user', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalReading.findMany as jest.Mock).mockResolvedValue(mockReadings);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res, jsonMock } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            readings: expect.arrayContaining([
              expect.objectContaining({
                id: 'reading-1',
                intensity: 7,
              }),
              expect.objectContaining({
                id: 'reading-2',
                intensity: 5,
              }),
            ]),
          }),
        })
      );
    });

    it('only returns users own readings (privacy protection)', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalReading.findMany as jest.Mock).mockResolvedValue(mockReadings);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      // Verify findMany was called with the user's vessel ID
      expect(prisma.emotionalReading.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vesselId: mockVessel.id },
        })
      );
    });

    it('returns empty array when no readings exist', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalReading.findMany as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res, jsonMock } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            readings: [],
          }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-session' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });

    it('returns readings ordered by timestamp descending', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalReading.findMany as jest.Mock).mockResolvedValue(mockReadings);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(prisma.emotionalReading.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('limits readings to 50', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalReading.findMany as jest.Mock).mockResolvedValue(mockReadings);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(prisma.emotionalReading.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('POST /sessions/:id/exercises/complete (completeExercise)', () => {
    const mockUser = { id: 'user-1', email: 'user@example.com', name: 'Test User' };
    const mockVessel = { id: 'vessel-1', userId: 'user-1', sessionId: 'session-1' };
    const mockCompletion = {
      id: 'completion-1',
      sessionId: 'session-1',
      userId: 'user-1',
      type: 'BREATHING_EXERCISE',
      completedAt: new Date(),
      intensityBefore: 8,
      intensityAfter: 5,
    };

    it('logs exercise completion with before/after intensity', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(mockCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BREATHING_EXERCISE',
          intensityBefore: 8,
          intensityAfter: 5,
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            logged: true,
            completion: expect.objectContaining({
              id: 'completion-1',
              type: 'BREATHING_EXERCISE',
              intensityDelta: 3, // 8 - 5 = 3
            }),
          }),
        })
      );
    });

    it('accepts BODY_SCAN exercise type', async () => {
      const bodyScanCompletion = { ...mockCompletion, type: 'BODY_SCAN' };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(bodyScanCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BODY_SCAN',
          intensityBefore: 7,
          intensityAfter: 4,
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            completion: expect.objectContaining({
              type: 'BODY_SCAN',
            }),
          }),
        })
      );
    });

    it('accepts GROUNDING exercise type', async () => {
      const groundingCompletion = { ...mockCompletion, type: 'GROUNDING' };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(groundingCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'GROUNDING',
          intensityBefore: 6,
          intensityAfter: 3,
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            completion: expect.objectContaining({
              type: 'GROUNDING',
            }),
          }),
        })
      );
    });

    it('accepts PAUSE_SESSION exercise type', async () => {
      const pauseCompletion = { ...mockCompletion, type: 'PAUSE_SESSION' };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(pauseCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'PAUSE_SESSION',
          intensityBefore: 9,
          intensityAfter: 6,
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            completion: expect.objectContaining({
              type: 'PAUSE_SESSION',
            }),
          }),
        })
      );
    });

    it('rejects invalid exercise type', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'INVALID_TYPE',
          intensityBefore: 8,
          intensityAfter: 5,
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('allows completion without intensity values', async () => {
      const noIntensityCompletion = {
        ...mockCompletion,
        intensityBefore: null,
        intensityAfter: null,
      };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(noIntensityCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BREATHING_EXERCISE',
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            logged: true,
            completion: expect.objectContaining({
              intensityDelta: null,
            }),
          }),
        })
      );
    });

    it('returns null delta when only intensityBefore is provided', async () => {
      const partialIntensityCompletion = {
        ...mockCompletion,
        intensityBefore: 8,
        intensityAfter: null,
      };
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(mockVessel);
      (prisma.emotionalExerciseCompletion.create as jest.Mock).mockResolvedValue(partialIntensityCompletion);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BREATHING_EXERCISE',
          intensityBefore: 8,
        },
      });
      const { res, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            completion: expect.objectContaining({
              intensityDelta: null,
            }),
          }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-session' },
        body: {
          type: 'BREATHING_EXERCISE',
          intensityBefore: 8,
          intensityAfter: 5,
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });

    it('validates intensityBefore 1-10 range', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BREATHING_EXERCISE',
          intensityBefore: 11,
          intensityAfter: 5,
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('validates intensityAfter 1-10 range', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          type: 'BREATHING_EXERCISE',
          intensityBefore: 8,
          intensityAfter: 0,
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('requires exercise type', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: {
          intensityBefore: 8,
          intensityAfter: 5,
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    const mockUser = { id: 'user-1', email: 'user@example.com', name: 'Test User' };

    it('handles database errors in recordEmotion gracefully', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { intensity: 5 },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await recordEmotion(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
          }),
        })
      );
    });

    it('handles database errors in getEmotions gracefully', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getEmotions(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
          }),
        })
      );
    });

    it('handles database errors in completeExercise gracefully', async () => {
      (prisma.userVessel.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-1' },
        body: { type: 'BREATHING_EXERCISE' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await completeExercise(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
          }),
        })
      );
    });
  });
});
