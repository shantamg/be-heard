# Test Patterns

MWF is an **npm-workspaces monorepo**. Both backend and mobile use **Jest**
(backend: ts-jest; mobile: jest-expo). There is no vitest and no pnpm.

## Backend Tests (Jest + ts-jest)

Tests live in `__tests__/` directories alongside source (e.g.
`backend/src/middleware/__tests__/auth.test.ts`). `describe/it/expect/jest` are
global; the mock helper imports `jest` from `@jest/globals`.

### Prisma Mock Pattern

The Prisma client lives at `backend/src/lib/prisma` and has a manual mock at
`backend/src/lib/__mocks__/prisma.ts` (every model pre-stubbed). Activate it with
a bare `jest.mock` of the prisma module — Jest auto-uses the `__mocks__` version —
then drive individual calls by casting to `jest.Mock`:

```typescript
import { prisma } from '../../lib/prisma';
import { handler } from '../route-handler';

// Auto-mock — Jest picks up backend/src/lib/__mocks__/prisma.ts
jest.mock('../../lib/prisma');

// Mock collaborating services as needed
jest.mock('../../services/empathy-state-machine', () => ({
  advanceEmpathyState: jest.fn(),
}));

describe('handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles the happy path', async () => {
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'abc',
      status: 'ACTIVE',
    });
    // ... test logic
  });

  it('handles a missing session (regression test for bug)', async () => {
    (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
    // ... assert the fix works
  });
});
```

### Running Backend Tests

```bash
npm test --workspace backend
# Target a specific file:
cd backend && npx jest src/services/__tests__/empathy-state-machine.test.ts
# See console output while debugging (backend runs silent by default):
npm test --workspace backend -- --verbose
```

## Mobile Tests (jest-expo)

Mobile uses jest-expo with React Native Testing Library.

### Component Test Pattern

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MyComponent } from '../MyComponent';

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent data={mockData} />);
    expect(screen.getByText('Expected Text')).toBeTruthy();
  });

  it('handles null data without crashing', () => {
    // Regression test for the bug
    render(<MyComponent data={null} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
```

### Running Mobile Tests

```bash
npm test --workspace mobile
# Target a specific file:
cd mobile && npx jest src/components/__tests__/MyComponent.test.tsx
```

## Bug Fix Test Strategy

When fixing a bug, write tests that:

1. **Reproduce the bug** -- a test that would have caught the original issue
2. **Verify the fix** -- the same test now passes with the fix
3. **Cover edge cases** -- null values, empty arrays, missing fields, boundary conditions

Name regression tests clearly:
```typescript
it('does not fire Felt Heard Response with empty session_id (fixes #NNN)', () => {
  // ...
});
```

> Before considering a fix done, run `npm run check` (types across all workspaces)
> and `npm run test` (all workspaces), per the repo's verification practice.
