/**
 * SSE wire-format fixtures for the streaming chat protocol.
 *
 * These fixtures pin the EXACT wire format emitted by
 * `POST /sessions/:id/messages/stream` (backend `sendMessageStream`) and
 * consumed by mobile `useStreamingMessage`. Backend and mobile
 * characterization tests both import from this file so that the two sides can
 * never drift apart silently.
 *
 * The canonical runtime contract lives in `shared/src/contracts/stream.ts`;
 * this module only re-exports its types and provides recorded fixtures plus
 * wire-framing helpers for tests.
 */

import type { StreamEvent, StreamMetadata, StreamEventName } from '../contracts/stream';
import { NeedCategory, Stage4ProposalKind } from '../enums';

export { STREAM_EVENT_NAMES } from '../contracts/stream';
export type { StreamEvent, StreamMetadata, StreamEventName } from '../contracts/stream';

// ============================================================================
// Wire framing helpers
// ============================================================================

/**
 * Serialize an event exactly the way the backend's `sendSSE` does:
 * `event: <name>\n` + `data: <json>\n\n`.
 */
export function serializeStreamEvent(event: StreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/** Parse a raw SSE payload (concatenated writes) back into events. */
export function parseStreamEvents(raw: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const blocks = raw.split('\n\n');
  for (const block of blocks) {
    const eventMatch = block.match(/(?:^|\n)event: (.+)/);
    const dataMatch = block.match(/(?:^|\n)data: (.+)/);
    if (!eventMatch || !dataMatch) continue;
    events.push({
      event: eventMatch[1] as StreamEventName,
      data: JSON.parse(dataMatch[1]),
    } as StreamEvent);
  }
  return events;
}

// ============================================================================
// Canonical fixtures — one per event type, plus metadata shape variants
// ============================================================================

export const streamEventFixtures = {
  userMessage: {
    event: 'user_message',
    data: {
      id: 'msg-user-1',
      content: 'It has been a hard week.',
      timestamp: '2026-07-22T10:00:00.000Z',
      refiningNeedId: null,
    },
  },
  chunk: {
    event: 'chunk',
    data: { text: 'I hear you — ' },
  },
  metadataEmpty: {
    event: 'metadata',
    data: { metadata: {} },
  },
  textComplete: {
    event: 'text_complete',
    data: { metadata: {} },
  },
  complete: {
    event: 'complete',
    data: { messageId: 'msg-ai-1', metadata: {} },
  },
  errorRetryable: {
    event: 'error',
    data: {
      message: 'An error occurred while generating the response.',
      retryable: true,
    },
  },
} as const satisfies Record<string, StreamEvent>;

/**
 * Structured metadata shape variants, as they appear inside metadata /
 * text_complete / complete events, by stage feature.
 */
export const streamMetadataFixtures = {
  stage0TopicFrame: {
    topicFrame: 'How we split weekend planning',
  },
  stage1FeelHeard: {
    offerFeelHeardCheck: true,
  },
  stage2EmpathyDraft: {
    offerReadyToShare: true,
    proposedEmpathyStatement:
      'I imagine you felt alone with the planning and wanted me to notice.',
  },
  stage3ProposedNeed: {
    proposedNeed: {
      need: 'To feel like a partner in planning',
      category: NeedCategory.CONNECTION,
      description: 'Wants planning to be shared, not delegated',
      evidence: ['I always end up doing it alone'],
    },
  },
  stage3NeedAction: {
    needAction: { type: 'refine', needId: 'need-1' },
  },
  stage4Proposals: {
    stage4Proposals: [
      {
        action: 'ADD',
        classification: 'PROPOSAL',
        description: 'Alternate who plans each weekend',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        needsAddressed: ['Partnership'],
      },
    ],
    stage4WalkthroughAction: { action: 'COVERED', needId: 'need-1' },
  },
  stage4Capture: {
    stage4Capture: {
      appliedOperationCount: 1,
      skippedOperationCount: 0,
      selectionCaptured: false,
      closureSignalCaptured: false,
      confidence: 0.9,
    },
  },
} as const satisfies Record<string, StreamMetadata>;

/**
 * The event sequence of a normal successful turn, in emission order.
 * (Chunk count varies; this fixture uses two.)
 */
export function normalTurnSequence(): StreamEvent[] {
  return [
    streamEventFixtures.userMessage,
    { event: 'chunk', data: { text: 'I hear you — ' } },
    { event: 'chunk', data: { text: 'that sounds heavy.' } },
    streamEventFixtures.metadataEmpty,
    streamEventFixtures.textComplete,
    streamEventFixtures.complete,
  ];
}
