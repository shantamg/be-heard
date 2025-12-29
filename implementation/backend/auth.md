# Authentication Implementation

## Source Documentation

- [Auth API](../../docs/mvp-planning/plans/backend/api/auth.md)
- [Realtime API](../../docs/mvp-planning/plans/backend/api/realtime.md)

## Prerequisites

- [ ] `backend/database.md` complete (User model exists)
- [ ] `shared/api-contracts.md` complete (auth contracts)

## External Services Required

> **User action needed:** Set up Clerk and Ably

### 1. Clerk Setup

1. **Create Clerk application:**
   - Go to https://dashboard.clerk.com
   - Create new application
   - Select authentication methods (Email, Google, Apple recommended)

2. **Get API keys:**
   - Go to API Keys in dashboard
   - Copy Publishable Key and Secret Key

3. **Configure JWT template (optional):**
   - Go to JWT Templates
   - Create template named "backend" with custom claims if needed

4. **Add to environment:**
   ```bash
   # backend/.env
   CLERK_PUBLISHABLE_KEY="pk_test_..."
   CLERK_SECRET_KEY="sk_test_..."

   # mobile/.env (or app.config.js)
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
   ```

### 2. Ably Setup

1. **Create Ably account:**
   - Go to https://ably.com
   - Create new app (name: `meetwithoutfear-dev`)

2. **Get API key:**
   - Go to app settings > API Keys
   - Copy the API key with all capabilities

3. **Add to environment:**
   ```bash
   # backend/.env
   ABLY_API_KEY="xxxxxx.yyyyyyy:zzzzzzzz"
   ```

## Scope

Implement Clerk middleware, user provisioning, and Ably token generation.

**Out of scope:** Mobile Clerk integration (mobile plan), password reset (Clerk handles)

## Implementation Steps

### 1. Install dependencies

```bash
cd backend
npm install @clerk/express ably
npm install -D @types/express
```

### 2. Write middleware tests first

Create `backend/src/middleware/__tests__/auth.test.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { clerkAuthMiddleware, requireAuth } from '../auth';

describe('Auth Middleware', () => {
  it('rejects requests without auth header', async () => {
    const req = { headers: {} } as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### 3. Implement Clerk middleware

Create `backend/src/middleware/auth.ts`:

```typescript
import { clerkMiddleware, requireAuth as clerkRequireAuth, getAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export const clerkAuthMiddleware = clerkMiddleware();

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);

  if (!auth.userId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
  }

  // Upsert local user
  const user = await prisma.user.upsert({
    where: { clerkId: auth.userId },
    update: {},
    create: {
      clerkId: auth.userId,
      email: auth.sessionClaims?.email as string,
      name: auth.sessionClaims?.name as string,
    },
  });

  req.user = user;
  next();
};
```

### 4. Implement auth routes

Create `backend/src/routes/auth.ts`:

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMe, updateProfile, updatePushToken, getAblyToken } from '../controllers/auth';

const router = Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateProfile);
router.post('/push-token', requireAuth, updatePushToken);
router.get('/ably-token', requireAuth, getAblyToken);

export default router;
```

### 5. Implement controllers

Create `backend/src/controllers/auth.ts`:

```typescript
import { Request, Response } from 'express';
import Ably from 'ably';

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

export const getMe = async (req: Request, res: Response) => {
  const user = req.user!;

  const activeSessions = await prisma.session.count({
    where: {
      relationship: {
        members: { some: { userId: user.id } }
      },
      status: { in: ['ACTIVE', 'WAITING', 'PAUSED'] }
    }
  });

  res.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, name: user.name },
      activeSessions,
      pushNotificationsEnabled: !!user.pushToken,
    }
  });
};

export const getAblyToken = async (req: Request, res: Response) => {
  const user = req.user!;

  // Get user's active session IDs for capability scoping
  const sessions = await prisma.session.findMany({
    where: {
      relationship: { members: { some: { userId: user.id } } },
      status: { in: ['ACTIVE', 'WAITING', 'PAUSED'] }
    },
    select: { id: true }
  });

  // Build capability object
  const capability: Record<string, string[]> = {};
  for (const session of sessions) {
    capability[`meetwithoutfear:session:${session.id}`] = ['subscribe', 'publish'];
    capability[`meetwithoutfear:session:${session.id}:presence`] = ['presence'];
  }

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: user.id,
    capability: JSON.stringify(capability),
  });

  res.json({ success: true, data: { tokenRequest } });
};
```

### 6. Add User.clerkId to Prisma schema

Update `backend/prisma/schema.prisma`:

```prisma
model User {
  id       String  @id @default(cuid())
  clerkId  String  @unique
  email    String  @unique
  name     String?
  pushToken String?
  // ... rest of fields
}
```

### 7. Run migration

```bash
npx prisma migrate dev --name add-clerk-id
```

### 8. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Clerk middleware validates tokens correctly
- [ ] User provisioning creates local user on first request
- [ ] `/auth/me` returns user profile
- [ ] `/auth/ably-token` returns scoped token
- [ ] Unauthorized requests return 401
- [ ] `npm run check` passes
- [ ] `npm run test` passes

## Notes

- Rate limiting per auth.md: `/ably-token` 10/min, `/me` 30/min
- Push token updates should be idempotent
- Ably tokens are short-lived (~60 min), client should refresh
