---
slug: /backend/testing/integration-tests
sidebar_position: 3
---

# Integration Tests

Testing API endpoints and database interactions.

## Scope

Integration tests verify:
- API endpoint behavior
- Database queries and RLS policies
- Authentication flows
- Request validation
- Response formats

## Structure

```
tests/
├── integration/
│   ├── auth/
│   │   ├── register.test.ts
│   │   ├── login.test.ts
│   │   └── refresh.test.ts
│   ├── sessions/
│   │   ├── create.test.ts
│   │   ├── invite.test.ts
│   │   └── progress.test.ts
│   ├── stages/
│   │   ├── stage-0.test.ts
│   │   ├── stage-1.test.ts
│   │   └── stage-2.test.ts
│   └── consent/
│       └── consent-flow.test.ts
```

## Test Setup

```typescript
// tests/integration/setup.ts
import { createServer } from '@/server';
import { prisma } from '@/db';
import supertest from 'supertest';

export const app = createServer();
export const request = supertest(app);

// Test user factory
export async function createTestUser(data?: Partial<User>) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      password: await hash('password123'),
      name: 'Test User',
      ...data,
    },
  });
}

// Test session factory
export async function createTestSession(userA: User, userB: User) {
  const relationship = await prisma.relationship.create({
    data: {
      members: {
        create: [
          { userId: userA.id },
          { userId: userB.id },
        ],
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      relationshipId: relationship.id,
      status: 'ACTIVE',
      sharedVessel: { create: {} },
      userVessels: {
        create: [
          { userId: userA.id },
          { userId: userB.id },
        ],
      },
    },
  });

  return session;
}

// Auth helper
export async function getAuthToken(user: User) {
  const { body } = await request
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: 'password123' });

  return body.data.accessToken;
}
```

## Example: Session Creation

```typescript
// tests/integration/sessions/create.test.ts
import { request, createTestUser, getAuthToken } from '../setup';

describe('POST /api/v1/sessions', () => {
  let user: User;
  let token: string;

  beforeEach(async () => {
    user = await createTestUser();
    token = await getAuthToken(user);
  });

  it('should create session with email invitation', async () => {
    const response = await request
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        inviteEmail: 'partner@example.com',
        inviteName: 'Partner',
        context: 'Test session',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.session.status).toBe('INVITED');
    expect(response.body.data.invitationId).toBeDefined();
  });

  it('should reject duplicate active session with same person', async () => {
    // Create first session
    await request
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteEmail: 'partner@example.com' });

    // Try to create second session with same email
    const response = await request
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteEmail: 'partner@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('should require authentication', async () => {
    const response = await request
      .post('/api/v1/sessions')
      .send({ inviteEmail: 'partner@example.com' });

    expect(response.status).toBe(401);
  });
});
```

## Example: Stage Advancement

```typescript
// tests/integration/stages/stage-0.test.ts
import { request, createTestUser, createTestSession, getAuthToken } from '../setup';

describe('Stage 0: Compact Signing', () => {
  let userA: User;
  let userB: User;
  let session: Session;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    session = await createTestSession(userA, userB);
    tokenA = await getAuthToken(userA);
    tokenB = await getAuthToken(userB);

    // Initialize stage progress
    await prisma.stageProgress.createMany({
      data: [
        { sessionId: session.id, userId: userA.id, stage: 0, status: 'IN_PROGRESS' },
        { sessionId: session.id, userId: userB.id, stage: 0, status: 'IN_PROGRESS' },
      ],
    });
  });

  describe('POST /sessions/:id/compact/sign', () => {
    it('should record user signature', async () => {
      const response = await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body.data.signed).toBe(true);
      expect(response.body.data.partnerSigned).toBe(false);
      expect(response.body.data.canAdvance).toBe(false);
    });

    it('should allow advance when both signed', async () => {
      // User A signs
      await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);

      // User B signs
      const response = await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.body.data.canAdvance).toBe(true);
    });

    it('should reject double signing', async () => {
      // Sign once
      await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);

      // Try to sign again
      const response = await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(409);
    });
  });

  describe('POST /sessions/:id/stages/advance', () => {
    it('should advance when gates satisfied', async () => {
      // Both sign
      await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);
      await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Advance
      const response = await request
        .post(`/api/v1/sessions/${session.id}/stages/advance`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ fromStage: 0, toStage: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.newProgress.stage).toBe(1);
    });

    it('should reject advance when gates not satisfied', async () => {
      // Only A signs
      await request
        .post(`/api/v1/sessions/${session.id}/compact/sign`)
        .set('Authorization', `Bearer ${tokenA}`);

      // Try to advance
      const response = await request
        .post(`/api/v1/sessions/${session.id}/stages/advance`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ fromStage: 0, toStage: 1 });

      expect(response.body.data.success).toBe(false);
      expect(response.body.data.blockedReason).toBe('GATES_NOT_SATISFIED');
    });
  });
});
```

## Example: RLS Policy Testing

```typescript
// tests/integration/rls/vessel-isolation.test.ts
import { prisma } from '@/db';
import { createTestUser, createTestSession } from '../setup';

describe('RLS: Vessel Isolation', () => {
  let userA: User;
  let userB: User;
  let session: Session;

  beforeEach(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    session = await createTestSession(userA, userB);
  });

  it('should prevent user from seeing partner vessel', async () => {
    // Create event in user A's vessel
    const vesselA = await prisma.userVessel.findFirst({
      where: { userId: userA.id, sessionId: session.id },
    });

    await prisma.userEvent.create({
      data: {
        vesselId: vesselA!.id,
        description: 'Private event',
        attributedTo: 'SELF',
        emotions: ['frustrated'],
      },
    });

    // Set RLS context as user B
    await prisma.$executeRaw`SET LOCAL app.actor_id = ${userB.id}`;

    // Try to query user A's events
    const events = await prisma.userEvent.findMany({
      where: {
        vessel: { userId: userA.id },
      },
    });

    // RLS should return empty
    expect(events).toHaveLength(0);
  });

  it('should allow user to see own vessel', async () => {
    // Create event in user A's vessel
    const vesselA = await prisma.userVessel.findFirst({
      where: { userId: userA.id, sessionId: session.id },
    });

    await prisma.userEvent.create({
      data: {
        vesselId: vesselA!.id,
        description: 'My private event',
        attributedTo: 'SELF',
        emotions: ['hopeful'],
      },
    });

    // Set RLS context as user A
    await prisma.$executeRaw`SET LOCAL app.actor_id = ${userA.id}`;

    // Query own events
    const events = await prisma.userEvent.findMany();

    expect(events).toHaveLength(1);
    expect(events[0].description).toBe('My private event');
  });
});
```

## Example: Consent Flow

```typescript
// tests/integration/consent/consent-flow.test.ts
import { request, createTestUser, createTestSession, getAuthToken } from '../setup';

describe('Consent Flow', () => {
  let userA: User;
  let userB: User;
  let session: Session;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    session = await createTestSession(userA, userB);
    tokenA = await getAuthToken(userA);
    tokenB = await getAuthToken(userB);

    // Advance to Stage 2
    await advanceToStage(session.id, 2);
  });

  it('should require consent before sharing content', async () => {
    // User A creates empathy draft
    await request
      .post(`/api/v1/sessions/${session.id}/empathy/draft`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'I think you feel...' });

    // User B tries to access before consent
    const response = await request
      .get(`/api/v1/sessions/${session.id}/empathy/partner`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('should allow access after consent granted', async () => {
    // User A creates and consents
    await request
      .post(`/api/v1/sessions/${session.id}/empathy/draft`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'I think you feel overwhelmed' });

    await request
      .post(`/api/v1/sessions/${session.id}/empathy/consent`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ draftId: 'draft_123' });

    // User B can now access
    const response = await request
      .get(`/api/v1/sessions/${session.id}/empathy/partner`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(200);
    expect(response.body.data.attempt.content).toBeDefined();
  });

  it('should revoke access after consent revoked', async () => {
    // Grant consent
    const consentResponse = await request
      .post(`/api/v1/sessions/${session.id}/empathy/consent`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ draftId: 'draft_123' });

    const consentRecordId = consentResponse.body.data.consentRecord.id;

    // Revoke consent
    await request
      .post(`/api/v1/sessions/${session.id}/consent/revoke`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ consentRecordId });

    // User B can no longer access
    const response = await request
      .get(`/api/v1/sessions/${session.id}/empathy/partner`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(403);
  });
});
```

## Related Documentation

- [Unit Tests](./unit-tests.md)
- [E2E Tests](./e2e-tests.md)
- [API Endpoints](../api/index.md)

---

[Back to Testing](./index.md)
