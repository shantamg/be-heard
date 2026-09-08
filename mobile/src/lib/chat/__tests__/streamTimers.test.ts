import { createStreamTimers } from '../streamTimers';

describe('createStreamTimers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('runs a scheduled callback at its delay', () => {
    const timers = createStreamTimers();
    const fn = jest.fn();

    timers.set('softRecovery', fn, 15000);
    jest.advanceTimersByTime(14999);
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels a cleared timer before it fires', () => {
    const timers = createStreamTimers();
    const fn = jest.fn();

    timers.set('hardTimeout', fn, 90000);
    timers.clear('hardTimeout');
    jest.advanceTimersByTime(200000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('replaces rather than stacks when the same name is set twice', () => {
    // This is the leak the registry exists to prevent: the original code had
    // to remember an explicit clearTimeout before every re-arm.
    const timers = createStreamTimers();
    const first = jest.fn();
    const second = jest.fn();

    timers.set('softRecovery', first, 15000);
    timers.set('softRecovery', second, 15000);
    jest.advanceTimersByTime(20000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps timers independent of one another', () => {
    const timers = createStreamTimers();
    const soft = jest.fn();
    const hard = jest.fn();

    timers.set('softRecovery', soft, 15000);
    timers.set('hardTimeout', hard, 90000);
    timers.clear('softRecovery');
    jest.advanceTimersByTime(90000);

    expect(soft).not.toHaveBeenCalled();
    expect(hard).toHaveBeenCalledTimes(1);
  });

  it('clearAll cancels every timer, including ones added later', () => {
    const timers = createStreamTimers();
    const fns = {
      softRecovery: jest.fn(),
      hardTimeout: jest.fn(),
      reconciliation: jest.fn(),
      throttledCacheUpdate: jest.fn(),
    } as const;

    timers.set('softRecovery', fns.softRecovery, 15000);
    timers.set('hardTimeout', fns.hardTimeout, 90000);
    timers.set('reconciliation', fns.reconciliation, 1200);
    timers.set('throttledCacheUpdate', fns.throttledCacheUpdate, 50);

    timers.clearAll();
    jest.advanceTimersByTime(200000);

    for (const fn of Object.values(fns)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('reports a timer as pending only between scheduling and firing', () => {
    const timers = createStreamTimers();

    expect(timers.isPending('reconciliation')).toBe(false);
    timers.set('reconciliation', () => {}, 1200);
    expect(timers.isPending('reconciliation')).toBe(true);

    jest.advanceTimersByTime(1200);
    expect(timers.isPending('reconciliation')).toBe(false);
  });

  it('reports a timer as fired, not pending, from inside its own callback', () => {
    // The soft-recovery callback re-arms other work; if it still saw itself as
    // pending it could clear a timer it no longer owns.
    const timers = createStreamTimers();
    let pendingDuringCallback: boolean | null = null;

    timers.set('softRecovery', () => {
      pendingDuringCallback = timers.isPending('softRecovery');
    }, 15000);
    jest.advanceTimersByTime(15000);

    expect(pendingDuringCallback).toBe(false);
  });

  it('tolerates clearing a timer that never existed or already fired', () => {
    const timers = createStreamTimers();

    expect(() => timers.clear('hardTimeout')).not.toThrow();

    timers.set('hardTimeout', () => {}, 100);
    jest.advanceTimersByTime(100);
    expect(() => timers.clear('hardTimeout')).not.toThrow();
    expect(() => timers.clearAll()).not.toThrow();
  });

  it('allows a callback to re-arm its own timer', () => {
    // reconcilePersistedMessages clears and re-sets the reconciliation timer.
    const timers = createStreamTimers();
    const inner = jest.fn();

    timers.set('reconciliation', () => {
      timers.set('reconciliation', inner, 1200);
    }, 1200);

    jest.advanceTimersByTime(1200);
    expect(inner).not.toHaveBeenCalled();
    expect(timers.isPending('reconciliation')).toBe(true);

    jest.advanceTimersByTime(1200);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
