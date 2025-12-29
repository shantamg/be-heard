# Invitations API Implementation

## Source Documentation

- [Invitations API](../../docs/mvp-planning/plans/backend/api/invitations.md)
- [Sessions API](../../docs/mvp-planning/plans/backend/api/sessions.md)

## Prerequisites

- [ ] `backend/database.md` complete
- [ ] `backend/auth.md` complete
- [ ] `backend/realtime.md` complete

## External Services Required

> **User action needed:** Configure email/SMS for invitation delivery

1. **Email (Resend):**
   ```bash
   # backend/.env
   RESEND_API_KEY="re_..."
   FROM_EMAIL="noreply@meetwithoutfear.app"
   ```

2. **SMS (Twilio) - Optional for MVP:**
   ```bash
   TWILIO_ACCOUNT_SID="AC..."
   TWILIO_AUTH_TOKEN="..."
   TWILIO_PHONE_NUMBER="+1..."
   ```

## Scope

Implement invitation creation, delivery, acceptance, and decline.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/invitations.test.ts`:

```typescript
describe('Invitations API', () => {
  describe('POST /sessions', () => {
    it('creates session and invitation', async () => {
      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', 'Bearer valid-token')
        .send({
          inviteEmail: 'partner@example.com',
          inviteName: 'Partner Name'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.session).toBeDefined();
      expect(res.body.data.invitationId).toBeDefined();
      expect(res.body.data.invitationUrl).toContain('/invitation/');
    });
  });

  describe('GET /invitations/:id', () => {
    it('returns invitation details', async () => {
      const res = await request(app)
        .get('/api/v1/invitations/inv-123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.invitation).toHaveProperty('invitedBy');
      expect(res.body.data.invitation).toHaveProperty('status');
    });
  });

  describe('POST /invitations/:id/accept', () => {
    it('accepts invitation and joins session', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/inv-123/accept')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.session).toBeDefined();
    });

    it('rejects expired invitation', async () => {
      // Expired invitation returns 410 Gone
    });
  });

  describe('POST /invitations/:id/decline', () => {
    it('marks invitation as declined', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/inv-123/decline')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Not ready' });

      expect(res.body.data.declined).toBe(true);
    });
  });
});
```

### 2. Create invitation model in Prisma

Add to `backend/prisma/schema.prisma`:

```prisma
model Invitation {
  id          String           @id @default(cuid())
  session     Session          @relation(fields: [sessionId], references: [id])
  sessionId   String
  invitedBy   User             @relation("InvitedBy", fields: [invitedById], references: [id])
  invitedById String
  email       String?
  phone       String?
  name        String?
  status      InvitationStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  expiresAt   DateTime
  acceptedAt  DateTime?
  declinedAt  DateTime?
  declineReason String?

  @@index([sessionId])
  @@index([email])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}
```

### 3. Create email service

Create `backend/src/services/email.ts`:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  invitationUrl: string
) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL!,
    to,
    subject: `${inviterName} invited you to Meet Without Fear`,
    html: `
      <h1>You've been invited to Meet Without Fear</h1>
      <p>${inviterName} wants to work through something together.</p>
      <a href="${invitationUrl}" style="
        background: #4F46E5;
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 8px;
      ">Accept Invitation</a>
      <p>This invitation expires in 7 days.</p>
    `
  });
}
```

### 4. Create invitations controller

Create `backend/src/controllers/invitations.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendInvitationEmail } from '../services/email';
import { notifyPartner } from '../services/realtime';

export const createSession = async (req: Request, res: Response) => {
  const { personId, inviteEmail, invitePhone, inviteName, context } = req.body;
  const userId = req.user!.id;

  // Create or find relationship
  let relationship;
  if (personId) {
    relationship = await findOrCreateRelationship(userId, personId);
  } else {
    relationship = await prisma.relationship.create({ data: {} });
    await prisma.relationshipMember.create({
      data: { relationshipId: relationship.id, userId }
    });
  }

  // Create session
  const session = await prisma.session.create({
    data: {
      relationshipId: relationship.id,
      status: 'INVITED'
    }
  });

  // Create invitation
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const invitation = await prisma.invitation.create({
    data: {
      sessionId: session.id,
      invitedById: userId,
      email: inviteEmail,
      phone: invitePhone,
      name: inviteName,
      expiresAt
    }
  });

  const invitationUrl = `${process.env.APP_URL}/invitation/${invitation.id}`;

  // Send invitation
  if (inviteEmail) {
    await sendInvitationEmail(inviteEmail, req.user!.name || 'Someone', invitationUrl);
  }

  // Create initial stage progress for inviter
  await prisma.stageProgress.create({
    data: { sessionId: session.id, userId, stage: 0, status: 'IN_PROGRESS' }
  });

  // Create user vessels
  await prisma.userVessel.create({
    data: { sessionId: session.id, userId }
  });
  await prisma.sharedVessel.create({
    data: { sessionId: session.id }
  });

  res.status(201).json({
    success: true,
    data: {
      session: { id: session.id, status: session.status },
      invitationId: invitation.id,
      invitationUrl
    }
  });
};

export const acceptInvitation = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { session: true }
  });

  if (!invitation) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invitation not found' }
    });
  }

  if (invitation.status !== 'PENDING') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invitation already processed' }
    });
  }

  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id },
      data: { status: 'EXPIRED' }
    });
    return res.status(410).json({
      success: false,
      error: { code: 'EXPIRED', message: 'Invitation has expired' }
    });
  }

  // Join relationship
  await prisma.relationshipMember.create({
    data: {
      relationshipId: invitation.session.relationshipId,
      userId
    }
  });

  // Update invitation
  await prisma.invitation.update({
    where: { id },
    data: { status: 'ACCEPTED', acceptedAt: new Date() }
  });

  // Update session status
  await prisma.session.update({
    where: { id: invitation.sessionId },
    data: { status: 'ACTIVE' }
  });

  // Create stage progress for accepter
  await prisma.stageProgress.create({
    data: { sessionId: invitation.sessionId, userId, stage: 0, status: 'IN_PROGRESS' }
  });

  // Create user vessel
  await prisma.userVessel.create({
    data: { sessionId: invitation.sessionId, userId }
  });

  // Notify inviter
  await notifyPartner(invitation.sessionId, invitation.invitedById, 'session.joined', {});

  const session = await getSessionSummary(invitation.sessionId, userId);

  res.json({ success: true, data: { session } });
};
```

### 5. Install Resend

```bash
npm install resend
```

### 6. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Session creation sends invitation email
- [ ] Invitation URL is valid deep link
- [ ] Accept creates relationship membership
- [ ] Accept updates session to ACTIVE
- [ ] Expired invitations return 410
- [ ] Decline records reason
- [ ] Inviter notified on accept
- [ ] `npm run check` passes
- [ ] `npm run test` passes
