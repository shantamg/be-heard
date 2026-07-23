/**
 * Cross-turn ownership regression tests.
 *
 * Codex review found two high-severity races: a superseded turn could clear the
 * CURRENT turn's timers and rewrite its cache rows, because every ref, the timer
 * registry and the caches are singletons shared across turns. Transport identity
 * alone did not prevent it — by the time `closeTransport` declined to touch a
 * newer transport, the handler body had already done the damage.
 *
 * Every test here fails if its ownership guard is removed. That is the point:
 * these pin the guard, not the happy path.
 */

import { MessageRole, Stage } from '@meet-without-fear/shared';
import { createStreamTimers } from '../streamTimers';
import { initialStreamLifecycleState } from '../streamLifecycle';
import {
  createStreamTurnHandlers,
  type StreamTurnContext,
  type StreamTurnRefs,
} from '../streamTurnHandlers';

const ref = <T,>(value: T) => ({ current: value });

function makeRefs(overrides: Partial<Record<keyof StreamTurnRefs, unknown>> = {}): StreamTurnRefs {
  return {
    accumulatedText: ref(''),
    aiMessageId: ref('streaming-1'),
    optimisticUserId: ref('optimistic-user-1'),
    activeUserMessageId: ref('optimistic-user-1'),
    realUserId: ref(''),
    lastCacheUpdate: ref(0),
    lifecycle: ref(initialStreamLifecycleState),
    ...(overrides as object),
  } as StreamTurnRefs;
}

function makeCtx(isCurrent: () => boolean) {
  const cache = {
    add: jest.fn(),
    update: jest.fn(),
    replaceId: jest.fn(),
    remove: jest.fn(),
  };
  const timers = createStreamTimers();
  const ctx: StreamTurnContext = {
    isCurrent,
    sessionId: 'session-1',
    currentStage: Stage.WITNESS,
    refiningNeedId: null,
    refs: makeRefs(),
    cache: cache as unknown as StreamTurnContext['cache'],
    timers,
    dispatch: jest.fn(() => initialStreamLifecycleState),
    handleMetadata: jest.fn(),
    invalidateKeys: jest.fn(),
    reconcilePersistedMessages: jest.fn(),
    cleanupFailedStream: jest.fn(),
    setErrorMessage: jest.fn(),
    closeTransport: jest.fn(),
    onComplete: jest.fn(),
    onError: jest.fn(),
  };
  return { ctx, cache, timers, handlers: createStreamTurnHandlers(ctx) };
}

/** A turn that has been superseded by a newer send. */
const stale = () => false;
/** A turn that still owns the shared state. */
const current = () => true;

describe('a superseded turn does not touch shared state', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('a late error does not clear the current turn\'s timers', () => {
    // The destructive sequence: turn N's socket errors after turn N+1 armed its
    // recovery timers. Without the guard, N's `timers.clearAll()` disarms them.
    const { handlers, timers } = makeCtx(stale);
    const soft = jest.fn();
    timers.set('softRecovery', soft, 15000);

    handlers.error('connection lost');

    expect(timers.isPending('softRecovery')).toBe(true);
    jest.advanceTimersByTime(15000);
    expect(soft).toHaveBeenCalledTimes(1);
  });

  it('a late error does not roll back the current turn\'s messages', () => {
    // `cleanupFailedStream` removes rows by the ids in the shared refs — which
    // by now belong to the newer turn.
    const { handlers, ctx } = makeCtx(stale);

    handlers.error('connection lost');

    expect(ctx.cleanupFailedStream).not.toHaveBeenCalled();
    expect(ctx.setErrorMessage).not.toHaveBeenCalled();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.onError).not.toHaveBeenCalled();
  });

  it('a late complete does not drive the current turn to a terminal phase', () => {
    const { handlers, ctx, cache } = makeCtx(stale);

    handlers.complete({ messageId: 'server-1', metadata: {} } as never);

    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.reconcilePersistedMessages).not.toHaveBeenCalled();
    expect(cache.replaceId).not.toHaveBeenCalled();
    expect(ctx.onComplete).not.toHaveBeenCalled();
  });

  it('a late terminal frame still closes its OWN transport', () => {
    // Bailing out entirely would strand this turn's socket open. `closeTransport`
    // is identity-safe, so calling it cannot affect the newer turn.
    //
    // Honest scope: unlike its siblings, this one does NOT fail if the ownership
    // guard is deleted — the fall-through path closes the transport too. It
    // guards a narrower regression: a future guard that returns early WITHOUT
    // closing. Verified by mutation; kept because that regression is easy to
    // introduce while "tightening" the guard.
    for (const fire of [
      (h: ReturnType<typeof makeCtx>['handlers']) => h.error('boom'),
      (h: ReturnType<typeof makeCtx>['handlers']) => h.complete(null),
    ]) {
      const { handlers, ctx } = makeCtx(stale);
      fire(handlers);
      expect(ctx.closeTransport).toHaveBeenCalledTimes(1);
    }
  });

  it('a late chunk does not append to the current turn\'s text or cache', () => {
    const { handlers, ctx, cache } = makeCtx(stale);

    handlers.chunk({ text: 'from the old turn' } as never);

    expect(ctx.refs.accumulatedText.current).toBe('');
    expect(cache.add).not.toHaveBeenCalled();
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it('a late user_message does not rewrite the current turn\'s ids', () => {
    const { handlers, ctx, cache } = makeCtx(stale);

    handlers.user_message({
      id: 'server-user-old',
      content: 'stale',
      timestamp: '2026-01-01T00:00:00.000Z',
      refiningNeedId: null,
    } as never);

    expect(ctx.refs.realUserId.current).toBe('');
    expect(ctx.refs.optimisticUserId.current).toBe('optimistic-user-1');
    expect(cache.update).not.toHaveBeenCalled();
  });

  it('a late metadata frame does not reach the metadata handler', () => {
    // Metadata opens panels and can seed the empathy draft — a stale turn must
    // not do that to the current one.
    const { handlers, ctx } = makeCtx(stale);

    handlers.metadata({ metadata: { proposedEmpathyStatement: 'stale' } } as never);

    expect(ctx.handleMetadata).not.toHaveBeenCalled();
  });

  it('a late text_complete does not disarm recovery or finalise the message', () => {
    const { handlers, ctx, cache, timers } = makeCtx(stale);
    timers.set('hardTimeout', jest.fn(), 90000);

    handlers.text_complete({ metadata: {} } as never);

    expect(timers.isPending('hardTimeout')).toBe(true);
    expect(cache.add).not.toHaveBeenCalled();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.onComplete).not.toHaveBeenCalled();
  });
});

describe('the owning turn is unaffected by the guard', () => {
  // Positive controls. Without these, every test above would pass on a handler
  // set that did nothing at all.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('applies a chunk and creates the placeholder', () => {
    const { handlers, ctx, cache } = makeCtx(current);

    handlers.chunk({ text: 'hello' } as never);

    expect(ctx.refs.accumulatedText.current).toBe('hello');
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'chunk' });
    expect(cache.add).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ role: MessageRole.AI, status: 'streaming' }),
      Stage.WITNESS
    );
  });

  it('captures the server id from user_message', () => {
    const { handlers, ctx, cache } = makeCtx(current);

    handlers.user_message({
      id: 'server-user-1',
      content: 'hi',
      timestamp: '2026-01-01T00:00:00.000Z',
      refiningNeedId: null,
    } as never);

    expect(ctx.refs.realUserId.current).toBe('server-user-1');
    expect(cache.update).toHaveBeenCalled();
  });

  it('routes metadata and drives the terminal transition on error', () => {
    const { handlers, ctx } = makeCtx(current);

    handlers.metadata({ metadata: { offerFeelHeardCheck: true } } as never);
    expect(ctx.handleMetadata).toHaveBeenCalled();

    handlers.error('boom');
    expect(ctx.cleanupFailedStream).toHaveBeenCalled();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'error' });
    expect(ctx.onError).toHaveBeenCalled();
    expect(ctx.closeTransport).toHaveBeenCalled();
  });

  it('clears its own timers on error', () => {
    const { handlers, timers } = makeCtx(current);
    timers.set('softRecovery', jest.fn(), 15000);

    handlers.error('boom');

    expect(timers.isPending('softRecovery')).toBe(false);
  });
});

describe('a throwing caller callback cannot strand the socket', () => {
  it('closes the transport when onError throws', () => {
    // The recovery timers are already disarmed at this point, so nothing else
    // would ever close this socket.
    const { ctx, handlers } = makeCtx(current);
    (ctx.onError as jest.Mock).mockImplementation(() => {
      throw new Error('consumer blew up');
    });

    expect(() => handlers.error('boom')).toThrow('consumer blew up');
    expect(ctx.closeTransport).toHaveBeenCalledTimes(1);
  });

  it('closes the transport when metadata handling throws during complete', () => {
    const { ctx, handlers } = makeCtx(current);
    (ctx.handleMetadata as jest.Mock).mockImplementation(() => {
      throw new Error('consumer blew up');
    });

    expect(() =>
      handlers.complete({ messageId: 'server-1', metadata: {} } as never)
    ).toThrow('consumer blew up');
    expect(ctx.closeTransport).toHaveBeenCalledTimes(1);
  });
});

describe('complete without a preceding text_complete (the fallback path)', () => {
  // Review found this branch entirely uncovered: every `complete` in the
  // characterization suite follows a `text_complete`, so the fallback that
  // finalises the AI row — and the read-before-dispatch ordering of
  // `needsCompletionFallback` — was never executed by a test.
  it('finalises the AI message and fires onComplete', () => {
    const { handlers, ctx, cache } = makeCtx(current);
    ctx.refs.accumulatedText.current = 'streamed text';

    handlers.complete({ messageId: 'server-ai-1', metadata: {} } as never);

    expect(cache.add).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ content: 'streamed text', status: 'sent' }),
      Stage.WITNESS
    );
    expect(ctx.onComplete).toHaveBeenCalledTimes(1);
    expect(ctx.reconcilePersistedMessages).toHaveBeenCalledWith('session-1');
  });

  it('reads the fallback decision BEFORE the terminal dispatch', () => {
    // If `needsCompletionFallback` were read after `dispatch({type:'complete'})`,
    // the phase would already be terminal and the fallback would be skipped —
    // silently dropping the final AI row. Order is the whole contract here.
    const { handlers, ctx, cache } = makeCtx(current);
    ctx.refs.accumulatedText.current = 'text';
    const order: string[] = [];
    (cache.add as jest.Mock).mockImplementation(() => order.push('cache.add'));
    (ctx.dispatch as jest.Mock).mockImplementation((e: { type: string }) => {
      order.push(`dispatch:${e.type}`);
      return initialStreamLifecycleState;
    });

    handlers.complete({ messageId: 'server-ai-1', metadata: {} } as never);

    expect(order).toContain('cache.add');
    expect(order.indexOf('cache.add')).toBeLessThan(order.indexOf('dispatch:complete'));
  });

  it('bridges both the AI and the user row to their server ids', () => {
    const { handlers, ctx, cache } = makeCtx(current);
    ctx.refs.realUserId.current = 'server-user-1';

    handlers.complete({ messageId: 'server-ai-1', metadata: {} } as never);

    expect(cache.replaceId).toHaveBeenCalledWith(
      'session-1', 'streaming-1', 'server-ai-1', Stage.WITNESS
    );
    expect(cache.replaceId).toHaveBeenCalledWith(
      'session-1', 'optimistic-user-1', 'server-user-1', Stage.WITNESS
    );
    expect(ctx.refs.aiMessageId.current).toBe('server-ai-1');
    expect(ctx.refs.activeUserMessageId.current).toBe('server-user-1');
  });

  it('still ends the turn when the payload is invalid', () => {
    // The frame's arrival is the signal. Before this, an invalid payload left
    // status stuck at streaming with the hard timeout already cleared.
    const { handlers, ctx } = makeCtx(current);

    handlers.complete(null);

    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'complete' });
    expect(ctx.closeTransport).toHaveBeenCalled();
  });
});
