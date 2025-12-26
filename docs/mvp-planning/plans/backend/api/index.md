---
slug: /backend/api
sidebar_position: 1
---

# API Specification

REST API endpoints for the BeHeard backend. All endpoints use JSON request/response bodies.

## Base URL

```
/api/v1
```

## Authentication

All endpoints require authentication via Bearer token (JWT) except where noted.

```
Authorization: Bearer <token>
```

## Response Format

All responses follow this structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

## Endpoint Categories

### [Sessions](./sessions.md)
Session creation, invitations, and lifecycle management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create new session and invite partner |
| `GET` | `/sessions` | List user's sessions |
| `GET` | `/sessions/:id` | Get session details |
| `POST` | `/sessions/:id/pause` | Pause session |
| `POST` | `/sessions/:id/resume` | Resume paused session |

### [Invitations](./invitations.md)
Invitation acceptance and management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/invitations/:id` | Get invitation details |
| `POST` | `/invitations/:id/accept` | Accept invitation |
| `POST` | `/invitations/:id/decline` | Decline invitation |

### [Stages](./stages.md)
Stage progression and gate validation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/progress` | Get stage progress for both users |
| `POST` | `/sessions/:id/stages/advance` | Advance to next stage |
| `GET` | `/sessions/:id/stages/:stage/gates` | Get gate satisfaction status |

### [Stage 0: Onboarding](./stage-0.md)
Curiosity Compact signing.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/compact/sign` | Sign the Curiosity Compact |
| `GET` | `/sessions/:id/compact/status` | Get compact signing status |

### [Stage 1: Witness](./stage-1.md)
Chat and emotional barometer for witness stage.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/messages` | Send message (any stage) |
| `GET` | `/sessions/:id/messages` | Get message history |
| `POST` | `/sessions/:id/feel-heard` | Confirm feeling heard |

### [Stage 2: Perspective Stretch](./stage-2.md)
Empathy exchange and consent flows.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/empathy/draft` | Save empathy attempt draft |
| `GET` | `/sessions/:id/empathy/draft` | Get current empathy draft |
| `POST` | `/sessions/:id/empathy/consent` | Consent to share empathy attempt |
| `GET` | `/sessions/:id/empathy/partner` | Get partner's empathy attempt |
| `POST` | `/sessions/:id/empathy/validate` | Validate partner's attempt |

### [Emotional Barometer](./emotional-barometer.md)
Emotional tracking across all stages.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/emotions` | Record emotional reading |
| `GET` | `/sessions/:id/emotions` | Get emotional history |
| `POST` | `/sessions/:id/exercises/complete` | Log exercise completion |

### [Stage 3: Need Mapping](./stage-3.md)
Need synthesis and common ground discovery.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/needs` | Get synthesized needs |
| `POST` | `/sessions/:id/needs/confirm` | Confirm/adjust needs |
| `POST` | `/sessions/:id/needs/consent` | Consent to share needs |
| `GET` | `/sessions/:id/common-ground` | Get common ground |
| `POST` | `/sessions/:id/common-ground/confirm` | Confirm common ground |

### [Stage 4: Strategic Repair](./stage-4.md)
Collaborative strategy and agreement.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/strategies` | Get strategy pool (unlabeled) |
| `POST` | `/sessions/:id/strategies` | Propose new strategy |
| `POST` | `/sessions/:id/strategies/suggest` | Request AI suggestions |
| `POST` | `/sessions/:id/strategies/rank` | Submit private ranking |
| `GET` | `/sessions/:id/strategies/overlap` | Get ranking overlap |
| `POST` | `/sessions/:id/agreements` | Create agreement |
| `POST` | `/sessions/:id/resolve` | Resolve session |

### [Consent](./consent.md)
Consensual Bridge mechanism.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/:id/consent/pending` | Get pending consent requests |
| `POST` | `/sessions/:id/consent/decide` | Grant or deny consent |
| `POST` | `/sessions/:id/consent/revoke` | Revoke previously granted consent |

### [Realtime](./realtime.md)
Ably channels for real-time updates.

| Channel | Purpose |
|---------|---------|
| `beheard:session:{id}` | Session events (stage completion, agreements) |
| `beheard:session:{id}:presence` | Partner online/offline status |

### [Authentication](./auth.md)
User registration and token management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Authenticate |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate tokens |
| `GET` | `/auth/me` | Get current user |
| `GET` | `/auth/ably-token` | Get Ably token for realtime |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | User doesn't have access to resource |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `GATE_NOT_SATISFIED` | 400 | Stage gate requirements not met |
| `CONSENT_REQUIRED` | 403 | Content requires consent to access |
| `PARTNER_NOT_READY` | 400 | Partner hasn't completed required action |
| `SESSION_NOT_ACTIVE` | 400 | Session is paused, resolved, or abandoned |

## Real-time Updates

For real-time partner status updates, use Ably pub/sub. See [Real-time Integration](./realtime.md).

---

[Back to Backend](../index.md)
