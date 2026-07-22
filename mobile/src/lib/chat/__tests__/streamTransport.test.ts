/**
 * These tests pin the validate-or-drop boundary. The point of the transport is
 * that no unvalidated payload reaches a handler, and that the two frames whose
 * handling is deliberately asymmetric (`complete`, `error`) stay that way.
 */

interface MockSseEvent {
  data?: string | null;
  message?: string;
}

const mockInstances: MockEventSource[] = [];

class MockEventSource {
  listeners: Record<string, Array<(event: MockSseEvent) => void>> = {};
  close = jest.fn();
  url: string;
  options: Record<string, unknown>;

  constructor(url: string, options: Record<string, unknown>) {
    this.url = url;
    this.options = options;
    mockInstances.push(this);
  }

  addEventListener(eventName: string, listener: (event: MockSseEvent) => void) {
    this.listeners[eventName] = this.listeners[eventName] || [];
    this.listeners[eventName].push(listener);
  }

  emit(eventName: string, event: MockSseEvent) {
    for (const listener of this.listeners[eventName] ?? []) listener(event);
  }
}

jest.mock('react-native-sse', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((url: string, options: Record<string, unknown>) => {
    return new MockEventSource(url, options);
  }),
}));

import { openStreamTransport, type StreamTransportHandlers } from '../streamTransport';

function createHandlers(): jest.Mocked<StreamTransportHandlers> {
  return {
    user_message: jest.fn(),
    chunk: jest.fn(),
    metadata: jest.fn(),
    text_complete: jest.fn(),
    complete: jest.fn(),
    error: jest.fn(),
  };
}

function open(handlers: StreamTransportHandlers) {
  const transport = openStreamTransport(
    {
      url: 'https://api.example.com/sessions/s1/messages/stream',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ content: 'hello' }),
    },
    handlers
  );
  return { transport, es: mockInstances[mockInstances.length - 1] };
}

describe('openStreamTransport', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInstances.length = 0;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('opens a POST connection with the supplied headers and body', () => {
    const { es } = open(createHandlers());

    expect(es.url).toBe('https://api.example.com/sessions/s1/messages/stream');
    expect(es.options).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
      pollingInterval: 0,
    });
    expect(es.options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    });
  });

  it('delivers validated payloads to their handlers', () => {
    const handlers = createHandlers();
    const { es } = open(handlers);

    es.emit('user_message', {
      data: JSON.stringify({
        id: 'm1',
        content: 'hi',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    });
    es.emit('chunk', { data: JSON.stringify({ text: 'partial' }) });

    expect(handlers.user_message).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', content: 'hi' })
    );
    expect(handlers.chunk).toHaveBeenCalledWith(expect.objectContaining({ text: 'partial' }));
  });

  it('drops frames with malformed JSON before they reach a handler', () => {
    const handlers = createHandlers();
    const { es } = open(handlers);

    es.emit('chunk', { data: '{not json' });

    expect(handlers.chunk).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[useStreamingMessage] Dropping invalid chunk frame');
  });

  it('drops frames whose payload fails the schema', () => {
    // Well-formed JSON, wrong shape. This is the case a plain JSON.parse would
    // let through into cache-mutating code.
    const handlers = createHandlers();
    const { es } = open(handlers);

    es.emit('chunk', { data: JSON.stringify({ text: 42 }) });
    es.emit('user_message', { data: JSON.stringify({ id: 'm1' }) });

    expect(handlers.chunk).not.toHaveBeenCalled();
    expect(handlers.user_message).not.toHaveBeenCalled();
  });

  it('ignores frames with no data at all', () => {
    const handlers = createHandlers();
    const { es } = open(handlers);

    es.emit('chunk', { data: null });
    es.emit('text_complete', {});

    expect(handlers.chunk).not.toHaveBeenCalled();
    expect(handlers.text_complete).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays usable after a dropped frame', () => {
    const handlers = createHandlers();
    const { es } = open(handlers);

    es.emit('chunk', { data: '{bad' });
    es.emit('chunk', { data: JSON.stringify({ text: 'recovered' }) });

    expect(handlers.chunk).toHaveBeenCalledTimes(1);
    expect(handlers.chunk).toHaveBeenCalledWith(expect.objectContaining({ text: 'recovered' }));
  });

  describe('complete', () => {
    it('delivers a valid payload', () => {
      const handlers = createHandlers();
      const { es } = open(handlers);

      es.emit('complete', {
        data: JSON.stringify({ messageId: 'm2', metadata: {} }),
      });

      expect(handlers.complete).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm2' })
      );
    });

    it('still fires with null when the payload is invalid — the turn must close', () => {
      // Unlike every other frame, arrival is itself the signal. Dropping this
      // one silently would leave the turn open forever.
      const handlers = createHandlers();
      const { es } = open(handlers);

      es.emit('complete', { data: '{bad json' });

      expect(handlers.complete).toHaveBeenCalledWith(null);
      expect(errorSpy).toHaveBeenCalledWith(
        '[useStreamingMessage] Dropping invalid complete frame'
      );
    });

    it('still fires with null when there is no payload, without logging a drop', () => {
      const handlers = createHandlers();
      const { es } = open(handlers);

      es.emit('complete', {});

      expect(handlers.complete).toHaveBeenCalledWith(null);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('forwards the transport error message', () => {
      const handlers = createHandlers();
      const { es } = open(handlers);

      es.emit('error', { message: 'xhr failed' });

      expect(handlers.error).toHaveBeenCalledWith('xhr failed');
    });

    it('falls back to a generic message for events that carry none', () => {
      // TimeoutEvent has a type and nothing else.
      const handlers = createHandlers();
      const { es } = open(handlers);

      es.emit('error', {});

      expect(handlers.error).toHaveBeenCalledWith('Connection error');
    });
  });

  describe('close', () => {
    it('closes the underlying connection', () => {
      const handlers = createHandlers();
      const { transport, es } = open(handlers);

      transport.close();

      expect(es.close).toHaveBeenCalledTimes(1);
    });

    it('is idempotent, so a handler and cleanup can both call it', () => {
      const handlers = createHandlers();
      const { transport, es } = open(handlers);

      transport.close();
      transport.close();
      transport.close();

      expect(es.close).toHaveBeenCalledTimes(1);
    });
  });
});
