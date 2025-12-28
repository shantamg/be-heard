/**
 * Auth Validation Schemas
 *
 * Zod schemas for authentication endpoints.
 * Note: Comprehensive auth contracts are in contracts/auth.ts
 */

// Re-export from contracts to avoid duplication
export {
  updatePushTokenRequestSchema,
  updatePushTokenResponseSchema,
  updateProfileRequestSchema,
  updateProfileResponseSchema,
  getMeResponseSchema,
  ablyTokenResponseSchema,
  userDTOSchema,
  updateBiometricPreferenceRequestSchema,
  updateBiometricPreferenceResponseSchema,
  type UpdatePushTokenRequestInput,
  type UpdateProfileRequestInput,
  type GetMeResponseInput,
  type AblyTokenResponseInput,
  type UpdateBiometricPreferenceRequestInput,
  type UpdateBiometricPreferenceResponseInput,
} from '../contracts/auth';
