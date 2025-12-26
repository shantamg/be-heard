---
slug: /backend/api/invitations
sidebar_position: 3
---

# Invitations API

Invitation acceptance and management for session partners.

## Get Invitation Details

Get details about an invitation (can be accessed without auth for preview).

```
GET /api/v1/invitations/:id
```

### Response

```typescript
interface InvitationDTO {
  id: string;
  sessionId: string;
  invitedBy: {
    id: string;
    name: string | null;
  };
  status: InvitationStatus;  // PENDING, ACCEPTED, DECLINED, EXPIRED
  createdAt: string;
  expiresAt: string;
}
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "inv_def456",
    "sessionId": "sess_abc123",
    "invitedBy": {
      "id": "user_123",
      "name": "Jordan"
    },
    "status": "PENDING",
    "createdAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-22T10:30:00Z"
  }
}
```

### Errors

| Code | When |
|------|------|
| `NOT_FOUND` | Invitation doesn't exist |
| `INVITATION_EXPIRED` | Invitation has expired |

---

## Accept Invitation

Accept an invitation and join the session. Requires authentication.

```
POST /api/v1/invitations/:id/accept
```

### Authentication

- If user is already registered, use existing auth token
- If new user, must complete registration first (invitation ID is preserved)

### Response

```typescript
interface AcceptInvitationResponse {
  session: SessionSummaryDTO;
}
```

### Side Effects

1. Session status changes from `INVITED` to `ACTIVE`
2. Inviter receives push notification
3. Both users' StageProgress records are created for Stage 0
4. SharedVessel is created for the session
5. UserVessel is created for the accepting user

### Example

```bash
curl -X POST /api/v1/invitations/inv_def456/accept \
  -H "Authorization: Bearer <token>"
```

### Response

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "sess_abc123",
      "status": "ACTIVE",
      "partner": {
        "id": "user_123",
        "name": "Jordan"
      },
      "myProgress": {
        "stage": 0,
        "status": "IN_PROGRESS",
        "startedAt": "2024-01-16T14:00:00Z",
        "completedAt": null
      },
      "partnerProgress": {
        "stage": 0,
        "status": "IN_PROGRESS",
        "startedAt": "2024-01-15T10:30:00Z",
        "completedAt": null
      },
      "isMyTurn": true,
      "waitingOnPartner": false
    }
  }
}
```

### Errors

| Code | When |
|------|------|
| `NOT_FOUND` | Invitation doesn't exist |
| `INVITATION_EXPIRED` | Invitation has expired |
| `CONFLICT` | Invitation already accepted/declined |
| `FORBIDDEN` | User is the one who sent the invitation |

---

## Decline Invitation

Decline an invitation.

```
POST /api/v1/invitations/:id/decline
```

### Request Body

```typescript
interface DeclineInvitationRequest {
  reason?: string;  // Optional feedback
}
```

### Response

```typescript
interface DeclineInvitationResponse {
  declined: boolean;
  declinedAt: string;
}
```

### Side Effects

- Session status changes to `ABANDONED`
- Inviter receives notification
- Invitation cannot be re-accepted

---

## Resend Invitation

Resend invitation notification (for pending invitations only).

```
POST /api/v1/invitations/:id/resend
```

**Note**: Only the original inviter can resend.

### Response

```typescript
interface ResendInvitationResponse {
  sent: boolean;
  sentAt: string;
  expiresAt: string;  // Extended expiration
}
```

### Rate Limiting

- Max 3 resends per invitation
- Minimum 24 hours between resends

---

## Related Documentation

- [Sessions API](./sessions.md) - Session creation
- [New Session Flow](../../wireframes/new-session-flow.md) - UI flow for invitations
- [Stage 0: Onboarding](../../stages/stage-0-onboarding.md) - What happens after acceptance

---

[Back to API Index](./index.md) | [Back to Backend](../index.md)
