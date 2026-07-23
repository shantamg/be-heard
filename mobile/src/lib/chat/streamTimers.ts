/**
 * Timer registry for a streaming turn.
 *
 * A turn juggles four independent timers, and every terminal path has to clear
 * some subset of them. Previously each site repeated an `if (ref.current) {
 * clearTimeout(...); ref.current = null }` block per timer, which is where
 * leaks hide: the sites drifted, and one missed timer outlives the component.
 *
 * Naming the timers and clearing them by name makes each call site state its
 * intent in one line, and makes "clear everything" impossible to get partially
 * wrong.
 */

export type StreamTimerName =
  /** 15s: refetch persisted messages while leaving the stream open. */
  | 'softRecovery'
  /** 90s: close the stream and fall back to server truth. */
  | 'hardTimeout'
  /** Trailing refetch after reconciliation, to catch late server writes. */
  | 'reconciliation'
  /** Throttle for cache writes during chunk delivery. */
  | 'throttledCacheUpdate';

export interface StreamTimers {
  /** Schedule `fn` under `name`, replacing any timer already held there. */
  set(name: StreamTimerName, fn: () => void, delayMs: number): void;
  /** Cancel the named timers. Unset names are ignored. */
  clear(...names: StreamTimerName[]): void;
  /** Cancel every timer. Used by unmount and cancel, where missing one leaks. */
  clearAll(): void;
  /** Whether the named timer is scheduled and has not yet fired. */
  isPending(name: StreamTimerName): boolean;
}

const ALL_TIMERS: StreamTimerName[] = [
  'softRecovery',
  'hardTimeout',
  'reconciliation',
  'throttledCacheUpdate',
];

export function createStreamTimers(): StreamTimers {
  const handles = new Map<StreamTimerName, ReturnType<typeof setTimeout>>();

  const clear = (...names: StreamTimerName[]) => {
    for (const name of names) {
      const handle = handles.get(name);
      if (handle !== undefined) {
        clearTimeout(handle);
        handles.delete(name);
      }
    }
  };

  return {
    set(name, fn, delayMs) {
      // Replacing an existing timer must cancel it, or the old callback still
      // fires. The original code did this explicitly at each site; doing it
      // here means a caller cannot forget.
      clear(name);
      const handle = setTimeout(() => {
        // Drop the handle before running the callback so the timer reads as
        // fired, not pending, to anything the callback triggers.
        handles.delete(name);
        fn();
      }, delayMs);
      handles.set(name, handle);
    },
    clear,
    clearAll() {
      clear(...ALL_TIMERS);
    },
    isPending(name) {
      return handles.has(name);
    },
  };
}
