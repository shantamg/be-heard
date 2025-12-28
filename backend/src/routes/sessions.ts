/**
 * Session Routes
 *
 * Routes for session-level operations:
 * - GET /sessions/:id - Get session details
 * - POST /sessions/:id/pause - Pause active session
 * - POST /sessions/:id/resume - Resume paused session
 * - GET /sessions/:id/progress - Get stage progress
 * - POST /sessions/:id/resolve - Resolve session
 * - POST /sessions/:id/stages/advance - Advance to next stage
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getSession,
  pauseSession,
  resumeSession,
  getProgress,
  resolveSession,
  advanceStage,
} from '../controllers/sessions';

const router = Router();

/**
 * @route GET /api/v1/sessions/:id
 * @description Get session details
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id', requireAuth, requireSessionAccess, asyncHandler(getSession));

/**
 * @route POST /api/v1/sessions/:id/pause
 * @description Pause an active session
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/pause', requireAuth, requireSessionAccess, asyncHandler(pauseSession));

/**
 * @route POST /api/v1/sessions/:id/resume
 * @description Resume a paused session
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/resume', requireAuth, requireSessionAccess, asyncHandler(resumeSession));

/**
 * @route GET /api/v1/sessions/:id/progress
 * @description Get stage progress for both users
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id/progress', requireAuth, requireSessionAccess, asyncHandler(getProgress));

/**
 * @route POST /api/v1/sessions/:id/resolve
 * @description Resolve session after agreements are reached
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/resolve', requireAuth, requireSessionAccess, asyncHandler(resolveSession));

/**
 * @route POST /api/v1/sessions/:id/stages/advance
 * @description Advance to the next stage
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/stages/advance', requireAuth, requireSessionAccess, asyncHandler(advanceStage));

export default router;
