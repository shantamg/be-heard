---
slug: /backend/testing/e2e-tests
sidebar_position: 4
---

# E2E Tests

Testing complete user flows from start to finish.

## Scope

E2E tests verify:
- Complete happy-path flows
- Critical user journeys
- Cross-stage behavior
- Real-time notifications (mocked Ably)

## Focus Areas

| Flow | Priority | Description |
|------|----------|-------------|
| Session creation to Stage 1 | Critical | Onboarding happy path |
| Stage 1 to Stage 2 transition | Critical | First consent boundary |
| Complete session resolution | High | Full journey validation |
| Invitation acceptance | High | Partner onboarding |

## Test Structure

```
tests/
├── e2e/
│   ├── flows/
│   │   ├── onboarding-to-witness.test.ts
│   │   ├── perspective-exchange.test.ts
│   │   ├── full-resolution.test.ts
│   │   └── invitation-flow.test.ts
│   └── helpers/
│       ├── actors.ts
│       └── scenarios.ts
```

## Actor Pattern

Use actors to simulate real users:

```typescript
// tests/e2e/helpers/actors.ts
import { request } from '../setup';

export class TestActor {
  private token: string = '';

  constructor(
    public readonly email: string,
    public readonly name: string
  ) {}

  async register() {
    const response = await request
      .post('/api/v1/auth/register')
      .send({
        email: this.email,
        password: 'password123',
        name: this.name,
      });

    this.token = response.body.data.accessToken;
    return this;
  }

  async login() {
    const response = await request
      .post('/api/v1/auth/login')
      .send({
        email: this.email,
        password: 'password123',
      });

    this.token = response.body.data.accessToken;
    return this;
  }

  // Session actions
  async createSession(partnerEmail: string) {
    return request
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${this.token}`)
      .send({ inviteEmail: partnerEmail });
  }

  async acceptInvitation(invitationId: string) {
    return request
      .post(`/api/v1/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${this.token}`);
  }

  async signCompact(sessionId: string) {
    return request
      .post(`/api/v1/sessions/${sessionId}/compact/sign`)
      .set('Authorization', `Bearer ${this.token}`);
  }

  async sendMessage(sessionId: string, content: string, intensity?: number) {
    return request
      .post(`/api/v1/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${this.token}`)
      .send({ content, emotionalIntensity: intensity });
  }

  async confirmFeelHeard(sessionId: string) {
    return request
      .post(`/api/v1/sessions/${sessionId}/feel-heard`)
      .set('Authorization', `Bearer ${this.token}`)
      .send({ confirmed: true });
  }

  async advanceStage(sessionId: string, from: number, to: number) {
    return request
      .post(`/api/v1/sessions/${sessionId}/stages/advance`)
      .set('Authorization', `Bearer ${this.token}`)
      .send({ fromStage: from, toStage: to });
  }

  // Add more actions as needed...
}

export function createActors() {
  return {
    alice: new TestActor('alice@example.com', 'Alice'),
    bob: new TestActor('bob@example.com', 'Bob'),
  };
}
```

## Example: Onboarding to Witness Flow

```typescript
// tests/e2e/flows/onboarding-to-witness.test.ts
import { createActors, TestActor } from '../helpers/actors';

describe('E2E: Onboarding to Witness', () => {
  let alice: TestActor;
  let bob: TestActor;
  let sessionId: string;

  beforeAll(async () => {
    const actors = createActors();
    alice = actors.alice;
    bob = actors.bob;

    // Register both users
    await alice.register();
    await bob.register();
  });

  it('should complete full onboarding flow', async () => {
    // Step 1: Alice creates session
    const createResponse = await alice.createSession(bob.email);
    expect(createResponse.status).toBe(201);

    sessionId = createResponse.body.data.session.id;
    const invitationId = createResponse.body.data.invitationId;

    // Step 2: Bob accepts invitation
    const acceptResponse = await bob.acceptInvitation(invitationId);
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.session.status).toBe('ACTIVE');

    // Step 3: Both sign compact
    const aliceSign = await alice.signCompact(sessionId);
    expect(aliceSign.body.data.canAdvance).toBe(false);

    const bobSign = await bob.signCompact(sessionId);
    expect(bobSign.body.data.canAdvance).toBe(true);

    // Step 4: Both advance to Stage 1
    const aliceAdvance = await alice.advanceStage(sessionId, 0, 1);
    expect(aliceAdvance.body.data.newProgress.stage).toBe(1);

    const bobAdvance = await bob.advanceStage(sessionId, 0, 1);
    expect(bobAdvance.body.data.newProgress.stage).toBe(1);
  });

  it('should complete Stage 1 independently', async () => {
    // Alice works through Stage 1
    await alice.sendMessage(sessionId, 'I feel so frustrated about this situation', 6);
    await alice.sendMessage(sessionId, 'They never seem to understand', 7);
    await alice.sendMessage(sessionId, 'Yes, I feel fully heard now');

    const aliceConfirm = await alice.confirmFeelHeard(sessionId);
    expect(aliceConfirm.body.data.confirmed).toBe(true);
    expect(aliceConfirm.body.data.canAdvance).toBe(true);

    // Alice can advance even though Bob hasn't finished
    const aliceAdvance = await alice.advanceStage(sessionId, 1, 2);
    expect(aliceAdvance.body.data.success).toBe(true);

    // Bob finishes later
    await bob.sendMessage(sessionId, 'This has been weighing on me', 5);
    await bob.confirmFeelHeard(sessionId);

    const bobAdvance = await bob.advanceStage(sessionId, 1, 2);
    expect(bobAdvance.body.data.success).toBe(true);
  });
});
```

## Example: Full Resolution Flow

```typescript
// tests/e2e/flows/full-resolution.test.ts
import { createActors } from '../helpers/actors';
import { completeOnboarding, completeWitness, completePerspective, completeNeedMapping } from '../helpers/scenarios';

describe('E2E: Full Session Resolution', () => {
  let alice: TestActor;
  let bob: TestActor;
  let sessionId: string;

  beforeAll(async () => {
    const actors = createActors();
    alice = actors.alice;
    bob = actors.bob;

    await alice.register();
    await bob.register();

    // Complete stages 0-3 using helper scenarios
    sessionId = await completeOnboarding(alice, bob);
    await completeWitness(alice, bob, sessionId);
    await completePerspective(alice, bob, sessionId);
    await completeNeedMapping(alice, bob, sessionId);
  });

  it('should complete Stage 4 with agreement', async () => {
    // Both propose strategies
    await alice.proposeStrategy(sessionId, {
      description: 'Daily 10-minute check-in',
      duration: '1 week',
    });

    await bob.proposeStrategy(sessionId, {
      description: 'Weekly planning session',
      duration: '1 month',
    });

    // Mark ready for ranking
    await alice.markReadyToRank(sessionId);
    await bob.markReadyToRank(sessionId);

    // Both rank strategies
    await alice.submitRanking(sessionId, [
      { strategyId: 'strat_1', rank: 1 },
      { strategyId: 'strat_2', rank: 2 },
    ]);

    await bob.submitRanking(sessionId, [
      { strategyId: 'strat_1', rank: 1 },  // Same top pick!
      { strategyId: 'strat_2', rank: 2 },
    ]);

    // Check overlap
    const overlap = await alice.getOverlap(sessionId);
    expect(overlap.body.data.overlap).toHaveLength(1);
    expect(overlap.body.data.noOverlap).toBe(false);

    // Create agreement from overlap
    const agreement = await alice.createAgreement(sessionId, {
      strategyId: 'strat_1',
      duration: '1 week',
      measureOfSuccess: 'Did we do daily check-ins?',
    });

    // Bob confirms
    await bob.confirmAgreement(sessionId, agreement.body.data.agreement.id);

    // Resolve session
    const resolution = await alice.resolveSession(sessionId);
    expect(resolution.body.data.resolved).toBe(true);
    expect(resolution.body.data.agreements).toHaveLength(1);
  });
});
```

## Scenario Helpers

```typescript
// tests/e2e/helpers/scenarios.ts
import { TestActor } from './actors';

export async function completeOnboarding(alice: TestActor, bob: TestActor): Promise<string> {
  const createResponse = await alice.createSession(bob.email);
  const sessionId = createResponse.body.data.session.id;
  const invitationId = createResponse.body.data.invitationId;

  await bob.acceptInvitation(invitationId);
  await alice.signCompact(sessionId);
  await bob.signCompact(sessionId);
  await alice.advanceStage(sessionId, 0, 1);
  await bob.advanceStage(sessionId, 0, 1);

  return sessionId;
}

export async function completeWitness(alice: TestActor, bob: TestActor, sessionId: string) {
  // Alice
  await alice.sendMessage(sessionId, 'Sharing my perspective...', 5);
  await alice.confirmFeelHeard(sessionId);
  await alice.advanceStage(sessionId, 1, 2);

  // Bob
  await bob.sendMessage(sessionId, 'This is how I see things...', 4);
  await bob.confirmFeelHeard(sessionId);
  await bob.advanceStage(sessionId, 1, 2);
}

// Add more scenario helpers...
```

## Performance Benchmarks

```typescript
// tests/e2e/performance/session-creation.test.ts
describe('Performance: Session Creation', () => {
  it('should create session under 500ms', async () => {
    const start = Date.now();

    await alice.createSession('test@example.com');

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should handle 10 concurrent session creations', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      alice.createSession(`test${i}@example.com`)
    );

    const results = await Promise.all(promises);
    const allSucceeded = results.every(r => r.status === 201);

    expect(allSucceeded).toBe(true);
  });
});
```

## Related Documentation

- [Unit Tests](./unit-tests.md)
- [Integration Tests](./integration-tests.md)
- [User Journey](../../overview/user-journey.md)

---

[Back to Testing](./index.md)
