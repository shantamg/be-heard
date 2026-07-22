import type { StreamMetadata } from '@meet-without-fear/shared';
import { sessionKeys, stageKeys } from '../../../hooks/queryKeys';
import {
  metadataInvalidationKeys,
  streamMetadataCacheWrites,
  withFeelHeardCheckOffered,
  withProposedEmpathyDraft,
} from '../streamMetadataCache';

const SESSION = 'session-1';
const serialize = (keys: readonly unknown[]) => keys.map((k) => JSON.stringify(k));

describe('withFeelHeardCheckOffered', () => {
  it('sets the flag at the nested gate path', () => {
    const result = withFeelHeardCheckOffered({
      progress: { myProgress: { gatesSatisfied: {} } },
    });

    expect(result).toMatchObject({
      progress: { myProgress: { gatesSatisfied: { feelHeardCheckOffered: true } } },
    });
  });

  it('preserves sibling state at every level of the nesting', () => {
    // Dropping a sibling here is silent — the UI just loses a field.
    const result = withFeelHeardCheckOffered({
      stage: 2,
      progress: {
        partnerProgress: { done: true },
        myProgress: {
          messageCount: 7,
          gatesSatisfied: { otherGate: true },
        },
      },
    }) as Record<string, any>;

    expect(result.stage).toBe(2);
    expect(result.progress.partnerProgress).toEqual({ done: true });
    expect(result.progress.myProgress.messageCount).toBe(7);
    expect(result.progress.myProgress.gatesSatisfied.otherGate).toBe(true);
    expect(result.progress.myProgress.gatesSatisfied.feelHeardCheckOffered).toBe(true);
  });

  it('builds the missing levels when they are absent', () => {
    const result = withFeelHeardCheckOffered({ stage: 2 }) as Record<string, any>;
    expect(result.progress.myProgress.gatesSatisfied.feelHeardCheckOffered).toBe(true);
  });

  it('leaves an empty cache alone rather than fabricating session state', () => {
    // Writing a skeleton would give readers a shape they would then trust.
    expect(withFeelHeardCheckOffered(undefined)).toBeUndefined();
  });

  it('does not mutate the cached object in place', () => {
    const original = { progress: { myProgress: { gatesSatisfied: {} } } };
    const snapshot = JSON.stringify(original);

    withFeelHeardCheckOffered(original);

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('withProposedEmpathyDraft', () => {
  it('writes the proposed content and enables consent', () => {
    const result = withProposedEmpathyDraft(undefined, 'I hear that you felt dismissed.');

    expect(result).toMatchObject({
      draft: { content: 'I hear that you felt dismissed.', readyToShare: false },
      canConsent: true,
      alreadyConsented: false,
    });
  });

  it('never inherits a stale readyToShare from the previous draft', () => {
    // Consent must not carry over to text the user has not seen.
    const result = withProposedEmpathyDraft(
      { draft: { content: 'old text', readyToShare: true }, alreadyConsented: true },
      'new text'
    ) as Record<string, any>;

    expect(result.draft.content).toBe('new text');
    expect(result.draft.readyToShare).toBe(false);
    expect(result.alreadyConsented).toBe(false);
  });

  it('preserves unrelated fields on the existing draft', () => {
    const result = withProposedEmpathyDraft(
      { draft: { content: 'old', draftId: 'd1' }, otherField: 42 },
      'new'
    ) as Record<string, any>;

    expect(result.draft.draftId).toBe('d1');
    expect(result.otherField).toBe(42);
  });
});

describe('streamMetadataCacheWrites', () => {
  it('writes nothing for metadata that carries no cacheable state', () => {
    expect(streamMetadataCacheWrites(SESSION, {} as StreamMetadata)).toEqual([]);
  });

  it('targets session state for the feel-heard check', () => {
    const writes = streamMetadataCacheWrites(SESSION, {
      offerFeelHeardCheck: true,
    } as StreamMetadata);

    expect(writes).toHaveLength(1);
    expect(writes[0].queryKey).toEqual(sessionKeys.state(SESSION));
  });

  it('targets the empathy draft key that useEmpathyDraft reads', () => {
    const writes = streamMetadataCacheWrites(SESSION, {
      proposedEmpathyStatement: 'text',
    } as StreamMetadata);

    expect(writes).toHaveLength(1);
    expect(writes[0].queryKey).toEqual(stageKeys.empathyDraft(SESSION));
    expect(writes[0].update(undefined)).toMatchObject({
      draft: { content: 'text' },
    });
  });

  it('emits both writes when the metadata carries both', () => {
    const writes = streamMetadataCacheWrites(SESSION, {
      offerFeelHeardCheck: true,
      proposedEmpathyStatement: 'text',
    } as StreamMetadata);

    expect(serialize(writes.map((w) => w.queryKey))).toEqual(
      serialize([sessionKeys.state(SESSION), stageKeys.empathyDraft(SESSION)])
    );
  });

  it('ignores an empty proposed statement', () => {
    expect(
      streamMetadataCacheWrites(SESSION, { proposedEmpathyStatement: '' } as StreamMetadata)
    ).toEqual([]);
  });
});

describe('metadataInvalidationKeys', () => {
  it('invalidates nothing for metadata with no server-owned state', () => {
    expect(metadataInvalidationKeys(SESSION, {} as StreamMetadata)).toEqual([]);
  });

  it('does not invalidate for the directly-written fields', () => {
    // These are applied via setQueryData; invalidating during an active stream
    // races the optimistic writes and makes panels flicker.
    const keys = metadataInvalidationKeys(SESSION, {
      offerFeelHeardCheck: true,
      proposedEmpathyStatement: 'text',
    } as StreamMetadata);

    expect(keys).toEqual([]);
  });

  it('refetches progress and session state for proposed needs', () => {
    const keys = metadataInvalidationKeys(SESSION, {
      proposedNeeds: [{ category: 'CONNECTION' }],
    } as unknown as StreamMetadata);

    expect(serialize(keys)).toEqual(
      serialize([stageKeys.progress(SESSION), sessionKeys.state(SESSION)])
    );
  });

  it('ignores an empty proposed-needs array', () => {
    expect(
      metadataInvalidationKeys(SESSION, { proposedNeeds: [] } as unknown as StreamMetadata)
    ).toEqual([]);
  });

  it('refetches the four structured keys for any Stage 4 signal', () => {
    const expected = serialize([
      stageKeys.stage4(SESSION),
      stageKeys.strategies(SESSION),
      stageKeys.agreements(SESSION),
      stageKeys.progress(SESSION),
    ]);

    for (const metadata of [
      { stage4Proposals: [{}] },
      { stage4WalkthroughAction: {} },
      { stage4Capture: {} },
    ]) {
      expect(serialize(metadataInvalidationKeys(SESSION, metadata as StreamMetadata))).toEqual(
        expected
      );
    }
  });

  it('combines the needs and Stage 4 key sets when both are present', () => {
    const keys = metadataInvalidationKeys(SESSION, {
      proposedNeeds: [{ category: 'CONNECTION' }],
      stage4Capture: {},
    } as unknown as StreamMetadata);

    expect(serialize(keys)).toEqual(
      serialize([
        stageKeys.progress(SESSION),
        sessionKeys.state(SESSION),
        stageKeys.stage4(SESSION),
        stageKeys.strategies(SESSION),
        stageKeys.agreements(SESSION),
        stageKeys.progress(SESSION),
      ])
    );
  });
});
