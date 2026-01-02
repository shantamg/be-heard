/**
 * Inner Work Routes
 *
 * Routes for inner work (solo self-reflection) session operations:
 * - POST /inner-work - Create new inner work session
 * - GET /inner-work - List inner work sessions
 * - GET /inner-work/:id - Get inner work session with messages
 * - POST /inner-work/:id/messages - Send message and get AI response
 * - PATCH /inner-work/:id - Update session (title, status)
 * - DELETE /inner-work/:id - Archive session
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createInnerWorkSession,
  listInnerWorkSessions,
  getInnerWorkSession,
  sendInnerWorkMessage,
  updateInnerWorkSession,
  archiveInnerWorkSession,
} from '../controllers/inner-work';

const router = Router();

// All inner work routes require authentication
router.use(requireAuth);

/**
 * @route POST /api/v1/inner-work
 * @description Create a new inner work session
 * @access Private
 */
router.post('/inner-work', createInnerWorkSession);

/**
 * @route GET /api/v1/inner-work
 * @description List inner work sessions for the current user
 * @access Private
 */
router.get('/inner-work', listInnerWorkSessions);

/**
 * @route GET /api/v1/inner-work/:id
 * @description Get inner work session details with messages
 * @access Private
 */
router.get('/inner-work/:id', getInnerWorkSession);

/**
 * @route POST /api/v1/inner-work/:id/messages
 * @description Send a message and get AI response
 * @access Private
 */
router.post('/inner-work/:id/messages', sendInnerWorkMessage);

/**
 * @route PATCH /api/v1/inner-work/:id
 * @description Update inner work session (title, status)
 * @access Private
 */
router.patch('/inner-work/:id', updateInnerWorkSession);

/**
 * @route DELETE /api/v1/inner-work/:id
 * @description Archive inner work session
 * @access Private
 */
router.delete('/inner-work/:id', archiveInnerWorkSession);

export default router;
