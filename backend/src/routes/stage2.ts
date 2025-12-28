/**
 * Stage 2 Routes
 *
 * Routes for the Perspective Stretch / Empathy stage of the BeHeard process.
 * - POST /sessions/:id/empathy/draft - Save empathy draft
 * - GET /sessions/:id/empathy/draft - Get current draft
 * - POST /sessions/:id/empathy/consent - Consent to share
 * - GET /sessions/:id/empathy/partner - Get partner's empathy
 * - POST /sessions/:id/empathy/validate - Validate partner's empathy
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  saveDraft,
  getDraft,
  consentToShare,
  getPartnerEmpathy,
  validateEmpathy,
} from '../controllers/stage2';

const router = Router();

// Save empathy draft
router.post(
  '/sessions/:id/empathy/draft',
  requireAuth,
  requireSessionAccess,
  asyncHandler(saveDraft)
);

// Get current empathy draft
router.get(
  '/sessions/:id/empathy/draft',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getDraft)
);

// Consent to share empathy with partner
router.post(
  '/sessions/:id/empathy/consent',
  requireAuth,
  requireSessionAccess,
  asyncHandler(consentToShare)
);

// Get partner's empathy attempt
router.get(
  '/sessions/:id/empathy/partner',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getPartnerEmpathy)
);

// Validate partner's empathy attempt
router.post(
  '/sessions/:id/empathy/validate',
  requireAuth,
  requireSessionAccess,
  asyncHandler(validateEmpathy)
);

export default router;
