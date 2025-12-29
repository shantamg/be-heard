/**
 * Chat Router Routes
 *
 * Unified chat endpoint that handles all user messages,
 * routing based on intent detection.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import {
  processMessage,
  getChatContext,
  cancelPendingCreation,
  initializeChatRouter,
} from '../services/chat-router';
import { success, error } from '../utils/response';
import { SendUnifiedChatRequest } from '@be-heard/shared';

const router = Router();

// Initialize the chat router on first request
let initialized = false;
function ensureInitialized() {
  if (!initialized) {
    initializeChatRouter();
    initialized = true;
  }
}

/**
 * POST /chat/message
 * Main entry point for all chat messages
 */
router.post(
  '/chat/message',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    ensureInitialized();

    const userId = req.user!.id;
    const { content, currentSessionId } = req.body as SendUnifiedChatRequest;

    if (!content || typeof content !== 'string') {
      res.status(400).json(error('VALIDATION_ERROR', 'Message content is required'));
      return;
    }

    const result = await processMessage({
      userId,
      content,
      currentSessionId,
      req,
    });

    res.json(success(result));
  })
);

/**
 * GET /chat/context
 * Get current chat context (active sessions, pending state)
 */
router.get(
  '/chat/context',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    ensureInitialized();

    const userId = req.user!.id;
    const context = await getChatContext(userId);

    res.json(success(context));
  })
);

/**
 * POST /chat/cancel
 * Cancel any pending operation (e.g., session creation)
 */
router.post(
  '/chat/cancel',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    ensureInitialized();

    const userId = req.user!.id;
    cancelPendingCreation(userId);

    res.json(success({ cancelled: true }));
  })
);

export default router;
