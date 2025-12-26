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
// Registration
// ============================================================================

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  invitationId?: string;
}

export interface RegisterResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// Login
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// Token Refresh
// ============================================================================

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// Logout
// ============================================================================

export interface LogoutRequest {
  refreshToken: string;
  allDevices?: boolean;
}

export interface LogoutResponse {
  loggedOut: boolean;
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
// Password Reset
// ============================================================================

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  sent: boolean;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  reset: boolean;
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
