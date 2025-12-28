/**
 * Stage 3 Routes
 *
 * Routes for the Need Mapping stage of the BeHeard process.
 * - GET /sessions/:id/needs - Get AI-synthesized needs
 * - POST /sessions/:id/needs/confirm - Confirm needs
 * - POST /sessions/:id/needs/consent - Consent to share needs
 * - GET /sessions/:id/common-ground - Get common ground analysis
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getNeeds,
  confirmNeeds,
  consentToShareNeeds,
  getCommonGround,
  addCustomNeed,
  confirmCommonGround,
} from '../controllers/stage3';

const router = Router();

// Get AI-synthesized needs for the user
router.get(
  '/sessions/:id/needs',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getNeeds)
);

// Confirm user's needs
router.post(
  '/sessions/:id/needs/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmNeeds)
);

// Consent to share needs with partner
router.post(
  '/sessions/:id/needs/consent',
  requireAuth,
  requireSessionAccess,
  asyncHandler(consentToShareNeeds)
);

// Get common ground analysis
router.get(
  '/sessions/:id/common-ground',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getCommonGround)
);

// Add custom need
router.post(
  '/sessions/:id/needs',
  requireAuth,
  requireSessionAccess,
  asyncHandler(addCustomNeed)
);

// Confirm common ground
router.post(
  '/sessions/:id/common-ground/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmCommonGround)
);

export default router;
