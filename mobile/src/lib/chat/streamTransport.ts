/**
 * SSE transport for a streaming turn.
 *
 * Owns EventSource construction and the validate-or-drop boundary, so callers
 * receive typed payloads and never see a raw frame. Every protocol frame is
 * parsed through the shared contract; anything that fails validation is dropped
 * before it can reach cache-mutating code.
 *
 * Two frames are deliberately not uniform, because the original behaviour is
 * not uniform and this is an extraction, not a redesign:
 *
 * - `complete` is delivered even when its payload is missing or invalid. The
 *   frame's arrival is itself the signal that the turn is over; the caller must
 *   still close out and stop the cursor. Its handler therefore takes
 *   `data | null`.
 * - `error` is a transport event, not a protocol frame. react-native-sse
 *   reserves the `error` listener for ErrorEvent / TimeoutEvent / ExceptionEvent,
 *   so it carries a message string rather than a validated payload.
 */

import EventSource from 'react-native-sse';
import {
  parseStreamEventData,
  type StreamEventDataMap,
  type StreamEventName,
} from '@meet-without-fear/shared';

/** Frames whose handler receives a validated payload, or nothing at all. */
type ValidatedFrame = 'user_message' | 'chunk' | 'metadata' | 'text_complete';

export interface StreamTransportHandlers {
  user_message(data: StreamEventDataMap['user_message']): void;
  chunk(data: StreamEventDataMap['chunk']): void;
  metadata(data: StreamEventDataMap['metadata']): void;
  text_complete(data: StreamEventDataMap['text_complete']): void;
  /**
   * The turn is over. `data` is null when the frame carried no payload or the
   * payload failed validation — the caller must still finish the turn.
   */
  complete(data: StreamEventDataMap['complete'] | null): void;
  /** Transport failure. Not a protocol `error` frame. */
  error(message: string): void;
}

export interface StreamTransportConfig {
  url: string;
  headers: Record<string, string>;
  /** Serialised request body. POST is the only method this transport uses. */
  body: string;
}

export interface StreamTransport {
  /** Idempotent. Safe to call from a handler and again from cleanup. */
  close(): void;
}

const LOG_PREFIX = '[useStreamingMessage]';

/**
 * Open a POST EventSource and route its frames to `handlers`.
 *
 * The returned handle is the only way to close the connection; the EventSource
 * itself is not exposed, so nothing outside this module can hold a reference
 * that outlives the turn.
 */
export function openStreamTransport(
  config: StreamTransportConfig,
  handlers: StreamTransportHandlers
): StreamTransport {
  const es = new EventSource<StreamEventName>(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: config.body,
    pollingInterval: 0, // Disable polling, use SSE
  });

  /**
   * Validate then dispatch. A frame with no data, malformed JSON, or a payload
   * that fails the schema is dropped here and never reaches the handler.
   */
  const routeValidated = <E extends ValidatedFrame>(event: E) => {
    es.addEventListener(event, (raw) => {
      if (!raw.data) return;
      const data = parseStreamEventData(event, raw.data);
      if (!data) {
        console.error(`${LOG_PREFIX} Dropping invalid ${event} frame`);
        return;
      }
      handlers[event](data as never);
    });
  };

  // Listener registration happens AFTER the socket is open, so anything that
  // throws here would unwind before the caller ever receives a handle — an
  // open EventSource nothing can close. Close it on the way out instead.
  try {
    routeValidated('user_message');
    routeValidated('chunk');
    routeValidated('metadata');
    routeValidated('text_complete');

    es.addEventListener('complete', (raw) => {
      const data = raw.data ? parseStreamEventData('complete', raw.data) : null;
      if (raw.data && !data) {
        console.error(`${LOG_PREFIX} Dropping invalid complete frame`);
      }
      // Delivered either way: the frame's arrival ends the turn.
      handlers.complete(data);
    });

    es.addEventListener('error', (event) => {
      const message = 'message' in event ? event.message : 'Connection error';
      handlers.error(message ?? 'Connection error');
    });

    es.addEventListener('open', () => {
      // Connection opened, waiting for events.
    });
  } catch (error) {
    es.close();
    throw error;
  }

  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      es.close();
    },
  };
}
