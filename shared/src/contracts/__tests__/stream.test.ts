/**
 * Conformance tests: the recorded SSE wire fixtures (Phase 0 characterization)
 * must validate against the shared runtime schemas (Phase 1 contract).
 *
 * If an event or payload field is added on either side without updating the
 * contract, these tests fail — that is the point.
 */

import {
  parseStreamEventData,
  streamEventSchema,
  streamMetadataSchema,
  STREAM_EVENT_NAMES,
} from '../stream';
import {
  normalTurnSequence,
  parseStreamEvents,
  serializeStreamEvent,
  streamEventFixtures,
  streamMetadataFixtures,
  STREAM_EVENT_NAMES as FIXTURE_EVENT_NAMES,
} from '../../testing/sse-fixtures';

describe('stream contract', () => {
  it('covers exactly the fixture event vocabulary', () => {
    expect([...STREAM_EVENT_NAMES].sort()).toEqual([...FIXTURE_EVENT_NAMES].sort());
  });

  it('every canonical event fixture validates against the discriminated union', () => {
    for (const fixture of Object.values(streamEventFixtures)) {
      const result = streamEventSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    }
  });

  it('every metadata shape variant validates against streamMetadataSchema', () => {
    for (const [name, fixture] of Object.entries(streamMetadataFixtures)) {
      const result = streamMetadataSchema.safeParse(fixture);
      if (!result.success) {
        throw new Error(`metadata fixture "${name}" failed: ${result.error.message}`);
      }
    }
  });

  it('a serialized normal turn round-trips through wire framing and schema validation', () => {
    const raw = normalTurnSequence().map(serializeStreamEvent).join('');
    const events = parseStreamEvents(raw);
    expect(events.map((e) => e.event)).toEqual([
      'user_message',
      'chunk',
      'chunk',
      'metadata',
      'text_complete',
      'complete',
    ]);
    for (const event of events) {
      expect(streamEventSchema.safeParse(event).success).toBe(true);
    }
  });

  describe('parseStreamEventData', () => {
    it('returns typed payloads for valid frames', () => {
      const parsed = parseStreamEventData(
        'user_message',
        JSON.stringify(streamEventFixtures.userMessage.data)
      );
      expect(parsed).toEqual(streamEventFixtures.userMessage.data);
    });

    it('returns null for malformed JSON', () => {
      expect(parseStreamEventData('chunk', '{not json')).toBeNull();
    });

    it('returns null for schema-invalid payloads', () => {
      expect(parseStreamEventData('chunk', JSON.stringify({ text: 42 }))).toBeNull();
      expect(
        parseStreamEventData('complete', JSON.stringify({ metadata: {} }))
      ).toBeNull(); // missing messageId
      expect(
        parseStreamEventData('error', JSON.stringify({ message: 'x' }))
      ).toBeNull(); // missing retryable
    });

    it('strips unknown keys rather than failing (forward compatibility)', () => {
      const parsed = parseStreamEventData(
        'chunk',
        JSON.stringify({ text: 'hi', futureField: true })
      );
      expect(parsed).toEqual({ text: 'hi' });
    });

    it('rejects structurally invalid metadata payloads instead of letting them cross the boundary', () => {
      const parsed = parseStreamEventData(
        'metadata',
        JSON.stringify({
          metadata: { needAction: { type: 'explode' } },
        })
      );
      expect(parsed).toBeNull();
    });
  });
});
