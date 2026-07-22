/**
 * Stream Lifecycle
 *
 * The pure state machine behind a streaming chat turn. No React, no network,
 * no cache — it decides what phase a turn is in and which effects are still
 * legal, so those rules can be tested directly instead of inferred from hook
 * behavior.
 *
 * Phases:
 *
 *   idle → sending → acknowledged → streaming → textComplete → complete
 *
 * plus `cancelled` and `error`. `acknowledged` means the server has saved the
 * user turn (the `user_message` frame arrived) but no visible text has
 * streamed yet — externally that still reads as "sending".
 *
 * Recovery is deliberately asymmetric, and that asymmetry is the point:
 * a SOFT timeout re-reads server truth while leaving a healthy-but-slow
 * stream open, while a HARD timeout abandons the stream and resets to idle.
 */

/** Internal phase of a single streaming turn. */
export type StreamPhase =
  | 'idle'
  | 'sending'
  | 'acknowledged'
  | 'streaming'
  | 'textComplete'
  | 'complete'
  | 'cancelled'
  | 'error';

/**
 * Public status surfaced to consumers of the hook. Narrower than the internal
 * phase on purpose — this is the contract screens already depend on.
 */
export type StreamStatus = 'idle' | 'sending' | 'streaming' | 'complete' | 'error';

export type StreamLifecycleEvent =
  | { type: 'send' }
  | { type: 'userMessage' }
  | { type: 'chunk' }
  | { type: 'textComplete' }
  | { type: 'complete' }
  | { type: 'softTimeout' }
  | { type: 'hardTimeout' }
  | { type: 'cancel' }
  | { type: 'error' };

export interface StreamLifecycleState {
  phase: StreamPhase;
  /** True once `text_complete` has been seen, so `complete` skips its fallback. */
  textCompleteReceived: boolean;
}

export const initialStreamLifecycleState: StreamLifecycleState = {
  phase: 'idle',
  textCompleteReceived: false,
};

/** Phases in which the transport is expected to be open and delivering frames. */
const ACTIVE_PHASES: ReadonlySet<StreamPhase> = new Set<StreamPhase>([
  'sending',
  'acknowledged',
  'streaming',
]);

/**
 * A frame is "late" when it arrives after the turn already reached a terminal
 * phase. Late frames must not mutate the cache or resurrect a finished turn.
 */
export function isLateFrame(state: StreamLifecycleState): boolean {
  return state.phase === 'complete' || state.phase === 'cancelled' || state.phase === 'error';
}

export function streamLifecycleReducer(
  state: StreamLifecycleState,
  event: StreamLifecycleEvent
): StreamLifecycleState {
  switch (event.type) {
    case 'send':
      // Starting a turn always resets — this is also the retry entry point.
      return { phase: 'sending', textCompleteReceived: false };

    case 'userMessage':
      // Server acknowledged the user turn. Only meaningful before text starts;
      // a late ack must never pull a streaming turn backwards.
      return state.phase === 'sending' ? { ...state, phase: 'acknowledged' } : state;

    case 'chunk':
      if (isLateFrame(state)) return state;
      return state.phase === 'streaming' ? state : { ...state, phase: 'streaming' };

    case 'textComplete':
      if (isLateFrame(state)) return state;
      return { phase: 'textComplete', textCompleteReceived: true };

    case 'complete':
      // Terminal. A duplicate `complete` is absorbed without re-running effects.
      if (state.phase === 'complete') return state;
      return { ...state, phase: 'complete' };

    case 'softTimeout':
      // Never closes a healthy stream: the phase is deliberately untouched.
      return state;

    case 'hardTimeout':
      return { phase: 'idle', textCompleteReceived: false };

    case 'cancel':
      return { phase: 'cancelled', textCompleteReceived: false };

    case 'error':
      return { phase: 'error', textCompleteReceived: false };

    default:
      return state;
  }
}

/** Project the internal phase onto the public status consumers read. */
export function toPublicStatus(phase: StreamPhase): StreamStatus {
  switch (phase) {
    case 'sending':
    case 'acknowledged':
      return 'sending';
    case 'streaming':
      return 'streaming';
    case 'textComplete':
    case 'complete':
      return 'complete';
    case 'error':
      return 'error';
    case 'cancelled':
    case 'idle':
    default:
      return 'idle';
  }
}

/** Whether the transport should still be open in this phase. */
export function isStreamActive(state: StreamLifecycleState): boolean {
  return ACTIVE_PHASES.has(state.phase);
}

/**
 * Whether `complete` still needs to finalize the assistant message itself.
 * When `text_complete` already arrived it did that work, and re-doing it would
 * emit a second completion callback.
 */
export function needsCompletionFallback(state: StreamLifecycleState): boolean {
  return !state.textCompleteReceived;
}
