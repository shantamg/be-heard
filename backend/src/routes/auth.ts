/**
 * Auth Routes
 *
 * Routes for authentication-related endpoints.
 *
 * All routes in this file require authentication via requireAuth middleware.
 * Note: Controllers already use asyncHandler internally.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getMe,
  updateProfile,
  updatePushToken,
  deletePushToken,
  getAblyToken,
} from '../controllers/auth';

const router = Router();

// All auth routes require authentication
router.use(requireAuth);

/**
 * GET /auth/me
 *
 * Get the current user's profile and session status.
 *
 * Response: GetMeResponse
 * - user: UserDTO
 * - activeSessions: number
 * - pushNotificationsEnabled: boolean
 */
router.get('/me', getMe);

/**
 * PATCH /auth/me
 *
 * Update the current user's profile.
 *
 * Request: UpdateProfileRequest
 * - name?: string
 *
 * Response: UpdateProfileResponse
 * - user: UserDTO
 */
router.patch('/me', updateProfile);

/**
 * POST /auth/push-token
 *
 * Register or update push notification token.
 *
 * Request: UpdatePushTokenRequest
 * - pushToken: string
 * - platform: 'ios' | 'android'
 *
 * Response: UpdatePushTokenResponse
 * - registered: boolean
 */
router.post('/push-token', updatePushToken);

/**
 * DELETE /auth/push-token
 *
 * Remove push notification token (disable push notifications).
 *
 * Response: UpdatePushTokenResponse
 * - registered: boolean (always false)
 */
router.delete('/push-token', deletePushToken);

/**
 * GET /auth/ably-token
 *
 * Get an Ably token for realtime communication.
 * Token is scoped to the user's active sessions.
 *
 * Response: AblyTokenResponse
 * - tokenRequest: AblyTokenRequest object
 */
router.get('/ably-token', getAblyToken);

export default router;
