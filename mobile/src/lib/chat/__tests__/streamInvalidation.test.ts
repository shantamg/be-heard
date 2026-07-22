/**
 * These tests pin the invalidation sets that were previously inlined at four
 * call sites in `useStreamingMessage`. They are written against the behaviour
 * as it existed before extraction, so a drift in either direction fails.
 */

import { Stage } from '@meet-without-fear/shared';
import { messageKeys, sessionKeys, stageKeys } from '../../../hooks/queryKeys';
import {
  hardTimeoutInvalidationKeys,
  softTimeoutInvalidationKeys,
  successInvalidationKeys,
  textCompleteInvalidationKeys,
} from '../streamInvalidation';

const SESSION = 'session-1';

/** Key equality is structural; compare the serialised form. */
const serialize = (keys: readonly unknown[]) => keys.map((k) => JSON.stringify(k));
const asSet = (keys: readonly unknown[]) => new Set(serialize(keys));

describe('successInvalidationKeys', () => {
  it('always refreshes both message lists and session state', () => {
    for (const stage of [undefined, Stage.ONBOARDING, Stage.STRATEGIC_REPAIR]) {
      const keys = asSet(successInvalidationKeys(SESSION, stage));
      expect(keys).toContain(JSON.stringify(messageKeys.list(SESSION)));
      expect(keys).toContain(JSON.stringify(messageKeys.infinite(SESSION)));
      expect(keys).toContain(JSON.stringify(sessionKeys.state(SESSION)));
    }
  });

  it('adds only empathy status in Stage 2', () => {
    expect(serialize(successInvalidationKeys(SESSION, Stage.PERSPECTIVE_STRETCH))).toEqual(
      serialize([
        messageKeys.list(SESSION),
        messageKeys.infinite(SESSION),
        sessionKeys.state(SESSION),
        stageKeys.empathyStatus(SESSION),
      ])
    );
  });

  it('preserves the duplicated session-state key in Stage 3', () => {
    // The original inline code invalidated sessionKeys.state twice for this
    // stage. Idempotent, but preserved so the extraction stays pure.
    const keys = serialize(successInvalidationKeys(SESSION, Stage.NEED_MAPPING));
    const stateKey = JSON.stringify(sessionKeys.state(SESSION));
    expect(keys.filter((k) => k === stateKey)).toHaveLength(2);
    expect(keys).toContain(JSON.stringify(stageKeys.progress(SESSION)));
  });

  it('adds the four structured keys in Stage 4', () => {
    const keys = asSet(successInvalidationKeys(SESSION, Stage.STRATEGIC_REPAIR));
    for (const key of [
      stageKeys.stage4(SESSION),
      stageKeys.strategies(SESSION),
      stageKeys.agreements(SESSION),
      stageKeys.progress(SESSION),
    ]) {
      expect(keys).toContain(JSON.stringify(key));
    }
  });

  it('adds nothing beyond the base set for stages without structured state', () => {
    expect(serialize(successInvalidationKeys(SESSION, Stage.ONBOARDING))).toEqual(
      serialize([
        messageKeys.list(SESSION),
        messageKeys.infinite(SESSION),
        sessionKeys.state(SESSION),
      ])
    );
  });
});

describe('timeout recovery', () => {
  it('refreshes session state on both paths regardless of stage', () => {
    for (const stage of [undefined, Stage.ONBOARDING, Stage.NEED_MAPPING]) {
      expect(asSet(softTimeoutInvalidationKeys(SESSION, stage))).toContain(
        JSON.stringify(sessionKeys.state(SESSION))
      );
      expect(asSet(hardTimeoutInvalidationKeys(SESSION, stage))).toContain(
        JSON.stringify(sessionKeys.state(SESSION))
      );
    }
  });

  it('treats Stage 2 and Stage 3 identically on both paths', () => {
    for (const stage of [Stage.PERSPECTIVE_STRETCH, Stage.NEED_MAPPING]) {
      expect(serialize(softTimeoutInvalidationKeys(SESSION, stage))).toEqual(
        serialize(hardTimeoutInvalidationKeys(SESSION, stage))
      );
    }
  });

  it('excludes Stage 4 structured keys on the soft path but includes them on the hard path', () => {
    // This asymmetry predates the extraction and is deliberately preserved.
    // The soft path fires while the stream is still open and Stage 4 structures
    // are still being written; the hard path fires after the stream is closed.
    const soft = serialize(softTimeoutInvalidationKeys(SESSION, Stage.STRATEGIC_REPAIR));
    const hard = asSet(hardTimeoutInvalidationKeys(SESSION, Stage.STRATEGIC_REPAIR));

    expect(soft).toEqual(serialize([sessionKeys.state(SESSION)]));
    for (const key of [
      stageKeys.stage4(SESSION),
      stageKeys.strategies(SESSION),
      stageKeys.agreements(SESSION),
      stageKeys.progress(SESSION),
    ]) {
      expect(hard).toContain(JSON.stringify(key));
    }
  });

  it('never touches the message lists directly — those go through reconciliation', () => {
    // Recovery refetches persisted messages via getPersistedMessageRefreshQueryKeys,
    // which both invalidates AND refetches. Duplicating the message keys here
    // would double-fetch on every timeout.
    for (const stage of [Stage.PERSPECTIVE_STRETCH, Stage.NEED_MAPPING, Stage.STRATEGIC_REPAIR]) {
      for (const keys of [
        softTimeoutInvalidationKeys(SESSION, stage),
        hardTimeoutInvalidationKeys(SESSION, stage),
      ]) {
        expect(asSet(keys)).not.toContain(JSON.stringify(messageKeys.list(SESSION)));
        expect(asSet(keys)).not.toContain(JSON.stringify(messageKeys.infinite(SESSION)));
      }
    }
  });
});

describe('textCompleteInvalidationKeys', () => {
  it('refreshes only empathy status in Stage 2', () => {
    expect(serialize(textCompleteInvalidationKeys(SESSION, Stage.PERSPECTIVE_STRETCH))).toEqual(
      serialize([stageKeys.empathyStatus(SESSION)])
    );
  });

  it('escalates to the full success set in Stage 3', () => {
    expect(serialize(textCompleteInvalidationKeys(SESSION, Stage.NEED_MAPPING))).toEqual(
      serialize(successInvalidationKeys(SESSION, Stage.NEED_MAPPING))
    );
  });

  it('invalidates nothing for other stages — the complete event handles them', () => {
    for (const stage of [undefined, Stage.ONBOARDING, Stage.STRATEGIC_REPAIR]) {
      expect(textCompleteInvalidationKeys(SESSION, stage)).toEqual([]);
    }
  });
});
