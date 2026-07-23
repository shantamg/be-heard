import {
  initialStreamLifecycleState,
  isLateFrame,
  isStreamActive,
  needsCompletionFallback,
  streamLifecycleReducer,
  toPublicStatus,
  type StreamLifecycleEvent,
  type StreamLifecycleState,
} from '../streamLifecycle';

function run(events: StreamLifecycleEvent[], from = initialStreamLifecycleState): StreamLifecycleState {
  return events.reduce(streamLifecycleReducer, from);
}

describe('streamLifecycle', () => {
  it('walks a normal turn idle → sending → acknowledged → streaming → textComplete → complete', () => {
    let state = initialStreamLifecycleState;
    expect(state.phase).toBe('idle');

    state = streamLifecycleReducer(state, { type: 'send' });
    expect(state.phase).toBe('sending');

    state = streamLifecycleReducer(state, { type: 'userMessage' });
    expect(state.phase).toBe('acknowledged');
    // Acknowledgement is invisible to consumers — still "sending".
    expect(toPublicStatus(state.phase)).toBe('sending');

    state = streamLifecycleReducer(state, { type: 'chunk' });
    expect(state.phase).toBe('streaming');

    state = streamLifecycleReducer(state, { type: 'textComplete' });
    expect(state.phase).toBe('textComplete');
    expect(state.textCompleteReceived).toBe(true);

    state = streamLifecycleReducer(state, { type: 'complete' });
    expect(state.phase).toBe('complete');
    expect(toPublicStatus(state.phase)).toBe('complete');
  });

  it('projects every phase onto the public status contract', () => {
    expect(toPublicStatus('idle')).toBe('idle');
    expect(toPublicStatus('sending')).toBe('sending');
    expect(toPublicStatus('acknowledged')).toBe('sending');
    expect(toPublicStatus('streaming')).toBe('streaming');
    expect(toPublicStatus('textComplete')).toBe('complete');
    expect(toPublicStatus('complete')).toBe('complete');
    expect(toPublicStatus('error')).toBe('error');
    // Cancelling returns the UI to a resting state, not an error state.
    expect(toPublicStatus('cancelled')).toBe('idle');
  });

  describe('soft vs hard recovery', () => {
    it('soft timeout leaves a healthy stream untouched', () => {
      const streaming = run([{ type: 'send' }, { type: 'chunk' }]);
      const after = streamLifecycleReducer(streaming, { type: 'softTimeout' });

      expect(after).toBe(streaming); // identity: nothing changed at all
      expect(isStreamActive(after)).toBe(true);
    });

    it('hard timeout abandons the turn back to idle', () => {
      const streaming = run([{ type: 'send' }, { type: 'chunk' }]);
      const after = streamLifecycleReducer(streaming, { type: 'hardTimeout' });

      expect(after.phase).toBe('idle');
      expect(isStreamActive(after)).toBe(false);
      expect(after.textCompleteReceived).toBe(false);
    });
  });

  describe('late frames', () => {
    it.each(['complete', 'cancelled', 'error'] as const)(
      'rejects chunk and textComplete after the turn is %s',
      (terminal) => {
        const events: Record<string, StreamLifecycleEvent> = {
          complete: { type: 'complete' },
          cancelled: { type: 'cancel' },
          error: { type: 'error' },
        };
        const state = run([{ type: 'send' }, { type: 'chunk' }, events[terminal]]);
        expect(isLateFrame(state)).toBe(true);

        expect(streamLifecycleReducer(state, { type: 'chunk' })).toBe(state);
        expect(streamLifecycleReducer(state, { type: 'textComplete' })).toBe(state);
      }
    );

    it('absorbs a duplicate complete without changing state', () => {
      const completed = run([
        { type: 'send' },
        { type: 'chunk' },
        { type: 'textComplete' },
        { type: 'complete' },
      ]);
      expect(streamLifecycleReducer(completed, { type: 'complete' })).toBe(completed);
    });

    it('ignores a late user_message once text is already streaming', () => {
      const streaming = run([{ type: 'send' }, { type: 'chunk' }]);
      expect(streamLifecycleReducer(streaming, { type: 'userMessage' })).toBe(streaming);
    });
  });

  describe('completion fallback', () => {
    it('is needed when complete arrives without a preceding text_complete', () => {
      const state = run([{ type: 'send' }, { type: 'chunk' }, { type: 'complete' }]);
      expect(needsCompletionFallback(state)).toBe(true);
    });

    it('is skipped when text_complete already finalized the message', () => {
      const state = run([
        { type: 'send' },
        { type: 'chunk' },
        { type: 'textComplete' },
        { type: 'complete' },
      ]);
      expect(needsCompletionFallback(state)).toBe(false);
    });
  });

  it('resets cleanly when a failed turn is retried', () => {
    const failed = run([{ type: 'send' }, { type: 'chunk' }, { type: 'error' }]);
    expect(failed.phase).toBe('error');

    const retried = streamLifecycleReducer(failed, { type: 'send' });
    expect(retried.phase).toBe('sending');
    expect(retried.textCompleteReceived).toBe(false);
    expect(isLateFrame(retried)).toBe(false);
  });
});
