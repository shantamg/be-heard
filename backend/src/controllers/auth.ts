/**
 * Auth Controller
 *
 * Handles authentication-related endpoints including user profile,
 * push notifications, and Ably realtime token generation.
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getUser, AuthUser } from '../middleware/auth';
import { asyncHandler, ForbiddenError, NotFoundError, ValidationError } from '../middleware/errors';
import {
  ApiResponse,
  GetMeResponse,
  UpdateProfileResponse,
  UpdatePushTokenResponse,
  AblyTokenResponse,
  UpdateBiometricPreferenceResponse,
  GetMemoryPreferencesResponse,
  UpdateMemoryPreferencesResponse,
  GetNotificationPreferencesResponse,
  UpdateNotificationPreferencesResponse,
  GetPrivacyPreferencesResponse,
  UpdatePrivacyPreferencesResponse,
  DeleteAccountResponse,
  MemoryPreferencesDTO,
  NotificationPreferencesDTO,
  PrivacyPreferencesDTO,
  DEFAULT_MEMORY_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
  updateProfileRequestSchema,
  updatePushTokenRequestSchema,
  updateBiometricPreferenceRequestSchema,
  updateMemoryPreferencesRequestSchema,
  updateNotificationPreferencesRequestSchema,
  updatePrivacyPreferencesRequestSchema,
} from '@meet-without-fear/shared';
import { deleteAccountWithNotifications } from '../services/account-deletion';
import { sendTestPushNotification } from '../services/push';

// ============================================================================
// Helper Functions
// ============================================================================

function toUserDTO(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    biometricEnabled: user.biometricEnabled,
    lastMoodIntensity: user.lastMoodIntensity,
    createdAt: user.createdAt.toISOString(),
  };
}

// ============================================================================
// GET /auth/me
// ============================================================================

export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Count active sessions for this user
  const activeSessions = await prisma.session.count({
    where: {
      relationship: {
        members: {
          some: { userId: user.id },
        },
      },
      status: { in: ['ACTIVE', 'WAITING', 'PAUSED'] },
    },
  });

  const response: ApiResponse<GetMeResponse> = {
    success: true,
    data: {
      user: toUserDTO(user),
      activeSessions,
      pushNotificationsEnabled: !!user.pushToken,
    },
  };

  res.json(response);
});

// ============================================================================
// PATCH /auth/me
// ============================================================================

export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate request body
  const parseResult = updateProfileRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid profile data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { name, firstName, lastName } = parseResult.data;

  // Build update data - only include fields that were provided
  const updateData: { name?: string; firstName?: string; lastName?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  const response: ApiResponse<UpdateProfileResponse> = {
    success: true,
    data: {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        biometricEnabled: updatedUser.biometricEnabled,
        lastMoodIntensity: updatedUser.lastMoodIntensity,
        createdAt: updatedUser.createdAt.toISOString(),
      },
    },
  };

  res.json(response);
});

// ============================================================================
// POST /auth/push-token
// ============================================================================

export const updatePushToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate request body
  const parseResult = updatePushTokenRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid push token data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { pushToken } = parseResult.data;

  // Update user push token
  await prisma.user.update({
    where: { id: user.id },
    data: { pushToken },
  });

  const response: ApiResponse<UpdatePushTokenResponse> = {
    success: true,
    data: {
      registered: true,
    },
  };

  res.json(response);
});

// ============================================================================
// GET /auth/ably-token
// ============================================================================

/**
 * Generates an Ably token for the authenticated user.
 * The token is scoped to only allow access to channels the user
 * is authorized to access (their active sessions).
 *
 * If Ably is not configured, returns a mock token response.
 */
export const getAblyToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Check if Ably is configured
  const ablyApiKey = process.env.ABLY_API_KEY;

  if (!ablyApiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new ValidationError('Realtime not configured', {
        errors: { ABLY_API_KEY: ['ABLY_API_KEY is required in production'] },
      });
    }

    // Return mock token for development
    const mockTokenRequest = {
      keyName: 'mock-key-name',
      ttl: 3600000, // 1 hour in ms
      timestamp: Date.now(),
      capability: JSON.stringify({ '*': ['subscribe', 'publish'] }),
      clientId: user.id,
      nonce: Math.random().toString(36).substring(2),
      mac: 'mock-mac-signature',
    };

    const response: ApiResponse<AblyTokenResponse> = {
      success: true,
      data: {
        tokenRequest: mockTokenRequest,
      },
    };

    res.json(response);
    return;
  }

  // Get user's session IDs for capability scoping
  // Include all non-resolved sessions so users can connect during invitation phase too
  const sessions = await prisma.session.findMany({
    where: {
      relationship: {
        members: { some: { userId: user.id } },
      },
      status: { in: ['CREATED', 'INVITED', 'ACTIVE', 'WAITING', 'PAUSED'] },
    },
    select: { id: true },
  });

  // Build capability object - scope to user's active sessions
  // Note: 'presence' capability must be on the same channel as subscribe/publish
  const capability: Record<string, string[]> = {};

  // ALWAYS allow access to the user's private notification channel
  // This is required for useNotificationChannel to work regardless of session state
  capability[`meetwithoutfear:user:${user.id}`] = ['subscribe'];

  // Add capabilities for specific sessions
  for (const session of sessions) {
    capability[`meetwithoutfear:session:${session.id}`] = ['subscribe', 'publish'];
    capability[`meetwithoutfear:presence:${session.id}`] = ['subscribe', 'presence'];
  }

  try {
    // Dynamic import to handle when Ably is not installed
    const Ably = await import('ably');
    const ably = new Ably.Rest(ablyApiKey);

    // Use requestToken() to get an actual token (not just a tokenRequest)
    // This avoids the client needing to make a separate request to Ably servers,
    // which fixes CORS issues when E2E headers are being sent
    const tokenDetails = await ably.auth.requestToken({
      clientId: user.id,
      capability: JSON.stringify(capability),
    });

    const response: ApiResponse<AblyTokenResponse> = {
      success: true,
      data: {
        token: {
          token: tokenDetails.token,
          issued: tokenDetails.issued,
          expires: tokenDetails.expires,
          capability: tokenDetails.capability,
          clientId: tokenDetails.clientId || user.id,
        },
      },
    };

    res.json(response);
  } catch (error) {
    // If Ably fails, log and return mock for development
    if (process.env.NODE_ENV !== 'production') {
      logger.error('[Ably] Token generation failed:', error);

      // Return mock token for development (when Ably is not configured properly)
      const mockToken = {
        token: 'mock-token-for-development',
        issued: Date.now(),
        expires: Date.now() + 3600000, // 1 hour
        capability: JSON.stringify(capability),
        clientId: user.id,
      };

      const response: ApiResponse<AblyTokenResponse> = {
        success: true,
        data: {
          token: mockToken,
        },
      };

      res.json(response);
      return;
    }

    throw error;
  }
});

// ============================================================================
// DELETE /auth/push-token
// ============================================================================

export const deletePushToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  await prisma.user.update({
    where: { id: user.id },
    data: { pushToken: null },
  });

  const response: ApiResponse<UpdatePushTokenResponse> = {
    success: true,
    data: {
      registered: false,
    },
  };

  res.json(response);
});

// ============================================================================
// POST /auth/test-push-notification
// ============================================================================

export const scheduleTestPushNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  if (user.email.toLowerCase() !== 'jason@galuten.com') {
    throw new ForbiddenError('Test push notifications are not available for this account');
  }

  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const result = await sendTestPushNotification(user.id);

  const response: ApiResponse<{ sent: boolean; delaySeconds: number; reason?: string }> = {
    success: true,
    data: {
      sent: result.sent,
      delaySeconds: 10,
      ...(result.reason ? { reason: result.reason } : {}),
    },
  };

  res.json(response);
});

// ============================================================================
// PATCH /auth/biometric
// ============================================================================

export const updateBiometricPreference = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate request body
  const parseResult = updateBiometricPreferenceRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid biometric preference data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { enabled } = parseResult.data;

  // Update biometric preference
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      biometricEnabled: enabled,
      biometricEnrolledAt: enabled ? new Date() : null,
    },
  });

  const response: ApiResponse<UpdateBiometricPreferenceResponse> = {
    success: true,
    data: {
      biometricEnabled: updatedUser.biometricEnabled,
      biometricEnrolledAt: updatedUser.biometricEnrolledAt?.toISOString() ?? null,
    },
  };

  res.json(response);
});

// ============================================================================
// GET /auth/me/memory-preferences
// ============================================================================

export const getMemoryPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Get user with memory preferences
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { memoryPreferences: true },
  });

  // Parse stored preferences or use defaults
  const storedPrefs = dbUser?.memoryPreferences as MemoryPreferencesDTO | null;
  const preferences: MemoryPreferencesDTO = storedPrefs ?? DEFAULT_MEMORY_PREFERENCES;

  const response: ApiResponse<GetMemoryPreferencesResponse> = {
    success: true,
    data: {
      preferences,
    },
  };

  res.json(response);
});

// ============================================================================
// PUT /auth/me/memory-preferences
// ============================================================================

export const updateMemoryPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate request body
  const parseResult = updateMemoryPreferencesRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid memory preferences data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const updates = parseResult.data;

  // Get current preferences
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { memoryPreferences: true },
  });

  const currentPrefs = (dbUser?.memoryPreferences as MemoryPreferencesDTO | null) ?? DEFAULT_MEMORY_PREFERENCES;

  // Merge updates with current preferences
  const newPreferences: MemoryPreferencesDTO = {
    sessionContinuity: updates.sessionContinuity ?? currentPrefs.sessionContinuity,
    crossSessionRecall: updates.crossSessionRecall ?? currentPrefs.crossSessionRecall,
    patternInsights: updates.patternInsights ?? currentPrefs.patternInsights,
    rememberAgreements: updates.rememberAgreements ?? currentPrefs.rememberAgreements,
  };

  // Update user preferences
  await prisma.user.update({
    where: { id: user.id },
    data: { memoryPreferences: newPreferences as object },
  });

  const response: ApiResponse<UpdateMemoryPreferencesResponse> = {
    success: true,
    data: {
      preferences: newPreferences,
    },
  };

  res.json(response);
});

// ============================================================================
// PATCH /auth/me/mood
// ============================================================================

interface UpdateMoodResponse {
  lastMoodIntensity: number;
}

export const updateMood = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate intensity
  const { intensity } = req.body;
  if (typeof intensity !== 'number' || intensity < 1 || intensity > 10 || !Number.isInteger(intensity)) {
    throw new ValidationError('Invalid mood intensity', {
      errors: { intensity: ['Intensity must be an integer between 1 and 10'] },
    });
  }

  // Update user's lastMoodIntensity
  await prisma.user.update({
    where: { id: user.id },
    data: { lastMoodIntensity: intensity },
  });

  const response: ApiResponse<UpdateMoodResponse> = {
    success: true,
    data: {
      lastMoodIntensity: intensity,
    },
  };

  res.json(response);
});

// ============================================================================
// GET /auth/me/notification-preferences
// ============================================================================

export const getNotificationPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Get user with notification preferences
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPreferences: true },
  });

  // Parse stored preferences or use defaults
  const storedPrefs = dbUser?.notificationPreferences as NotificationPreferencesDTO | null;
  const preferences: NotificationPreferencesDTO = storedPrefs ?? DEFAULT_NOTIFICATION_PREFERENCES;

  const response: ApiResponse<GetNotificationPreferencesResponse> = {
    success: true,
    data: {
      preferences,
    },
  };

  res.json(response);
});

// ============================================================================
// PATCH /auth/me/notification-preferences
// ============================================================================

export const updateNotificationPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Validate request body
  const parseResult = updateNotificationPreferencesRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid notification preferences data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const updates = parseResult.data;

  // Get current preferences
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPreferences: true },
  });

  const currentPrefs = (dbUser?.notificationPreferences as NotificationPreferencesDTO | null) ?? DEFAULT_NOTIFICATION_PREFERENCES;

  // Merge updates with current preferences
  const newPreferences: NotificationPreferencesDTO = {
    pushEnabled: updates.pushEnabled ?? currentPrefs.pushEnabled,
    emailEnabled: updates.emailEnabled ?? currentPrefs.emailEnabled,
    newInvitations: updates.newInvitations ?? currentPrefs.newInvitations,
    partnerActions: updates.partnerActions ?? currentPrefs.partnerActions,
    followUpReminders: updates.followUpReminders ?? currentPrefs.followUpReminders,
  };

  // Update user preferences
  await prisma.user.update({
    where: { id: user.id },
    data: { notificationPreferences: newPreferences as object },
  });

  const response: ApiResponse<UpdateNotificationPreferencesResponse> = {
    success: true,
    data: {
      preferences: newPreferences,
    },
  };

  res.json(response);
});

// ============================================================================
// GET /auth/me/privacy-preferences
// ============================================================================

export const getPrivacyPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { privacyPreferences: true } as any,
  });

  const storedPrefs = (dbUser as { privacyPreferences?: unknown } | null)?.privacyPreferences as PrivacyPreferencesDTO | null;
  const preferences: PrivacyPreferencesDTO = storedPrefs ?? DEFAULT_PRIVACY_PREFERENCES;

  const response: ApiResponse<GetPrivacyPreferencesResponse> = {
    success: true,
    data: { preferences },
  };

  res.json(response);
});

// ============================================================================
// PATCH /auth/me/privacy-preferences
// ============================================================================

export const updatePrivacyPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  const parseResult = updatePrivacyPreferencesRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid privacy preferences data', {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const updates = parseResult.data;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { privacyPreferences: true } as any,
  });

  const currentPrefs = ((dbUser as { privacyPreferences?: unknown } | null)?.privacyPreferences as PrivacyPreferencesDTO | null) ?? DEFAULT_PRIVACY_PREFERENCES;
  const newPreferences: PrivacyPreferencesDTO = {
    showActivityStatus: updates.showActivityStatus ?? currentPrefs.showActivityStatus,
    allowSessionInvites: updates.allowSessionInvites ?? currentPrefs.allowSessionInvites,
    analyticsOptOut: updates.analyticsOptOut ?? currentPrefs.analyticsOptOut,
  };

  await prisma.user.update({
    where: { id: user.id },
    data: { privacyPreferences: newPreferences as object } as any,
  });

  const response: ApiResponse<UpdatePrivacyPreferencesResponse> = {
    success: true,
    data: { preferences: newPreferences },
  };

  res.json(response);
});

// ============================================================================
// DELETE /auth/me - Delete Account
// ============================================================================

/**
 * Permanently delete the user's account.
 *
 * This performs a complete account deletion with the following behavior:
 * 1. Active sessions are marked as ABANDONED
 * 2. Partners in active sessions are notified via SESSION_ABANDONED notification
 * 3. Data shared with partners is preserved but anonymized (source user set to null)
 * 4. All private user data is permanently deleted
 * 5. The user is removed from all relationships
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);

  // Perform the deletion with notifications
  const summary = await deleteAccountWithNotifications(user.id, user.name ?? user.firstName ?? 'Your partner');

  const response: ApiResponse<DeleteAccountResponse> = {
    success: true,
    data: {
      success: true,
      summary,
    },
  };

  res.json(response);
});
