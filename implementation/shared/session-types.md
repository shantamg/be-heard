# Session Types Implementation

## Source Documentation

- [Prisma Schema](../../docs/mvp-planning/plans/backend/data-model/prisma-schema.md)
- [Session API](../../docs/mvp-planning/plans/backend/api/sessions.md)
- [Stage Progression](../../docs/mvp-planning/plans/backend/api/stages.md)

## Prerequisites

- [ ] None - this is the first shared types task

## External Services Required

> **None required.** This is pure TypeScript type definitions.

## Current State

The shared types already exist with good coverage:
- `enums.ts` - Core enums matching Prisma schema
- `dto/session.ts` - Session, Invitation, StageProgress DTOs
- `dto/stage.ts` - Stage gate types
- `dto/auth.ts`, `dto/message.ts`, etc.

## Scope

This plan covers:
1. Verify existing types match Prisma schema exactly
2. Add Zod validation schemas for runtime validation
3. Add missing utility types (if any)
4. Set up and verify tests pass

**Out of scope:** API contracts (separate plan), backend Prisma setup

## Implementation Steps

### 1. Add Zod dependency

```bash
cd shared && npm install zod
```

### 2. Create validation schemas

Create `shared/src/validation/session.ts`:

```typescript
import { z } from 'zod';
import { SessionStatus, Stage, StageStatus } from '../enums';

export const createSessionRequestSchema = z.object({
  personId: z.string().cuid().optional(),
  inviteEmail: z.string().email().optional(),
  invitePhone: z.string().optional(),
  inviteName: z.string().optional(),
  context: z.string().optional(),
}).refine(
  data => data.personId || data.inviteEmail || data.invitePhone,
  { message: 'Must provide personId, inviteEmail, or invitePhone' }
);

export const acceptInvitationRequestSchema = z.object({
  invitationId: z.string().cuid(),
});

export const declineInvitationRequestSchema = z.object({
  reason: z.string().optional(),
});
```

### 3. Write tests for validation schemas

Create `shared/src/validation/__tests__/session.test.ts`:

```typescript
import { createSessionRequestSchema } from '../session';

describe('createSessionRequestSchema', () => {
  it('accepts valid personId', () => {
    const result = createSessionRequestSchema.safeParse({
      personId: 'clxxxxxxxxxxxxxxxxxx',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid email invitation', () => {
    const result = createSessionRequestSchema.safeParse({
      inviteEmail: 'partner@example.com',
      inviteName: 'Partner Name',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty request', () => {
    const result = createSessionRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

### 4. Export validation schemas

Update `shared/src/index.ts` to export validation:

```typescript
// Validation schemas
export * from './validation/session';
```

### 5. Verify type alignment with Prisma

Review each DTO against the Prisma schema:

| DTO | Prisma Model | Status |
|-----|--------------|--------|
| SessionSummaryDTO | Session + StageProgress | Verify fields |
| SessionDetailDTO | Session + Relationship | Verify fields |
| InvitationDTO | (needs Prisma model) | Check if model exists |
| StageProgressDTO | StageProgress | Verify fields |
| StageGateDTO | (computed) | N/A |

### 6. Run verification

```bash
npm run check   # Type check
npm run test    # Run tests
```

## Verification

- [ ] `npm run check` passes in shared workspace
- [ ] `npm run test` passes in shared workspace
- [ ] All DTOs align with Prisma schema definitions
- [ ] Zod schemas validate correctly for happy/sad paths
- [ ] Exports work correctly (test import in backend/mobile)

## Notes

- The `InvitationDTO` may need a corresponding Prisma model if one doesn't exist
- Consider adding `z.infer<typeof schema>` types for request/response inference
- Validation schemas will be used by both backend (request validation) and mobile (form validation)
