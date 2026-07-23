import {
  __resetAnimationIdentityRegistryForTests,
  bridgeAnimatedId,
  createLocalAnimationScope,
  getAnimationIdentity,
  getSeenAnimatedItemIds,
  isPreRegisteredAnimatedId,
  preRegisterAnimatedId,
} from '../animationIdentity';

beforeEach(() => {
  __resetAnimationIdentityRegistryForTests();
});

describe('getAnimationIdentity', () => {
  it('returns the id unchanged when nothing is aliased', () => {
    expect(getAnimationIdentity('msg-1')).toBe('msg-1');
  });

  it('maps a reconciled server id back to the id the row first rendered under', () => {
    bridgeAnimatedId('streaming-abc', 'server-uuid');

    expect(getAnimationIdentity('server-uuid')).toBe('streaming-abc');
  });

  it('keeps the original identity across a chain of reconciliations', () => {
    // A temp id can be replaced more than once before the row settles.
    bridgeAnimatedId('optimistic-1', 'streaming-abc');
    bridgeAnimatedId('streaming-abc', 'server-uuid');

    expect(getAnimationIdentity('streaming-abc')).toBe('optimistic-1');
    expect(getAnimationIdentity('server-uuid')).toBe('optimistic-1');
  });

  it('leaves the original id resolving to itself', () => {
    bridgeAnimatedId('streaming-abc', 'server-uuid');

    expect(getAnimationIdentity('streaming-abc')).toBe('streaming-abc');
  });

  it('is stable under repeated bridging of the same pair', () => {
    bridgeAnimatedId('streaming-abc', 'server-uuid');
    bridgeAnimatedId('streaming-abc', 'server-uuid');

    expect(getAnimationIdentity('server-uuid')).toBe('streaming-abc');
  });
});

describe('preRegisterAnimatedId', () => {
  it('reports unknown ids as not pre-registered', () => {
    expect(isPreRegisteredAnimatedId('msg-1')).toBe(false);
  });

  it('reports registered ids as pre-registered', () => {
    preRegisterAnimatedId('streaming-abc');

    expect(isPreRegisteredAnimatedId('streaming-abc')).toBe(true);
  });

  it('does not implicitly cover the aliased server id', () => {
    // The renderer checks both the raw id and the identity, so the registry
    // itself deliberately keeps these independent.
    preRegisterAnimatedId('streaming-abc');
    bridgeAnimatedId('streaming-abc', 'server-uuid');

    expect(isPreRegisteredAnimatedId('server-uuid')).toBe(false);
    expect(isPreRegisteredAnimatedId(getAnimationIdentity('server-uuid'))).toBe(true);
  });
});

describe('animation scopes', () => {
  it('returns the same mutable set for one scope', () => {
    const first = getSeenAnimatedItemIds('session-1');
    first.add('msg-1');

    expect(getSeenAnimatedItemIds('session-1').has('msg-1')).toBe(true);
  });

  it('isolates seen ids between scopes', () => {
    getSeenAnimatedItemIds('session-1').add('msg-1');

    expect(getSeenAnimatedItemIds('session-2').has('msg-1')).toBe(false);
  });

  it('hands out a distinct scope each time one is created locally', () => {
    const a = createLocalAnimationScope();
    const b = createLocalAnimationScope();

    expect(a).not.toBe(b);
    getSeenAnimatedItemIds(a).add('msg-1');
    expect(getSeenAnimatedItemIds(b).has('msg-1')).toBe(false);
  });
});
