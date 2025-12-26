---
slug: /backend/testing
sidebar_position: 1
---

# Testing Strategy

Testing approach for BeHeard backend.

## Documentation

### [Unit Tests](./unit-tests.md)
Testing individual functions and services in isolation.

### [Integration Tests](./integration-tests.md)
Testing API endpoints and database interactions.

### [E2E Tests](./e2e-tests.md)
Testing complete user flows.

## Test Pyramid

```mermaid
graph TB
    subgraph Pyramid[Test Pyramid]
        E2E[E2E Tests<br/>Few, Slow, High Confidence]
        Integration[Integration Tests<br/>Some, Medium Speed]
        Unit[Unit Tests<br/>Many, Fast, Isolated]
    end

    E2E --> Integration --> Unit

    style E2E fill:#f9f,stroke:#333
    style Integration fill:#bbf,stroke:#333
    style Unit fill:#bfb,stroke:#333
```

## Coverage Goals

| Layer | Target Coverage | Focus |
|-------|-----------------|-------|
| Unit | 80%+ | Business logic, utilities |
| Integration | 60%+ | API endpoints, DB queries |
| E2E | Critical paths | Happy path flows |

## Testing Stack

| Tool | Purpose |
|------|---------|
| Jest | Test runner |
| Supertest | HTTP assertions |
| Prisma | Test database |
| MSW | API mocking |
| Faker | Test data generation |

## Test Database

Use a separate test database:

```bash
# .env.test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beheard_test
```

### Reset Between Tests

```typescript
// tests/setup.ts
import { prisma } from '../src/db';

beforeEach(async () => {
  // Clear all tables
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.consentedContent.deleteMany(),
    prisma.consentRecord.deleteMany(),
    prisma.stageProgress.deleteMany(),
    prisma.session.deleteMany(),
    prisma.relationshipMember.deleteMany(),
    prisma.relationship.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
```

## What to Test

### Must Test

| Area | Priority | Reason |
|------|----------|--------|
| Retrieval contracts | Critical | Privacy enforcement |
| Stage gate validation | Critical | Process integrity |
| Consent flows | Critical | Trust requirements |
| Auth/JWT | High | Security |
| RLS policies | High | Defense in depth |

### Can Skip (MVP)

| Area | Reason |
|------|--------|
| UI rendering | Mobile handles this |
| Third-party integrations | Mock in tests |
| Performance | Optimize later |

---

[Back to Backend](../index.md)
