/**
 * SSE wire-format fixtures for the streaming chat protocol.
 *
 * These fixtures pin the EXACT wire format emitted by
 * `POST /sessions/:id/messages/stream` (backend `sendMessageStream`) and
 * consumed by mobile `useStreamingMessage`. Backend and mobile
 * characterization tests both import from this file so that the two sides can
 * never drift apart silently.
 *
 * Phase 0 (characterization): the types below intentionally mirror the
 * currently-inline definitions in `backend/src/controllers/messages.ts`
 * (`SSEEvent`) and `mobile/src/hooks/useStreamingMessage.ts`. They document
 * today's protocol; they are not yet the canonical runtime contract.
 * Phase 1 replaces both inline definitions with shared zod-validated schemas —
 * at that point these fixtures become conformance fixtures for the schemas.
 */

// ============================================================================
// Wire types (documenting the current protocol)
// ============================================================================

/** Metadata payload attached to metadata / text_complete / complete events. */
export interface StreamMetadataWire {
  offerFeelHeardCheck?: boolean;
  offerReadyToShare?: boolean;
  proposedEmpathyStatement?: string | null;
  proposedStrategies?: string[];
  stage4Proposals?: Array<Record<string, unknown>>;
  stage4WalkthroughAction?: {
    action: 'COVERED' | 'SKIP' | 'NONE';
    needId?: string;
    reason?: string;
  };
  stage4Capture?: {
    appliedOperationCount?: number;
    skippedOperationCount?: number;
    selectionCaptured?: boolean;
    closureSignalCaptured?: boolean;
    confidence?: number;
    autoClosed?: boolean;
  };
  proposedNeed?: {
    need: string;
    category: string;
    description: string;
    evidence: string[];
  };
  proposedNeeds?: Array<{
    need: string;
    category: string;
    description: string;
    evidence: string[];
  }>;
  needAction?: {
    type: 'refine' | 'delete' | 'lock';
    needId?: string;
    supersedes?: string;
  };
  needParseError?: string;
  needsCaptured?: boolean;
  topicFrame?: string | null;
  analysis?: string;
}

export type StreamEventWire =
  | {
      event: 'user_message';
      data: { id: string; content: string; timestamp: string; refiningNeedId?: string | null };
    }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'metadata'; data: { metadata: StreamMetadataWire } }
  | { event: 'text_complete'; data: { metadata: StreamMetadataWire } }
  | { event: 'complete'; data: { messageId: string; metadata: StreamMetadataWire } }
  | { event: 'error'; data: { message: string; retryable: boolean } };

export type StreamEventName = StreamEventWire['event'];

/** Every event name the streaming endpoint can emit, in no particular order. */
export const STREAM_EVENT_NAMES: readonly StreamEventName[] = [
  'user_message',
  'chunk',
  'metadata',
  'text_complete',
  'complete',
  'error',
] as const;

// ============================================================================
// Wire framing helpers
// ============================================================================

/**
 * Serialize an event exactly the way the backend's `sendSSE` does:
 * `event: <name>\n` + `data: <json>\n\n`, written as two separate writes.
 */
export function serializeStreamEvent(event: StreamEventWire): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/** Parse a raw SSE payload (concatenated writes) back into events. */
export function parseStreamEvents(raw: string): StreamEventWire[] {
  const events: StreamEventWire[] = [];
  const blocks = raw.split('\n\n');
  for (const block of blocks) {
    const eventMatch = block.match(/(?:^|\n)event: (.+)/);
    const dataMatch = block.match(/(?:^|\n)data: (.+)/);
    if (!eventMatch || !dataMatch) continue;
    events.push({
      event: eventMatch[1] as StreamEventName,
      data: JSON.parse(dataMatch[1]),
    } as StreamEventWire);
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
} as const satisfies Record<string, StreamEventWire>;

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
      category: 'CONNECTION',
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
        kind: 'SHARED_PROPOSAL',
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
} as const satisfies Record<string, StreamMetadataWire>;

/**
 * The event sequence of a normal successful turn, in emission order.
 * (Chunk count varies; this fixture uses two.)
 */
export function normalTurnSequence(): StreamEventWire[] {
  return [
    streamEventFixtures.userMessage,
    { event: 'chunk', data: { text: 'I hear you — ' } },
    { event: 'chunk', data: { text: 'that sounds heavy.' } },
    streamEventFixtures.metadataEmpty,
    streamEventFixtures.textComplete,
    streamEventFixtures.complete,
  ];
}
