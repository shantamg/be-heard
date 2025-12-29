/**
 * Stage 1 Routes
 *
 * Routes for the Witness stage of the Meet Without Fear process.
 * - POST /sessions/:id/messages - Send message and get AI response
 * - POST /sessions/:id/feel-heard - Confirm user feels heard
 * - GET /sessions/:id/messages - Get conversation history
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  sendMessage,
  confirmFeelHeard,
  getConversationHistory,
} from '../controllers/stage1';

const router = Router();

// Send message and get AI witness response
router.post(
  '/sessions/:id/messages',
  requireAuth,
  requireSessionAccess,
  asyncHandler(sendMessage)
);

// Confirm user feels heard
router.post(
  '/sessions/:id/feel-heard',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmFeelHeard)
);

// Get conversation history
router.get(
  '/sessions/:id/messages',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getConversationHistory)
);

export default router;
