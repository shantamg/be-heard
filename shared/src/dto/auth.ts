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
