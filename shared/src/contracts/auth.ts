/**
 * Auth API Contracts
 *
 * Zod schemas for auth-related API endpoints.
 */

import { z } from 'zod';

// ============================================================================
// User Schema
// ============================================================================

export const userDTOSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// ============================================================================
// GET /auth/me
// ============================================================================

export const getMeResponseSchema = z.object({
  user: userDTOSchema,
  activeSessions: z.number().int().min(0),
  pushNotificationsEnabled: z.boolean(),
});

export type GetMeResponseInput = z.infer<typeof getMeResponseSchema>;

// ============================================================================
// PATCH /auth/me
// ============================================================================

export const updateProfileRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
});

export type UpdateProfileRequestInput = z.infer<typeof updateProfileRequestSchema>;

export const updateProfileResponseSchema = z.object({
  user: userDTOSchema,
});

// ============================================================================
// POST /auth/push-token
// ============================================================================

export const updatePushTokenRequestSchema = z.object({
  pushToken: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android']),
});

export type UpdatePushTokenRequestInput = z.infer<typeof updatePushTokenRequestSchema>;

export const updatePushTokenResponseSchema = z.object({
  registered: z.boolean(),
});

// ============================================================================
// GET /auth/ably-token
// ============================================================================

export const ablyTokenResponseSchema = z.object({
  tokenRequest: z.object({
    keyName: z.string(),
    ttl: z.number(),
    timestamp: z.number(),
    capability: z.string(),
    clientId: z.string(),
    nonce: z.string(),
    mac: z.string(),
  }),
});

export type AblyTokenResponseInput = z.infer<typeof ablyTokenResponseSchema>;
