import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { recordEmotion, getEmotions, completeExercise } from '../controllers/emotions';

const router = Router();

/**
 * Emotional Barometer Routes
 * All routes require authentication and session access
 */

// POST /api/v1/sessions/:id/emotions - Record emotional reading
router.post('/sessions/:id/emotions', requireAuth, requireSessionAccess, asyncHandler(recordEmotion));

// GET /api/v1/sessions/:id/emotions - Get emotion history
router.get('/sessions/:id/emotions', requireAuth, requireSessionAccess, asyncHandler(getEmotions));

// POST /api/v1/sessions/:id/exercises/complete - Log exercise completion
router.post('/sessions/:id/exercises/complete', requireAuth, requireSessionAccess, asyncHandler(completeExercise));

export default router;
