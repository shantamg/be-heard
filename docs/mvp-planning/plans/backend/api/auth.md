---
slug: /backend/api/auth
sidebar_position: 13
---

# Authentication API

User registration, login, and token management.

## Overview

BeHeard uses JWT-based authentication:
- Access tokens (short-lived, 15 min)
- Refresh tokens (long-lived, 30 days)
- Secure token rotation on refresh

## Register

Create a new user account.

```
POST /api/v1/auth/register
```

### Request Body

```typescript
interface RegisterRequest {
  email: string;
  password: string;
  name?: string;

  // Optional: accept invitation during registration
  invitationId?: string;
}
```

### Response

```typescript
interface RegisterResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // seconds

  // If invitation was included
  session?: SessionSummaryDTO;
}

interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}
```

### Validation

- Email must be valid format and unique
- Password minimum 8 characters
- If `invitationId` provided, must be valid and pending

### Errors

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Invalid email/password format |
| `CONFLICT` | Email already registered |
| `INVITATION_EXPIRED` | Invitation ID invalid or expired |

---

## Login

Authenticate with email and password.

```
POST /api/v1/auth/login
```

### Request Body

```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

### Response

```typescript
interface LoginResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
```

### Errors

| Code | When |
|------|------|
| `UNAUTHORIZED` | Invalid email or password |

---

## Refresh Token

Get a new access token using refresh token.

```
POST /api/v1/auth/refresh
```

### Request Body

```typescript
interface RefreshRequest {
  refreshToken: string;
}
```

### Response

```typescript
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;  // New refresh token (rotation)
  expiresIn: number;
}
```

### Token Rotation

Each refresh:
1. Invalidates the old refresh token
2. Issues a new refresh token
3. If an old refresh token is reused, all tokens for that user are invalidated (security measure)

### Errors

| Code | When |
|------|------|
| `UNAUTHORIZED` | Invalid or expired refresh token |

---

## Logout

Invalidate current tokens.

```
POST /api/v1/auth/logout
```

### Request Body

```typescript
interface LogoutRequest {
  refreshToken: string;
  allDevices?: boolean;  // Logout from all devices
}
```

### Response

```typescript
interface LogoutResponse {
  loggedOut: boolean;
}
```

---

## Get Current User

Get the authenticated user's profile.

```
GET /api/v1/auth/me
```

### Response

```typescript
interface GetMeResponse {
  user: UserDTO;
  activeSessions: number;
  pushNotificationsEnabled: boolean;
}
```

---

## Update Profile

Update user profile information.

```
PATCH /api/v1/auth/me
```

### Request Body

```typescript
interface UpdateProfileRequest {
  name?: string;
}
```

### Response

```typescript
interface UpdateProfileResponse {
  user: UserDTO;
}
```

---

## Update Push Token

Register device for push notifications.

```
POST /api/v1/auth/push-token
```

### Request Body

```typescript
interface UpdatePushTokenRequest {
  pushToken: string;  // Expo push token
  platform: 'ios' | 'android';
}
```

### Response

```typescript
interface UpdatePushTokenResponse {
  registered: boolean;
}
```

---

## Request Password Reset

Request a password reset email.

```
POST /api/v1/auth/forgot-password
```

### Request Body

```typescript
interface ForgotPasswordRequest {
  email: string;
}
```

### Response

```typescript
interface ForgotPasswordResponse {
  sent: boolean;
  // Always returns true to prevent email enumeration
}
```

---

## Reset Password

Reset password with token from email.

```
POST /api/v1/auth/reset-password
```

### Request Body

```typescript
interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
```

### Response

```typescript
interface ResetPasswordResponse {
  reset: boolean;
}
```

### Side Effects

- All existing tokens are invalidated
- User must log in again

---

## Ably Token

Get an Ably token for real-time connections.

```
GET /api/v1/auth/ably-token
```

### Response

```typescript
interface AblyTokenResponse {
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
```

### Capability Scoping

Token is scoped to user's active sessions only:

```json
{
  "beheard:session:sess_abc123": ["subscribe", "publish"],
  "beheard:session:sess_abc123:presence": ["presence"]
}
```

---

## Token Format

### Access Token Claims

```typescript
interface AccessTokenPayload {
  sub: string;      // User ID
  email: string;
  iat: number;      // Issued at
  exp: number;      // Expires (15 min)
  type: 'access';
}
```

### Refresh Token Claims

```typescript
interface RefreshTokenPayload {
  sub: string;      // User ID
  jti: string;      // Token ID (for revocation)
  iat: number;
  exp: number;      // Expires (30 days)
  type: 'refresh';
}
```

---

## Security Considerations

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/auth/login` | 5 attempts per minute per IP |
| `/auth/register` | 3 per minute per IP |
| `/auth/forgot-password` | 3 per hour per email |

### Password Requirements

- Minimum 8 characters
- Future: strength scoring, breach detection

### Token Storage (Mobile)

- Store refresh token in secure storage (iOS Keychain, Android Keystore)
- Access token can be in memory only
- Never store tokens in AsyncStorage

---

## Related Documentation

- [Realtime Integration](./realtime.md) - Ably token usage
- [Sessions API](./sessions.md) - Authenticated session access

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
