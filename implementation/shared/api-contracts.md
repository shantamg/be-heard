# API Contracts Implementation

## Source Documentation

- [API Index](../../docs/mvp-planning/plans/backend/api/index.md)
- [Sessions API](../../docs/mvp-planning/plans/backend/api/sessions.md)
- [Auth API](../../docs/mvp-planning/plans/backend/api/auth.md)
- [Stages API](../../docs/mvp-planning/plans/backend/api/stages.md)

## Prerequisites

- [ ] `shared/session-types.md` complete

## External Services Required

> **None required.** This is pure TypeScript type definitions.

## Scope

Define request/response types and Zod schemas for all API endpoints. These contracts are used by:
- Backend: Request validation, response typing
- Mobile: API client typing, form validation

**Out of scope:** Actual API implementation (backend plans)

## Implementation Steps

### 1. Create API response wrapper

Create `shared/src/api.ts` (update existing):

```typescript
import { z } from 'zod';

// Standard API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Error codes enum
export enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  GATE_NOT_SATISFIED = 'GATE_NOT_SATISFIED',
  CONSENT_REQUIRED = 'CONSENT_REQUIRED',
  PARTNER_NOT_READY = 'PARTNER_NOT_READY',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
}

// Zod schema for API responses
export const apiErrorSchema = z.object({
  code: z.nativeEnum(ApiErrorCode),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
```

### 2. Create auth contracts

Create `shared/src/contracts/auth.ts`:

```typescript
import { z } from 'zod';

// GET /auth/me
export const getMeResponseSchema = z.object({
  user: userDTOSchema,
  activeSessions: z.number(),
  pushNotificationsEnabled: z.boolean(),
});

// PATCH /auth/me
export const updateProfileRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// POST /auth/push-token
export const updatePushTokenRequestSchema = z.object({
  pushToken: z.string(),
  platform: z.enum(['ios', 'android']),
});

// GET /auth/ably-token
export const ablyTokenResponseSchema = z.object({
  tokenRequest: z.object({
    keyName: z.string(),
    ttl: z.number(),
    timestamp: z.number(),
    capability: z.string(),
    clientId: z.string(),
    nonce: z.string(),
    mac: z.string(),
  }),
});
```

### 3. Create session contracts

Create `shared/src/contracts/sessions.ts`:

```typescript
import { z } from 'zod';

// POST /sessions
export const createSessionRequestSchema = z.object({
  personId: z.string().cuid().optional(),
  inviteEmail: z.string().email().optional(),
  invitePhone: z.string().optional(),
  inviteName: z.string().optional(),
  context: z.string().max(500).optional(),
}).refine(
  data => data.personId || data.inviteEmail || data.invitePhone,
  { message: 'Must provide personId, inviteEmail, or invitePhone' }
);

// GET /sessions query params
export const listSessionsQuerySchema = z.object({
  status: z.nativeEnum(SessionStatus).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

// POST /sessions/:id/pause
export const pauseSessionRequestSchema = z.object({
  reason: z.string().max(200).optional(),
});

// POST /sessions/:id/messages
export const sendMessageRequestSchema = z.object({
  content: z.string().min(1).max(5000),
});
```

### 4. Create stage contracts

Create `shared/src/contracts/stages.ts`:

```typescript
import { z } from 'zod';

// POST /sessions/:id/compact/sign
export const signCompactRequestSchema = z.object({
  agreed: z.literal(true),
});

// POST /sessions/:id/feel-heard
export const feelHeardRequestSchema = z.object({
  confirmed: z.boolean(),
  feedback: z.string().max(500).optional(),
});

// POST /sessions/:id/emotions
export const recordEmotionRequestSchema = z.object({
  intensity: z.number().min(1).max(10),
  context: z.string().max(500).optional(),
});

// POST /sessions/:id/empathy/draft
export const saveEmpathyDraftRequestSchema = z.object({
  content: z.string().min(1).max(2000),
  readyToShare: z.boolean().default(false),
});

// POST /sessions/:id/empathy/validate
export const validateEmpathyRequestSchema = z.object({
  validated: z.boolean(),
  feedback: z.string().max(500).optional(),
});

// POST /sessions/:id/needs/confirm
export const confirmNeedsRequestSchema = z.object({
  needIds: z.array(z.string().cuid()),
  adjustments: z.array(z.object({
    needId: z.string().cuid(),
    confirmed: z.boolean(),
    correction: z.string().optional(),
  })).optional(),
});

// POST /sessions/:id/strategies
export const proposeStrategyRequestSchema = z.object({
  description: z.string().min(10).max(1000),
  needsAddressed: z.array(z.string()).min(1),
  duration: z.string().optional(),
  measureOfSuccess: z.string().optional(),
});

// POST /sessions/:id/strategies/rank
export const rankStrategiesRequestSchema = z.object({
  rankedIds: z.array(z.string().cuid()).min(1),
});
```

### 5. Export all contracts

Update `shared/src/index.ts`:

```typescript
// Contracts
export * from './contracts/auth';
export * from './contracts/sessions';
export * from './contracts/stages';
```

### 6. Write tests

Create tests for each contract file verifying:
- Valid inputs pass validation
- Invalid inputs fail with appropriate errors
- Edge cases (empty strings, boundary values)

### 7. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] All API endpoints from docs have corresponding contracts
- [ ] Zod schemas match DTO interfaces
- [ ] Error codes match API spec
