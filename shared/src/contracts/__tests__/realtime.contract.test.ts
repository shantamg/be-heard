/**
 * Conformance tests: every session realtime event the backend publishes must
 * validate against the shared runtime contract.
 *
 * These cover the RUNTIME half — that the recorded real-world payload variants
 * survive the consumer boundary instead of being dropped. The compile-time half
 * (a publisher adding an undeclared key or changing a field's type) is enforced
 * by the backend typechecking against `SessionEventPublishData<E>`, not here;
 * see the docblock in `../../testing/realtime-fixtures`.
 */

import {
  SESSION_EVENT_DATA_SCHEMAS,
  SESSION_EVENT_NAMES,
  USER_EVENT_DATA_SCHEMAS,
  USER_EVENT_NAMES,
  MOBILE_ONLY_EVENT_NAMES,
  isKnownSessionEventName,
  parseSessionEvent,
  parseSessionEventData,
  parseUserEventData,
  sessionEventEnvelopeSchema,
} from '../realtime';
import type { SessionEventPublishData, NoExtraSessionEventKeys } from '../realtime';
import type { SessionEventType } from '../../dto/realtime';
import {
  sessionEventFixtures,
  userEventFixtures,
  invalidSessionEventPayloads,
} from '../../testing/realtime-fixtures';

describe('session realtime contract', () => {
  describe('vocabulary coverage', () => {
    it('every event name in the union has a runtime schema', () => {
      for (const name of SESSION_EVENT_NAMES) {
        expect(SESSION_EVENT_DATA_SCHEMAS[name]).toBeDefined();
      }
    });

    it('the schema registry and the fixture set cover exactly the same events', () => {
      // This is the guard that makes adding an event without updating consumers
      // fail the build: a new SessionEventType member has no schema (compile
      // error in contracts/realtime.ts) and no fixture (this assertion).
      expect([...SESSION_EVENT_NAMES].sort()).toEqual(Object.keys(sessionEventFixtures).sort());
    });

    it('every user event name in the union has a runtime schema and a fixture', () => {
      expect([...USER_EVENT_NAMES].sort()).toEqual(Object.keys(userEventFixtures).sort());
      for (const name of USER_EVENT_NAMES) {
        expect(USER_EVENT_DATA_SCHEMAS[name]).toBeDefined();
      }
    });

    it('every event has at least one recorded payload variant', () => {
      // Deliberately NOT called "publisher coverage": the fixtures are
      // transcribed rather than captured, and events with no publisher carry a
      // synthetic envelope-only entry. This asserts registry exhaustiveness
      // only.
      const empty = Object.entries(sessionEventFixtures)
        .filter(([, variants]) => variants.length === 0)
        .map(([name]) => name);
      expect(empty).toEqual([]);
    });
  });

  describe('recorded publisher payloads validate', () => {
    it.each(SESSION_EVENT_NAMES)('%s', (name) => {
      for (const [index, payload] of sessionEventFixtures[name].entries()) {
        const result = SESSION_EVENT_DATA_SCHEMAS[name].safeParse(payload);
        if (!result.success) {
          throw new Error(
            `${name} fixture #${index} failed validation: ${JSON.stringify(result.error.issues)}`
          );
        }
      }
    });

    it.each(USER_EVENT_NAMES)('user channel: %s', (name) => {
      for (const [index, payload] of userEventFixtures[name].entries()) {
        const parsed = parseUserEventData(name, payload);
        if (parsed === null) {
          throw new Error(`user event ${name} fixture #${index} failed validation`);
        }
      }
    });

    it('validation preserves unknown keys so no live field is stripped', () => {
      const parsed = parseSessionEventData('partner.activity', {
        sessionId: 'sess_1',
        timestamp: 1,
        activeAt: '2026-05-30T12:00:00.000Z',
        aFieldAddedByANewerBackend: { nested: true },
      });
      expect(parsed).not.toBeNull();
      expect(parsed).toHaveProperty('aFieldAddedByANewerBackend', { nested: true });
    });

    it('accepts the ISO-string timestamp that invitation.confirmed publishes', () => {
      const parsed = parseSessionEventData('invitation.confirmed', {
        sessionId: 'sess_1',
        timestamp: '2026-05-30T12:00:00.000Z',
        confirmedBy: 'user_beta',
      });
      expect(parsed?.timestamp).toBe('2026-05-30T12:00:00.000Z');
    });
  });

  describe('consumer boundary', () => {
    it('rejects only structurally impossible payloads', () => {
      for (const { label, payload } of invalidSessionEventPayloads) {
        const result = parseSessionEvent('partner.activity', payload);
        expect({ label, kind: result.kind }).toEqual({ label, kind: 'invalid' });
      }
    });

    it('delivers unknown event names via the envelope fallback', () => {
      const result = parseSessionEvent('some.future.event', {
        sessionId: 'sess_1',
        timestamp: 1,
        anything: 'goes',
      });
      expect(result.kind).toBe('unknown-event');
      expect(result.kind === 'unknown-event' && result.data.anything).toBe('goes');
    });

    it('delivers the mobile-only legacy event names rather than dropping them', () => {
      for (const name of MOBILE_ONLY_EVENT_NAMES) {
        expect(isKnownSessionEventName(name)).toBe(false);
        const result = parseSessionEvent(name, { sessionId: 'sess_1', timestamp: 1 });
        expect({ name, kind: result.kind }).toEqual({ name, kind: 'unknown-event' });
      }
    });

    it('drops an unknown event whose payload is not a valid envelope', () => {
      expect(parseSessionEvent('some.future.event', null).kind).toBe('invalid');
      expect(parseSessionEvent('some.future.event', { timestamp: 1 }).kind).toBe('invalid');
    });

    it('narrows the payload type when switching on a known event name', () => {
      const parsed = parseSessionEvent('typing.start', {
        sessionId: 'sess_1',
        timestamp: 1,
        userId: 'user_alpha',
        isTyping: true,
      });
      // The `known` case is distributed over SessionEventType, so this compiles
      // without a cast — the regression this test guards is that narrowing.
      if (parsed.kind === 'known' && parsed.event === 'typing.start') {
        expect(parsed.data.isTyping).toBe(true);
        expect(parsed.data.userId).toBe('user_alpha');
      } else {
        throw new Error('expected a known typing.start event');
      }
    });

    it('returns typed data for a known event', () => {
      const parsed = parseSessionEventData('message.error', {
        sessionId: 'sess_1',
        timestamp: 1,
        forUserId: 'user_alpha',
        userMessageId: 'msg_1',
        error: 'boom',
        canRetry: true,
      });
      expect(parsed?.forUserId).toBe('user_alpha');
      expect(parsed?.canRetry).toBe(true);
    });

    it('rejects a known field carrying the wrong primitive type', () => {
      expect(
        parseSessionEventData('message.error', {
          sessionId: 'sess_1',
          timestamp: 1,
          canRetry: 'yes',
        })
      ).toBeNull();
    });
  });

  describe('partner privacy', () => {
    /**
     * Several payloads are per-recipient. The contract must keep `forUserId`
     * typed as a string on every event that carries one, because the mobile
     * addressing filter duck-types it — a non-string would fail that check open.
     */
    const ADDRESSED_EVENTS = [
      'message.ai_response',
      'message.error',
      'empathy.share_suggestion',
      'empathy.context_shared',
      'empathy.revealed',
      'empathy.refining',
      'empathy.resubmitted',
      'empathy.status_updated',
      'notification.pending_action',
      'need.captured',
      'need.refined',
      'need.locked',
      'need.deleted',
      'session.needs_extracted',
      'partner.stage_completed',
    ] as const;

    it.each(ADDRESSED_EVENTS)('%s rejects a non-string forUserId', (name) => {
      const parsed = parseSessionEventData(name, {
        sessionId: 'sess_1',
        timestamp: 1,
        forUserId: { spoofed: true },
      });
      expect(parsed).toBeNull();
    });

    it('envelope schema keeps excludeUserId typed as a string', () => {
      expect(
        sessionEventEnvelopeSchema.safeParse({ sessionId: 's', excludeUserId: 42 }).success
      ).toBe(false);
    });
  });

  /**
   * Compile-time guards for the publisher side. These assert through
   * `@ts-expect-error`: if the excess-property checking ever stops working, the
   * suppressed error disappears and TypeScript fails the build on the unused
   * directive. Nothing here runs — the assertion IS the typecheck.
   */
  describe('publisher type enforcement', () => {
    it('rejects unknown, misspelled and wrongly-typed payload keys', () => {
      const valid: SessionEventPublishData<'partner.activity'> = {
        activeAt: '2026-05-30T12:00:00.000Z',
      };
      expect(valid.activeAt).toBeDefined();

      // @ts-expect-error an unknown key is not part of this event's payload
      const unknownKey: SessionEventPublishData<'partner.activity'> = { typoKey: 1 };
      void unknownKey;

      // @ts-expect-error a declared key with the wrong primitive type
      const wrongType: SessionEventPublishData<'partner.activity'> = { activeAt: 42 };
      void wrongType;
    });

    it('still rejects unknown keys when the event name is a union', () => {
      // services/stream-turn-actions.ts publishes with a variable event name
      // whose type is a union of the need.* events. Enforcement must not
      // silently degrade to `any` in that case.
      type NeedEvents = 'need.captured' | 'need.deleted';

      const valid: SessionEventPublishData<NeedEvents> = { forUserId: 'u', oldId: 'n1' };
      expect(valid.forUserId).toBe('u');

      // @ts-expect-error unknown keys are rejected for a union event name too
      const unknownKey: SessionEventPublishData<NeedEvents> = { forUserId: 'u', typoKey: 1 };
      void unknownKey;
    });

    it('rejects an undeclared key arriving via a widened variable, not just a literal', () => {
      // TypeScript's excess-property check only fires on fresh object literals,
      // so `const d = { typo: 1 }` would otherwise reach a publisher by width
      // subtyping and put an undeclared field on the wire. NoExtraSessionEventKeys
      // maps the surplus keys to `never` to close that. This models the publisher
      // parameter type; the live call sites are checked by the backend build.
      type Param<E extends SessionEventType, T> = T &
        NoExtraSessionEventKeys<E, T> &
        SessionEventPublishData<E>;

      const widened = { activeAt: 'x', escaped: 'wire' };
      // @ts-expect-error `escaped` is not declared on partner.activity
      const bad: Param<'partner.activity', typeof widened> = widened;
      void bad;

      const clean = { activeAt: 'x' };
      const ok: Param<'partner.activity', typeof clean> = clean;
      expect(ok.activeAt).toBe('x');
    });

    it('documents the erasure limitation: an annotated value launders a surplus key', () => {
      // Recorded, not asserted against. Type-level checking only sees keys
      // present in the inferred type; annotating first drops `escaped` from the
      // type while the runtime object keeps it. Closing this would mean stripping
      // unknown keys at publish time, which is deliberately not done — the
      // schemas are passthrough precisely so unknown fields survive.
      const raw = { activeAt: 'x', escaped: 'wire' };
      const narrowed: SessionEventPublishData<'partner.activity'> = raw;
      type Param = typeof narrowed & NoExtraSessionEventKeys<'partner.activity', typeof narrowed>;
      const launderedThrough: Param = narrowed;

      expect((launderedThrough as Record<string, unknown>).escaped).toBe('wire');
    });

    it('documents the union limitation: a key valid for one member is accepted for all', () => {
      // Recorded rather than asserted-against, because TypeScript cannot
      // correlate an uncorrelated union discriminant with its payload. This
      // compiles even though `capturedAt` is declared only on need.captured.
      // Publishing with a LITERAL event name gets the exact check; the two live
      // union call sites only use fields common to their possible events.
      type NeedEvents = 'need.captured' | 'need.refined';
      const crossMember: SessionEventPublishData<NeedEvents> = { capturedAt: 'x' };
      expect(crossMember).toBeDefined();
    });
  });
});
