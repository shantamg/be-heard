# Realtime Implementation

## Source Documentation

- [Realtime API](../../docs/mvp-planning/plans/backend/api/realtime.md)
- [Architecture](../../docs/mvp-planning/plans/backend/overview/architecture.md)

## Prerequisites

- [ ] `backend/auth.md` complete (Ably token endpoint exists)

## External Services Required

> **Ably already configured in auth.md.** No additional setup needed.

## Scope

Implement Ably event publishing from backend and push notification fallback.

**Out of scope:** Mobile Ably client (mobile plans)

## Implementation Steps

### 1. Create realtime service

Create `backend/src/services/realtime.ts`:

```typescript
import Ably from 'ably';
import { Expo } from 'expo-server-sdk';
import { prisma } from '../lib/prisma';

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);
const expo = new Expo();

export type SessionEvent =
  | 'partner.signed_compact'
  | 'partner.stage_completed'
  | 'partner.advanced'
  | 'partner.empathy_shared'
  | 'partner.needs_shared'
  | 'partner.ranking_submitted'
  | 'agreement.proposed'
  | 'agreement.confirmed'
  | 'session.paused'
  | 'session.resumed'
  | 'session.resolved';

export async function publishSessionEvent(
  sessionId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  excludeUserId?: string
) {
  const channel = ably.channels.get(`meetwithoutfear:session:${sessionId}`);
  await channel.publish(event, data);
}

export async function notifyPartner(
  sessionId: string,
  partnerId: string,
  event: SessionEvent,
  data: Record<string, unknown>
) {
  // Check if partner is online via presence
  const presenceChannel = ably.channels.get(`meetwithoutfear:session:${sessionId}:presence`);
  const members = await presenceChannel.presence.get();
  const partnerPresent = members.some(m => m.clientId === partnerId);

  if (partnerPresent) {
    await publishSessionEvent(sessionId, event, data);
  } else {
    await sendPushNotification(partnerId, event, data, sessionId);
  }
}
```

### 2. Create push notification service

Create `backend/src/services/push.ts`:

```typescript
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '../lib/prisma';
import { SessionEvent } from './realtime';

const expo = new Expo();

const PUSH_MESSAGES: Record<SessionEvent, { title: string; body: string }> = {
  'partner.signed_compact': {
    title: 'Partner is ready',
    body: 'They signed the Curiosity Compact. Your turn!'
  },
  'partner.stage_completed': {
    title: 'Partner finished a stage',
    body: 'They completed their work. Check in when ready.'
  },
  // ... add all event messages
};

export async function sendPushNotification(
  userId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true }
  });

  if (!user?.pushToken || !Expo.isExpoPushToken(user.pushToken)) {
    return;
  }

  const message = PUSH_MESSAGES[event] || { title: 'Meet Without Fear', body: 'You have an update' };

  await expo.sendPushNotificationsAsync([{
    to: user.pushToken,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: { sessionId, event, ...data }
  }]);
}
```

### 3. Write tests

Create `backend/src/services/__tests__/realtime.test.ts`:

```typescript
describe('Realtime Service', () => {
  it('publishes event to Ably channel', async () => {
    // Mock Ably and test publish
  });

  it('sends push notification when partner offline', async () => {
    // Mock presence check returning empty, verify push sent
  });

  it('publishes to Ably when partner online', async () => {
    // Mock presence check with partner, verify Ably publish
  });
});
```

### 4. Install Expo Server SDK

```bash
npm install expo-server-sdk
```

### 5. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] `publishSessionEvent` publishes to correct Ably channel
- [ ] `notifyPartner` checks presence before deciding delivery method
- [ ] Push notifications sent with correct content
- [ ] Invalid push tokens handled gracefully
- [ ] `npm run check` passes
- [ ] `npm run test` passes
