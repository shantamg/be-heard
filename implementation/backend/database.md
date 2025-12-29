# Database Setup Implementation

## Source Documentation

- [Prisma Schema](../../docs/mvp-planning/plans/backend/data-model/prisma-schema.md)
- [Data Model Index](../../docs/mvp-planning/plans/backend/data-model/index.md)
- [Vessel Model](../../docs/mvp-planning/plans/privacy/vessel-model.md)

## Prerequisites

- [ ] `shared/session-types.md` complete (enums must match)

## External Services Required

> **User action needed:** Set up Supabase project

1. **Create Supabase project:**
   - Go to https://supabase.com/dashboard
   - Create new project (name: `meetwithoutfear-dev` or similar)
   - Wait for project to be ready (~2 minutes)

2. **Get connection strings:**
   - Go to Project Settings > Database
   - Copy "Connection string" (URI format)
   - Note: Use "Connection pooling" string for production

3. **Add to environment:**
   ```bash
   # backend/.env
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

   # For migrations (direct connection)
   DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
   ```

4. **Enable pgvector extension (for embeddings):**
   - Go to Database > Extensions
   - Search for "vector" and enable it

## Scope

Set up Prisma schema matching the planning docs, run migrations, verify connection.

**Out of scope:** RLS policies (separate security plan), seed data

## Implementation Steps

### 1. Initialize Prisma

```bash
cd backend
npx prisma init
```

### 2. Create schema file

Translate the schema from [prisma-schema.md](../../docs/mvp-planning/plans/backend/data-model/prisma-schema.md) to `backend/prisma/schema.prisma`.

Key models to implement in order:
1. User
2. Relationship, RelationshipMember
3. Session
4. UserVessel, SharedVessel
5. StageProgress
6. Message
7. EmotionalReading, IdentifiedNeed, Boundary
8. ConsentRecord, ConsentedContent
9. EmpathyDraft, EmpathyAttempt, EmpathyValidation
10. StrategyProposal, StrategyRanking, Agreement
11. CommonGround
12. GlobalLibraryItem

### 3. Write tests for schema

Create `backend/src/__tests__/prisma-schema.test.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

describe('Prisma Schema', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to database', async () => {
    const result = await prisma.$queryRaw`SELECT 1`;
    expect(result).toBeDefined();
  });

  it('creates and retrieves a user', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });
    expect(user.id).toBeDefined();

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

### 4. Run initial migration

```bash
npx prisma migrate dev --name init
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

### 6. Verify enums match shared

Ensure Prisma enums match `shared/src/enums.ts`:
- SessionStatus
- StageStatus
- Stage (as Int in Prisma)
- MessageRole
- Attribution
- NeedCategory
- ConsentDecision
- ConsentContentType
- AgreementType
- AgreementStatus

### 7. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] `npx prisma migrate dev` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] Database connection test passes
- [ ] CRUD operations work for User model
- [ ] Enums match between Prisma and shared package
- [ ] `npm run check` passes
- [ ] `npm run test` passes

## Notes

- Use `@default(cuid())` for all primary keys
- Use `@db.Text` for long string fields
- Use `Unsupported("vector(1536)")` for embedding fields (pgvector)
- Add `@@index` for frequently queried fields
- `@@unique` constraints as per schema docs
