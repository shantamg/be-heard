---
slug: /backend/api/sessions
sidebar_position: 2
---

# Sessions API

Session creation, listing, and lifecycle management.

## Create Session

Creates a new session and sends an invitation to the partner.

```
POST /api/v1/sessions
```

### Request Body

```typescript
interface CreateSessionRequest {
  // Option 1: Invite existing person
  personId?: string;

  // Option 2: Invite by contact info
  inviteEmail?: string;
  invitePhone?: string;
  inviteName?: string;

  // Optional context (private to creator)
  context?: string;
}
```

### Validation Rules

- Must provide either `personId` OR (`inviteEmail` | `invitePhone`)
- Cannot have an active session with the same person
- Email/phone must be valid format

### Invitation Delivery

- **Email**: Sent via [Resend](https://resend.com) when `inviteEmail` is provided
- **Phone**: Sent via [Twilio](https://twilio.com) SMS when `invitePhone` is provided

See [Invitations API](./invitations.md) for delivery details.

### Response

```typescript
interface CreateSessionResponse {
  session: SessionSummaryDTO;
  invitationId: string;
  invitationUrl: string;  // Deep link for partner
}
```

### Example

```bash
curl -X POST /api/v1/sessions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "inviteEmail": "partner@example.com",
    "inviteName": "Alex",
    "context": "Discussion about household responsibilities"
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "sess_abc123",
      "relationshipId": "rel_xyz789",
      "status": "INVITED",
      "createdAt": "2024-01-15T10:30:00Z",
      "partner": {
        "id": "user_pending",
        "name": "Alex"
      },
      "myProgress": {
        "stage": 0,
        "status": "NOT_STARTED",
        "startedAt": null,
        "completedAt": null
      },
      "partnerProgress": {
        "stage": 0,
        "status": "NOT_STARTED",
        "startedAt": null,
        "completedAt": null
      },
      "selfActionNeeded": ["compactSigned"],
      "partnerActionNeeded": ["partnerCompactSigned"]
    },
    "invitationId": "inv_def456",
    "invitationUrl": "meetwithoutfear://invite/inv_def456"
  }
}
```

### Errors

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Invalid email/phone format |
| `CONFLICT` | Active session already exists with this person |
| `NOT_FOUND` | `personId` doesn't exist |

---

## List Sessions

Get all sessions for the authenticated user.

```
GET /api/v1/sessions
```

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | all | Filter by status (ACTIVE, RESOLVED, etc.) |
| `cursor` | string | - | Pagination cursor |
| `limit` | number | 20 | Max results (1-50) |

### Response

```typescript
interface ListSessionsResponse {
  sessions: SessionSummaryDTO[];
  cursor?: string;
  hasMore: boolean;
}
```

### Example

```bash
curl /api/v1/sessions?status=ACTIVE \
  -H "Authorization: Bearer <token>"
```

---

## Get Session Details

Get full details for a specific session.

```
GET /api/v1/sessions/:id
```

### Response

```typescript
interface SessionDetailDTO {
  id: string;
  relationshipId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;

  partner: {
    id: string;
    name: string | null;
  };

  myProgress: StageProgressDTO;
  partnerProgress: StageProgressDTO;

  relationship: {
    id: string;
    createdAt: string;
    sessionCount: number;
  };

  currentGates: StageGateDTO[];
  resolvedAt: string | null;

  selfActionNeeded: string[];
  partnerActionNeeded: string[];
}
```

### Errors

| Code | When |
|------|------|
| `NOT_FOUND` | Session doesn't exist |
| `FORBIDDEN` | User is not a participant |

---

## Pause Session

Temporarily pause an active session (cooling period).

```
POST /api/v1/sessions/:id/pause
```

### Request Body

```typescript
interface PauseSessionRequest {
  reason?: string;  // Optional: why pausing
}
```

### Response

```typescript
interface PauseSessionResponse {
  session: SessionSummaryDTO;
  pausedAt: string;
}
```

### Side Effects

- Partner receives notification
- Both users can still view history but cannot send messages
- Emotional readings can still be recorded

---

## Resume Session

Resume a paused session.

```
POST /api/v1/sessions/:id/resume
```

### Response

```typescript
interface ResumeSessionResponse {
  session: SessionSummaryDTO;
  resumedAt: string;
}
```

---

## Related Documentation

- [User Journey](../../overview/user-journey.md) - High-level session flow
- [Session Status States](../../wireframes/session-dashboard.md) - UI states for sessions
- [Invitations API](./invitations.md) - Partner invitation flow

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
