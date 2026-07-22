/**
 * Streaming Chat Contract
 *
 * Single source of truth for the SSE protocol spoken between
 * `POST /sessions/:id/messages/stream` (backend `sendMessageStream`) and the
 * mobile streaming client (`useStreamingMessage`).
 *
 * Backend emitters MUST type outgoing frames as `StreamEvent`; mobile MUST
 * parse incoming frame payloads with `parseStreamEventData` (no unchecked
 * `JSON.parse(...) as X` casts). Adding an event or payload field here is the
 * only way to extend the protocol — both sides pick it up from this module.
 *
 * Wire framing (see `serializeStreamEvent` in shared/src/testing/sse-fixtures.ts):
 *   event: <name>\n
 *   data: <JSON payload>\n\n
 */

import { z } from 'zod';
import { NeedCategory, Stage4ProposalKind } from '../enums';

// ============================================================================
// Structured stage-action shapes carried in stream metadata
// ============================================================================

export const stage4ProposalActionSchema = z.enum(['ADD', 'REVISE', 'REMOVE', 'IGNORE']);
export type Stage4ProposalAction = z.infer<typeof stage4ProposalActionSchema>;

export const stage4ProposalClassificationSchema = z.enum([
  'PROPOSAL',
  'REFLECTION',
  'SUCCESS_MARKER',
  'PROCESS',
]);
export type Stage4ProposalClassification = z.infer<typeof stage4ProposalClassificationSchema>;

export const stage4WalkthroughActionTypeSchema = z.enum(['COVERED', 'SKIP', 'NONE']);
export type Stage4WalkthroughActionType = z.infer<typeof stage4WalkthroughActionTypeSchema>;

export const stage4ProposalInputSchema = z.object({
  action: stage4ProposalActionSchema,
  targetProposalId: z.string().optional(),
  classification: stage4ProposalClassificationSchema,
  description: z.string(),
  kind: z.enum(Stage4ProposalKind).optional(),
  ownerUserId: z.string().optional(),
  needsAddressed: z.array(z.string()).optional(),
  duration: z.string().optional(),
  measureOfSuccess: z.string().optional(),
});
export type Stage4ProposalInput = z.infer<typeof stage4ProposalInputSchema>;

export const stage4WalkthroughActionSchema = z.object({
  action: stage4WalkthroughActionTypeSchema,
  needId: z.string().optional(),
  reason: z.string().optional(),
});
export type Stage4WalkthroughAction = z.infer<typeof stage4WalkthroughActionSchema>;

export const streamCapturedNeedSchema = z.object({
  need: z.string(),
  category: z.enum(NeedCategory),
  description: z.string(),
  evidence: z.array(z.string()),
});

export const streamNeedActionSchema = z.object({
  type: z.enum(['refine', 'delete', 'lock']),
  needId: z.string().optional(),
  supersedes: z.string().optional(),
  need: z.string().optional(),
  category: z.enum(NeedCategory).optional(),
  description: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export const stage4CaptureSummarySchema = z.object({
  appliedOperationCount: z.number().optional(),
  skippedOperationCount: z.number().optional(),
  selectionCaptured: z.boolean().optional(),
  closureSignalCaptured: z.boolean().optional(),
  confidence: z.number().optional(),
  autoClosed: z.boolean().optional(),
});

// ============================================================================
// Stream metadata (the structured-state payload of a turn)
// ============================================================================

export const streamMetadataSchema = z.object({
  offerFeelHeardCheck: z.boolean().optional(),
  offerReadyToShare: z.boolean().optional(),
  proposedEmpathyStatement: z.string().nullish(),
  proposedStrategies: z.array(z.string()).optional(),
  stage4Proposals: z.array(stage4ProposalInputSchema).optional(),
  stage4WalkthroughAction: stage4WalkthroughActionSchema.optional(),
  stage4Capture: stage4CaptureSummarySchema.optional(),
  proposedNeed: streamCapturedNeedSchema.optional(),
  proposedNeeds: z.array(streamCapturedNeedSchema).optional(),
  needAction: streamNeedActionSchema.optional(),
  needParseError: z.string().optional(),
  needsCaptured: z.boolean().optional(),
  topicFrame: z.string().nullish(),
  analysis: z.string().optional(),
});
export type StreamMetadata = z.infer<typeof streamMetadataSchema>;

// ============================================================================
// SSE events
// ============================================================================

export const streamUserMessageDataSchema = z.object({
  id: z.string(),
  content: z.string(),
  timestamp: z.string(),
  refiningNeedId: z.string().nullish(),
});
export type StreamUserMessageData = z.infer<typeof streamUserMessageDataSchema>;

export const streamChunkDataSchema = z.object({
  text: z.string(),
});
export type StreamChunkData = z.infer<typeof streamChunkDataSchema>;

export const streamMetadataDataSchema = z.object({
  metadata: streamMetadataSchema,
});
export type StreamMetadataData = z.infer<typeof streamMetadataDataSchema>;

export const streamTextCompleteDataSchema = z.object({
  metadata: streamMetadataSchema,
});
export type StreamTextCompleteData = z.infer<typeof streamTextCompleteDataSchema>;

export const streamCompleteDataSchema = z.object({
  messageId: z.string(),
  metadata: streamMetadataSchema,
});
export type StreamCompleteData = z.infer<typeof streamCompleteDataSchema>;

export const streamErrorDataSchema = z.object({
  message: z.string(),
  retryable: z.boolean(),
});
export type StreamErrorData = z.infer<typeof streamErrorDataSchema>;

/** Payload schema per event name — the exhaustive protocol vocabulary. */
export const STREAM_EVENT_DATA_SCHEMAS = {
  user_message: streamUserMessageDataSchema,
  chunk: streamChunkDataSchema,
  metadata: streamMetadataDataSchema,
  text_complete: streamTextCompleteDataSchema,
  complete: streamCompleteDataSchema,
  error: streamErrorDataSchema,
} as const;

export type StreamEventName = keyof typeof STREAM_EVENT_DATA_SCHEMAS;

export const STREAM_EVENT_NAMES = Object.keys(
  STREAM_EVENT_DATA_SCHEMAS
) as readonly StreamEventName[];

export type StreamEventDataMap = {
  [E in StreamEventName]: z.infer<(typeof STREAM_EVENT_DATA_SCHEMAS)[E]>;
};

/** A full SSE frame as a discriminated union on the event name. */
export type StreamEvent = {
  [E in StreamEventName]: { event: E; data: StreamEventDataMap[E] };
}[StreamEventName];

export const streamEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('user_message'), data: streamUserMessageDataSchema }),
  z.object({ event: z.literal('chunk'), data: streamChunkDataSchema }),
  z.object({ event: z.literal('metadata'), data: streamMetadataDataSchema }),
  z.object({ event: z.literal('text_complete'), data: streamTextCompleteDataSchema }),
  z.object({ event: z.literal('complete'), data: streamCompleteDataSchema }),
  z.object({ event: z.literal('error'), data: streamErrorDataSchema }),
]);

/**
 * Parse and validate one SSE frame payload.
 *
 * Returns the typed payload, or `null` when the JSON is malformed or fails
 * schema validation. Consumers must treat `null` as "drop the frame" — never
 * let an unvalidated payload cross this boundary.
 */
export function parseStreamEventData<E extends StreamEventName>(
  event: E,
  rawJson: string
): StreamEventDataMap[E] | null {
  let json: unknown;
  try {
    json = JSON.parse(rawJson);
  } catch {
    return null;
  }
  const result = STREAM_EVENT_DATA_SCHEMAS[event].safeParse(json);
  return result.success ? (result.data as StreamEventDataMap[E]) : null;
}
