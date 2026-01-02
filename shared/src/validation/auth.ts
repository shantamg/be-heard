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
  memoryPreferencesDTOSchema,
  getMemoryPreferencesResponseSchema,
  updateMemoryPreferencesRequestSchema,
  updateMemoryPreferencesResponseSchema,
  type UpdatePushTokenRequestInput,
  type UpdateProfileRequestInput,
  type GetMeResponseInput,
  type AblyTokenResponseInput,
  type UpdateBiometricPreferenceRequestInput,
  type UpdateBiometricPreferenceResponseInput,
  type MemoryPreferencesDTOInput,
  type GetMemoryPreferencesResponseInput,
  type UpdateMemoryPreferencesRequestInput,
  type UpdateMemoryPreferencesResponseInput,
} from '../contracts/auth';
