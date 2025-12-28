import { Router } from 'express';
import {
  listSessions,
  createSession,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  resendInvitation,
} from '../controllers/invitations';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

const router = Router();

/**
 * @route GET /api/v1/sessions
 * @description List user's sessions
 * @access Private - requires authentication
 */
router.get('/sessions', requireAuth, asyncHandler(listSessions));

/**
 * @route POST /api/v1/sessions
 * @description Create a new session with an invitation
 * @access Private - requires authentication
 */
router.post('/sessions', requireAuth, asyncHandler(createSession));

/**
 * @route GET /api/v1/invitations/:id
 * @description Get invitation details (public info for accepting/declining)
 * @access Public - but only returns limited info
 */
router.get('/invitations/:id', asyncHandler(getInvitation));

/**
 * @route POST /api/v1/invitations/:id/accept
 * @description Accept an invitation and join the session
 * @access Private - requires authentication
 */
router.post('/invitations/:id/accept', requireAuth, asyncHandler(acceptInvitation));

/**
 * @route POST /api/v1/invitations/:id/decline
 * @description Decline an invitation
 * @access Private - requires authentication
 */
router.post('/invitations/:id/decline', requireAuth, asyncHandler(declineInvitation));

/**
 * @route POST /api/v1/invitations/:id/resend
 * @description Resend an invitation email
 * @access Private - requires authentication (only inviter)
 */
router.post('/invitations/:id/resend', requireAuth, asyncHandler(resendInvitation));

export default router;
