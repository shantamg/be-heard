---
slug: /backend/testing/unit-tests
sidebar_position: 2
---

# Unit Tests

Testing individual functions and services in isolation.

## Scope

Unit tests focus on:
- Pure functions
- Service methods (with mocked dependencies)
- Validation logic
- Utility functions

## Structure

```
tests/
├── unit/
│   ├── services/
│   │   ├── stage.test.ts
│   │   ├── consent.test.ts
│   │   └── retrieval.test.ts
│   ├── utils/
│   │   ├── validation.test.ts
│   │   └── jwt.test.ts
│   └── prompts/
│       └── transformation.test.ts
```

## Example: Stage Gate Validation

```typescript
// tests/unit/services/stage.test.ts
import { validateStageGates, canAdvanceStage } from '@/services/stage';
import { Stage, StageStatus } from '@shared/enums';

describe('Stage Gate Validation', () => {
  describe('Stage 0 Gates', () => {
    it('should require compact signed by user', () => {
      const gates = {
        stage: Stage.ONBOARDING,
        compactSigned: false,
        partnerCompactSigned: true,
      };

      expect(validateStageGates(gates)).toEqual({
        canAdvance: false,
        unsatisfiedGates: ['compactSigned'],
      });
    });

    it('should require compact signed by both parties', () => {
      const gates = {
        stage: Stage.ONBOARDING,
        compactSigned: true,
        partnerCompactSigned: false,
      };

      expect(validateStageGates(gates)).toEqual({
        canAdvance: false,
        unsatisfiedGates: ['partnerCompactSigned'],
      });
    });

    it('should allow advance when both signed', () => {
      const gates = {
        stage: Stage.ONBOARDING,
        compactSigned: true,
        partnerCompactSigned: true,
      };

      expect(validateStageGates(gates)).toEqual({
        canAdvance: true,
        unsatisfiedGates: [],
      });
    });
  });

  describe('Stage 1 Gates', () => {
    it('should require feel heard confirmation', () => {
      const gates = {
        stage: Stage.WITNESS,
        feelHeardConfirmed: false,
        finalEmotionalReading: 5,
      };

      expect(validateStageGates(gates)).toEqual({
        canAdvance: false,
        unsatisfiedGates: ['feelHeardConfirmed'],
      });
    });

    it('should not require partner completion (parallel stage)', () => {
      const gates = {
        stage: Stage.WITNESS,
        feelHeardConfirmed: true,
        finalEmotionalReading: 5,
      };

      // Note: No partnerCompleted gate - Stage 1 is parallel
      expect(validateStageGates(gates)).toEqual({
        canAdvance: true,
        unsatisfiedGates: [],
      });
    });
  });
});
```

## Example: Retrieval Contract Validation

```typescript
// tests/unit/services/retrieval.test.ts
import { validateRetrievalQuery, isValidForStage } from '@/services/retrieval';
import { Stage } from '@shared/enums';

describe('Retrieval Contract Validation', () => {
  describe('Stage 1 Contracts', () => {
    const currentUserId = 'user_123';
    const partnerId = 'user_456';

    it('should allow querying own user events', () => {
      const query = {
        type: 'user_event',
        vessel: 'user',
        source: 'structured',
        userId: currentUserId,
      };

      expect(isValidForStage(query, Stage.WITNESS, currentUserId)).toBe(true);
    });

    it('should forbid querying partner user events', () => {
      const query = {
        type: 'user_event',
        vessel: 'user',
        source: 'structured',
        userId: partnerId,
      };

      expect(isValidForStage(query, Stage.WITNESS, currentUserId)).toBe(false);
    });

    it('should forbid shared vessel queries', () => {
      const query = {
        type: 'consented_content',
        vessel: 'shared',
        source: 'structured',
        consentActive: true,
      };

      expect(isValidForStage(query, Stage.WITNESS, currentUserId)).toBe(false);
    });
  });

  describe('Stage 2 Contracts', () => {
    it('should allow shared vessel with consent check', () => {
      const query = {
        type: 'consented_content',
        vessel: 'shared',
        source: 'structured',
        consentActive: true,
      };

      expect(isValidForStage(query, Stage.PERSPECTIVE_STRETCH, 'user_123')).toBe(true);
    });

    it('should forbid shared vessel without consent check', () => {
      const query = {
        type: 'consented_content',
        vessel: 'shared',
        source: 'structured',
        // Missing consentActive: true
      };

      expect(isValidForStage(query, Stage.PERSPECTIVE_STRETCH, 'user_123')).toBe(false);
    });
  });

  describe('Stage 4 Contracts', () => {
    it('should forbid user vessel vector search', () => {
      const query = {
        type: 'user_event',
        vessel: 'user',
        source: 'vector',
        userId: 'user_123',
      };

      expect(isValidForStage(query, Stage.STRATEGIC_REPAIR, 'user_123')).toBe(false);
    });

    it('should allow global library vector search', () => {
      const query = {
        type: 'experiment_suggestion',
        vessel: 'global',
        source: 'vector',
      };

      expect(isValidForStage(query, Stage.STRATEGIC_REPAIR, 'user_123')).toBe(true);
    });
  });
});
```

## Example: Content Transformation

```typescript
// tests/unit/prompts/transformation.test.ts
import { transformContent, removeHeat } from '@/services/transformation';

describe('Content Transformation', () => {
  describe('removeHeat', () => {
    it('should convert accusations to I-statements', () => {
      const input = 'You never listen to me';
      const output = removeHeat(input);

      expect(output).not.toContain('You never');
      expect(output).toContain('feel');
    });

    it('should preserve core meaning', () => {
      const input = 'They completely ignored me at the party';
      const output = removeHeat(input);

      // Should still convey feeling unseen
      expect(output.toLowerCase()).toMatch(/invisible|unseen|alone|ignored/);
    });

    it('should remove character attacks', () => {
      const input = 'They are so selfish and inconsiderate';
      const output = removeHeat(input);

      expect(output).not.toContain('selfish');
      expect(output).not.toContain('inconsiderate');
    });
  });
});
```

## Example: JWT Utilities

```typescript
// tests/unit/utils/jwt.test.ts
import { generateTokens, verifyAccessToken, verifyRefreshToken } from '@/utils/jwt';

describe('JWT Utilities', () => {
  const userId = 'user_123';
  const email = 'test@example.com';

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateTokens({ userId, email });

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const { accessToken } = generateTokens({ userId, email });
      const payload = verifyAccessToken(accessToken);

      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe(email);
      expect(payload.type).toBe('access');
    });

    it('should reject expired token', () => {
      // Generate token with very short expiry
      const { accessToken } = generateTokens({ userId, email }, { accessExpiry: '1ms' });

      // Wait for expiry
      jest.advanceTimersByTime(100);

      expect(() => verifyAccessToken(accessToken)).toThrow('Token expired');
    });
  });
});
```

## Mocking Best Practices

### Mock External Services

```typescript
// tests/unit/services/ai.test.ts
import { generateResponse } from '@/services/ai';

// Mock Bedrock client
jest.mock('@/clients/bedrock', () => ({
  invoke: jest.fn().mockResolvedValue({
    content: 'Mocked AI response',
  }),
}));

describe('AI Service', () => {
  it('should generate response with correct prompt', async () => {
    const { invoke } = require('@/clients/bedrock');

    await generateResponse({
      stage: 1,
      userMessage: 'Test message',
      context: {},
    });

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining('sonnet'),
      })
    );
  });
});
```

### Mock Prisma

```typescript
// tests/unit/__mocks__/prisma.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

// Usage in tests
jest.mock('@/db', () => ({
  prisma: prismaMock,
}));
```

## Related Documentation

- [Integration Tests](./integration-tests.md)
- [Retrieval Contracts](../state-machine/retrieval-contracts.md)
- [Stage DTOs](../../../../shared/src/dto/stage.ts)

---

[Back to Testing](./index.md)
