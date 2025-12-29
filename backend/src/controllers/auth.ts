/**
 * Auth Controller
 *
 * Handles authentication-related endpoints including user profile,
 * push notifications, and Ably realtime token generation.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser, AuthUser } from '../middleware/auth';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errors';
import {
  ApiResponse,
  GetMeResponse,
  UpdateProfileResponse,
  UpdatePushTokenResponse,
  AblyTokenResponse,
  UpdateBiometricPreferenceResponse,
  updateProfileRequestSchema,
  updatePushTokenRequestSchema,
  updateBiometricPreferenceRequestSchema,
} from '@meet-without-fear/shared';

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

  const { name } = parseResult.data;

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name !== undefined ? name : undefined,
    },
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

  // Get user's active session IDs for capability scoping
  const sessions = await prisma.session.findMany({
    where: {
      relationship: {
        members: { some: { userId: user.id } },
      },
      status: { in: ['ACTIVE', 'WAITING', 'PAUSED'] },
    },
    select: { id: true },
  });

  // Build capability object - scope to user's active sessions
  const capability: Record<string, string[]> = {};
  for (const session of sessions) {
    capability[`meetwithoutfear:session:${session.id}`] = ['subscribe', 'publish'];
    capability[`meetwithoutfear:session:${session.id}:presence`] = ['presence'];
  }

  // If no active sessions, allow basic user channel
  if (Object.keys(capability).length === 0) {
    capability[`meetwithoutfear:user:${user.id}`] = ['subscribe'];
  }

  try {
    // Dynamic import to handle when Ably is not installed
    const Ably = await import('ably');
    const ably = new Ably.Rest(ablyApiKey);

    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: user.id,
      capability: JSON.stringify(capability),
    });

    const response: ApiResponse<AblyTokenResponse> = {
      success: true,
      data: {
        tokenRequest: tokenRequest as AblyTokenResponse['tokenRequest'],
      },
    };

    res.json(response);
  } catch (error) {
    // If Ably fails, log and return mock for development
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Ably] Token generation failed:', error);

      const mockTokenRequest = {
        keyName: 'mock-key-name',
        ttl: 3600000,
        timestamp: Date.now(),
        capability: JSON.stringify(capability),
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
