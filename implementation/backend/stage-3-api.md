# Stage 3 API Implementation

## Source Documentation

- [Stage 3 API](../../docs/mvp-planning/plans/backend/api/stage-3.md)
- [Stage 3 Need Mapping](../../docs/mvp-planning/plans/stages/stage-3-need-mapping.md)
- [Need Extraction Prompts](../../docs/mvp-planning/plans/backend/prompts/need-extraction.md)

## Prerequisites

- [ ] `backend/stage-2-api.md` complete

## External Services Required

> **None additional.**

## Scope

Implement need synthesis, confirmation, consent, and common ground discovery.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/stage3.test.ts`:

```typescript
describe('Stage 3 API', () => {
  describe('GET /sessions/:id/needs', () => {
    it('returns AI-synthesized needs from conversation', async () => {
      const res = await request(app)
        .get('/api/v1/sessions/test-session/needs')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.needs).toBeInstanceOf(Array);
      expect(res.body.data.needs[0]).toHaveProperty('need');
      expect(res.body.data.needs[0]).toHaveProperty('category');
    });
  });

  describe('POST /sessions/:id/needs/confirm', () => {
    it('confirms and adjusts identified needs', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/needs/confirm')
        .set('Authorization', 'Bearer valid-token')
        .send({
          needIds: ['need-1', 'need-2'],
          adjustments: [{ needId: 'need-1', confirmed: true }]
        });

      expect(res.body.data.confirmed).toBe(true);
    });
  });

  describe('GET /sessions/:id/common-ground', () => {
    it('returns overlapping needs between partners', async () => {
      // Requires both partners to have consented needs
    });
  });
});
```

### 2. Create need extraction service

Create `backend/src/services/needs.ts`:

```typescript
import { prisma } from '../lib/prisma';
import { NeedCategory } from '@meet-without-fear/shared';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function extractNeedsFromConversation(
  sessionId: string,
  userId: string
): Promise<IdentifiedNeed[]> {
  // Get user's messages
  const messages = await prisma.message.findMany({
    where: { sessionId, senderId: userId },
    orderBy: { timestamp: 'asc' }
  });

  const conversationText = messages.map(m => m.content).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: NEED_EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: conversationText }]
  });

  // Parse JSON response
  const content = response.content[0];
  if (content.type !== 'text') return [];

  const parsed = JSON.parse(content.text);
  return parsed.needs.map((n: any) => ({
    need: n.need,
    category: n.category as NeedCategory,
    evidence: n.evidence,
    aiConfidence: n.confidence
  }));
}

const NEED_EXTRACTION_PROMPT = `Analyze this conversation and identify the speaker's underlying universal needs.
Return a JSON array of needs with this structure:
{
  "needs": [
    {
      "need": "string - the universal need (e.g., 'safety', 'recognition', 'autonomy')",
      "category": "SAFETY | CONNECTION | AUTONOMY | RECOGNITION | MEANING | FAIRNESS",
      "evidence": ["quote or paraphrase supporting this need"],
      "confidence": 0.0-1.0
    }
  ]
}`;
```

### 3. Create needs controller

Create `backend/src/controllers/needs.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { extractNeedsFromConversation } from '../services/needs';

export const getNeeds = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  // Check if needs already extracted
  let needs = await prisma.identifiedNeed.findMany({
    where: { vessel: { sessionId, userId } }
  });

  // If no needs, extract them
  if (needs.length === 0) {
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId, sessionId } }
    });

    const extracted = await extractNeedsFromConversation(sessionId, userId);

    needs = await Promise.all(extracted.map(n =>
      prisma.identifiedNeed.create({
        data: {
          vesselId: vessel!.id,
          need: n.need,
          category: n.category,
          evidence: n.evidence,
          aiConfidence: n.aiConfidence
        }
      })
    ));
  }

  res.json({
    success: true,
    data: {
      needs: needs.map(n => ({
        id: n.id,
        need: n.need,
        category: n.category,
        evidence: n.evidence,
        confirmed: n.confirmed,
        aiConfidence: n.aiConfidence
      }))
    }
  });
};

export const confirmNeeds = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { needIds, adjustments } = req.body;
  const userId = req.user!.id;

  // Mark selected needs as confirmed
  await prisma.identifiedNeed.updateMany({
    where: { id: { in: needIds } },
    data: { confirmed: true }
  });

  // Apply adjustments if any
  for (const adj of adjustments ?? []) {
    await prisma.identifiedNeed.update({
      where: { id: adj.needId },
      data: { confirmed: adj.confirmed }
    });
  }

  // Update stage progress
  await prisma.stageProgress.update({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 3 } },
    data: { gatesSatisfied: { needsConfirmed: true } }
  });

  res.json({ success: true, data: { confirmed: true } });
};

export const getCommonGround = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;

  const commonGround = await prisma.commonGround.findMany({
    where: { sharedVessel: { sessionId } }
  });

  res.json({
    success: true,
    data: { commonGround }
  });
};
```

### 4. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Needs extracted from conversation via AI
- [ ] Needs cached after first extraction
- [ ] Confirmation updates need status
- [ ] Common ground calculated from shared needs
- [ ] Consent required before partner sees needs
- [ ] `npm run check` passes
- [ ] `npm run test` passes
