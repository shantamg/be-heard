---
slug: /backend/api/auth
sidebar_position: 13
---

# Authentication API

Authentication via Clerk with backend user provisioning and Ably token management.

## Overview

Meet Without Fear uses **Clerk** for authentication and token issuance. Expo app integrates Clerk for signup/login/social; backend uses Clerk middleware to validate tokens. No custom password or refresh-token handling in the backend.

### Clerk-based flow (MVP)
1) **Mobile (Expo)**: Wrap the app root with `<ClerkProvider publishableKey={...}>`. Use Clerk hooks (`useAuth`, `useUser`) to sign in/up and obtain session tokens:
```tsx
const { getToken } = useAuth();
const token = await getToken({ template: 'backend' }); // send as Bearer token
```
2) **Backend (Express)**: Add `clerkMiddleware()` at the top-level router to validate incoming `Authorization: Bearer <Clerk JWT>`:
```ts
import { clerkMiddleware, requireAuth } from '@clerk/express';
app.use(clerkMiddleware());
app.use('/api/v1', requireAuth(), apiRouter);
```
3) **User provisioning**: On first authenticated request, upsert a local `User` row keyed by the Clerk user ID (store Clerk user ID in the User table; recommend using it as the primary key or a unique `clerkUserId` field). Copy profile fields (email, name) + pushToken when available.
4) **Token characteristics**: Tokens are Clerk session JWTs; no backend refresh endpoint is needed. Expiration/rotation is managed by Clerk.

The only backend-issued tokens are for Ably (`/auth/ably-token`) which require a valid Clerk session token on the request.

## Register / Login

Handled entirely by Clerk in the mobile app. The backend does **not** implement `/auth/register` or `/auth/login`. Use Clerk’s SDK UI/components or custom flows in Expo; send Clerk session tokens to the backend.

For invitation acceptance, the app should pass `invitationId` to Clerk’s sign-up flow, then call `/sessions/:id/compact/sign` after auth.

## Logout

Handled by Clerk SDK on the client (ends session + clears tokens). No backend endpoint required.

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

`GET /auth/me` should:
- Trust Clerk middleware for auth context.
- Upsert local user if missing (Clerk ID, email, name, pushToken).
- Return current user profile + counts derived from local DB (sessions, etc.).

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
  "meetwithoutfear:session:sess_abc123": ["subscribe", "publish"],
  "meetwithoutfear:session:sess_abc123:presence": ["presence"]
}
```

---

## Security Considerations

### Rate Limiting

Rate limiting for authentication endpoints (login, register, password reset) is handled by **Clerk**. The backend only rate-limits its own endpoints:

| Endpoint | Limit |
|----------|-------|
| `/auth/ably-token` | 10 per minute per user |
| `/auth/me` | 30 per minute per user |
| `/auth/push-token` | 5 per minute per user |

### Token Storage (Mobile)

Clerk manages session tokens automatically. For best security:

- Use Clerk's secure token storage (handles platform-specific secure storage)
- Access tokens are managed in memory by Clerk SDK
- Never manually store tokens in AsyncStorage
- Ably tokens can be stored in memory (short-lived, ~60 min TTL)

---

## Related Documentation

- [Realtime Integration](./realtime.md) - Ably token usage
- [Sessions API](./sessions.md) - Authenticated session access

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
