/**
 * Auth DTOs
 *
 * Data Transfer Objects for authentication and user management.
 */

// ============================================================================
// User
// ============================================================================

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  biometricEnabled: boolean;
  lastMoodIntensity: number | null;
  createdAt: string;
}

// ============================================================================
// Profile
// ============================================================================

export interface GetMeResponse {
  user: UserDTO;
  activeSessions: number;
  pushNotificationsEnabled: boolean;
}

export interface UpdateProfileRequest {
  name?: string;
}

export interface UpdateProfileResponse {
  user: UserDTO;
}

// ============================================================================
// Push Notifications
// ============================================================================

export interface UpdatePushTokenRequest {
  pushToken: string;
  platform: 'ios' | 'android';
}

export interface UpdatePushTokenResponse {
  registered: boolean;
}

// ============================================================================
// Notification Preferences
// ============================================================================

export interface NotificationPreferencesDTO {
  /** Master toggle for push notifications */
  pushEnabled: boolean;
  /** Master toggle for email notifications */
  emailEnabled: boolean;
  /** Notify when receiving new session invitations */
  newInvitations: boolean;
  /** Notify on partner actions (signed compact, completed stage, etc.) */
  partnerActions: boolean;
  /** Send follow-up reminders for agreements */
  followUpReminders: boolean;
}

export interface GetNotificationPreferencesResponse {
  preferences: NotificationPreferencesDTO;
}

export interface UpdateNotificationPreferencesRequest {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  newInvitations?: boolean;
  partnerActions?: boolean;
  followUpReminders?: boolean;
}

export interface UpdateNotificationPreferencesResponse {
  preferences: NotificationPreferencesDTO;
}

// ============================================================================
// Ably Token
// ============================================================================

export interface AblyTokenResponse {
  tokenRequest: {
    keyName: string;
    ttl: number;
    timestamp: number;
    capability: string;
    clientId: string;
    nonce: string;
    mac: string;
  };
}

// ============================================================================
// Biometric Preferences
// ============================================================================

export interface UpdateBiometricPreferenceRequest {
  enabled: boolean;
}

export interface UpdateBiometricPreferenceResponse {
  biometricEnabled: boolean;
  biometricEnrolledAt: string | null;
}

// ============================================================================
// Memory Preferences
// ============================================================================

/**
 * User preferences for AI memory and pattern recognition.
 * Controls how the AI remembers and surfaces information across sessions.
 */
export interface MemoryPreferencesDTO {
  /** Remember context within the same relationship (default: true) */
  sessionContinuity: boolean;
  /** Recall patterns across different relationships (default: false) */
  crossSessionRecall: boolean;
  /** Allow AI to surface pattern insights (Level 2 disclosure, default: false) */
  patternInsights: boolean;
  /** Remember agreements and commitments (default: true) */
  rememberAgreements: boolean;
}

export const DEFAULT_MEMORY_PREFERENCES: MemoryPreferencesDTO = {
  sessionContinuity: true,
  crossSessionRecall: false,
  patternInsights: false,
  rememberAgreements: true,
};

export interface GetMemoryPreferencesResponse {
  preferences: MemoryPreferencesDTO;
}

export interface UpdateMemoryPreferencesRequest {
  sessionContinuity?: boolean;
  crossSessionRecall?: boolean;
  patternInsights?: boolean;
  rememberAgreements?: boolean;
}

export interface UpdateMemoryPreferencesResponse {
  preferences: MemoryPreferencesDTO;
}
