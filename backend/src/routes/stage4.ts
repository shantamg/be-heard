/**
 * Stage 4 Routes
 *
 * Routes for the Strategic Repair stage of the BeHeard process.
 * - GET /sessions/:id/strategies - Get anonymous strategy pool
 * - POST /sessions/:id/strategies - Propose a strategy
 * - POST /sessions/:id/strategies/rank - Submit ranking
 * - GET /sessions/:id/strategies/overlap - Get ranking overlap
 * - POST /sessions/:id/agreements - Create agreement
 * - POST /sessions/:id/agreements/:agreementId/confirm - Confirm agreement
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getStrategies,
  proposeStrategy,
  submitRanking,
  getOverlap,
  createAgreement,
  confirmAgreement,
  requestSuggestions,
  markReady,
  getAgreements,
} from '../controllers/stage4';

const router = Router();

// Get anonymous strategy pool
router.get(
  '/sessions/:id/strategies',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getStrategies)
);

// Propose a new strategy
router.post(
  '/sessions/:id/strategies',
  requireAuth,
  requireSessionAccess,
  asyncHandler(proposeStrategy)
);

// Submit strategy ranking
router.post(
  '/sessions/:id/strategies/rank',
  requireAuth,
  requireSessionAccess,
  asyncHandler(submitRanking)
);

// Get ranking overlap
router.get(
  '/sessions/:id/strategies/overlap',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getOverlap)
);

// Create agreement
router.post(
  '/sessions/:id/agreements',
  requireAuth,
  requireSessionAccess,
  asyncHandler(createAgreement)
);

// Confirm agreement
router.post(
  '/sessions/:id/agreements/:agreementId/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmAgreement)
);

// Request AI strategy suggestions
router.post(
  '/sessions/:id/strategies/suggest',
  requireAuth,
  requireSessionAccess,
  asyncHandler(requestSuggestions)
);

// Mark ready to rank
router.post(
  '/sessions/:id/strategies/ready',
  requireAuth,
  requireSessionAccess,
  asyncHandler(markReady)
);

// Get agreements list
router.get(
  '/sessions/:id/agreements',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getAgreements)
);

export default router;
