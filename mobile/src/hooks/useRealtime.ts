/**
 * useRealtime Hook for BeHeard Mobile
 *
 * Provides WebSocket connection management, event subscriptions,
 * and reconnection logic using Ably for real-time functionality.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ConnectionStatus,
  ConnectionState,
  SessionEventType,
  SessionEventData,
  PresenceStatus,
  REALTIME_CHANNELS,
} from '@be-heard/shared';
import { useAblyToken } from './useProfile';
import { useAuth } from './useAuth';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeConfig {
  /** Session ID to subscribe to */
  sessionId: string;
  /** Whether to enable presence tracking */
  enablePresence?: boolean;
  /** Callback when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;
  /** Callback when partner presence changes */
  onPresenceChange?: (userId: string, status: PresenceStatus) => void;
  /** Callback when partner starts/stops typing */
  onTypingChange?: (userId: string, isTyping: boolean) => void;
  /** Callback for session events */
  onSessionEvent?: (event: SessionEventType, data: SessionEventData) => void;
  /** Callback for stage progress updates */
  onStageProgress?: (userId: string, stage: number, status: string) => void;
}

export interface RealtimeState {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Whether the partner is online */
  partnerOnline: boolean;
  /** Whether the partner is typing */
  partnerTyping: boolean;
  /** Partner's current stage (if known) */
  partnerStage?: number;
  /** Last error message */
  error?: string;
}

export interface RealtimeActions {
  /** Send typing indicator */
  sendTyping: (isTyping: boolean) => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect from realtime */
  disconnect: () => void;
}

// ============================================================================
// Mock Ably Client (for development without Ably SDK)
// ============================================================================

interface MockChannel {
  subscribe: (callback: (message: { name: string; data: unknown }) => void) => void;
  unsubscribe: () => void;
  publish: (event: string, data: unknown) => Promise<void>;
  presence: {
    enter: (data?: unknown) => Promise<void>;
    leave: () => Promise<void>;
    subscribe: (event: string, callback: (member: { clientId: string; data?: unknown }) => void) => void;
    unsubscribe: () => void;
    get: () => Promise<{ clientId: string; data?: unknown }[]>;
  };
}

interface MockAblyClient {
  connection: {
    state: string;
    on: (callback: (stateChange: { current: string; reason?: { message: string } }) => void) => void;
    off: () => void;
    connect: () => void;
    close: () => void;
  };
  channels: {
    get: (channelName: string) => MockChannel;
  };
}

function createMockAblyClient(clientId: string): MockAblyClient {
  const subscribers = new Map<string, ((message: { name: string; data: unknown }) => void)[]>();
  const presenceSubscribers = new Map<string, ((member: { clientId: string; data?: unknown }) => void)[]>();
  const connectionCallbacks: ((stateChange: { current: string; reason?: { message: string } }) => void)[] = [];

  return {
    connection: {
      state: 'connected',
      on: (callback) => {
        connectionCallbacks.push(callback);
        // Simulate immediate connection
        setTimeout(() => callback({ current: 'connected' }), 0);
      },
      off: () => {
        connectionCallbacks.length = 0;
      },
      connect: () => {
        connectionCallbacks.forEach(cb => cb({ current: 'connected' }));
      },
      close: () => {
        connectionCallbacks.forEach(cb => cb({ current: 'closed' }));
      },
    },
    channels: {
      get: (channelName: string): MockChannel => ({
        subscribe: (callback) => {
          const channelSubs = subscribers.get(channelName) || [];
          channelSubs.push(callback);
          subscribers.set(channelName, channelSubs);
        },
        unsubscribe: () => {
          subscribers.delete(channelName);
        },
        publish: async (event, data) => {
          console.log(`[Mock Ably] Publishing to ${channelName}:`, event, data);
          // Simulate event received by other clients
          const channelSubs = subscribers.get(channelName) || [];
          channelSubs.forEach(cb => cb({ name: event, data }));
        },
        presence: {
          enter: async (data) => {
            console.log(`[Mock Ably] Presence enter on ${channelName}:`, clientId, data);
          },
          leave: async () => {
            console.log(`[Mock Ably] Presence leave on ${channelName}:`, clientId);
          },
          subscribe: (event, callback) => {
            const key = `${channelName}:${event}`;
            const subs = presenceSubscribers.get(key) || [];
            subs.push(callback);
            presenceSubscribers.set(key, subs);
          },
          unsubscribe: () => {
            // Remove all presence subscribers for this channel
            for (const key of presenceSubscribers.keys()) {
              if (key.startsWith(channelName)) {
                presenceSubscribers.delete(key);
              }
            }
          },
          get: async () => {
            // Return mock presence data
            return [{ clientId }];
          },
        },
      }),
    },
  };
}

// ============================================================================
// Connection State Mapping
// ============================================================================

function mapAblyState(state: string): ConnectionStatus {
  switch (state) {
    case 'initialized':
    case 'connecting':
      return ConnectionStatus.CONNECTING;
    case 'connected':
      return ConnectionStatus.CONNECTED;
    case 'disconnected':
    case 'closing':
    case 'closed':
      return ConnectionStatus.DISCONNECTED;
    case 'suspended':
      return ConnectionStatus.SUSPENDED;
    case 'failed':
      return ConnectionStatus.FAILED;
    default:
      return ConnectionStatus.DISCONNECTED;
  }
}

// ============================================================================
// useRealtime Hook
// ============================================================================

/**
 * Hook for managing real-time WebSocket connections and subscriptions.
 *
 * @param config - Configuration options for the realtime connection
 * @returns Current state and actions for real-time functionality
 */
export function useRealtime(config: RealtimeConfig): RealtimeState & RealtimeActions {
  const {
    sessionId,
    enablePresence = true,
    onConnectionChange,
    onPresenceChange,
    onTypingChange,
    onSessionEvent,
    onStageProgress,
  } = config;

  const { user } = useAuth();
  const { data: tokenData, refetch: refetchToken } = useAblyToken();

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.CONNECTING
  );
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerStage, setPartnerStage] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Refs
  const ablyRef = useRef<MockAblyClient | null>(null);
  const channelRef = useRef<MockChannel | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef<boolean>(false);

  // ============================================================================
  // Connection Management
  // ============================================================================

  const handleConnectionStateChange = useCallback(
    (stateChange: { current: string; reason?: { message: string } }) => {
      const status = mapAblyState(stateChange.current);
      setConnectionStatus(status);

      const state: ConnectionState = {
        status,
        error: stateChange.reason?.message,
        lastConnected: status === ConnectionStatus.CONNECTED ? Date.now() : undefined,
        reconnectAttempts: reconnectAttemptsRef.current,
      };

      if (status === ConnectionStatus.CONNECTED) {
        reconnectAttemptsRef.current = 0;
        setError(undefined);
      } else if (status === ConnectionStatus.FAILED) {
        setError(stateChange.reason?.message || 'Connection failed');
      }

      onConnectionChange?.(state);
    },
    [onConnectionChange]
  );

  const connect = useCallback(async () => {
    if (!user?.id) {
      console.warn('[Realtime] No user ID available for connection');
      return;
    }

    try {
      // For now, use mock client - in production, would use real Ably SDK
      // const ably = new Ably.Realtime({
      //   authCallback: async (_, callback) => {
      //     const { data } = await refetchToken();
      //     if (data?.tokenRequest) {
      //       callback(null, data.tokenRequest);
      //     } else {
      //       callback(new Error('Failed to get token'), null);
      //     }
      //   },
      //   clientId: user.id,
      // });

      const ably = createMockAblyClient(user.id);
      ablyRef.current = ably;

      // Listen for connection state changes
      ably.connection.on(handleConnectionStateChange);

      // Subscribe to session channel
      const channelName = REALTIME_CHANNELS.session(sessionId);
      const channel = ably.channels.get(channelName);
      channelRef.current = channel;

      // Subscribe to all events
      channel.subscribe((message: { name: string; data: unknown }) => {
        const eventName = message.name as SessionEventType;
        const eventData = message.data as SessionEventData;

        // Skip events from ourselves
        if (eventData.excludeUserId === user.id) {
          return;
        }

        // Handle specific events
        switch (eventName) {
          case 'typing.start':
            setPartnerTyping(true);
            onTypingChange?.(eventData.userId || '', true);
            break;

          case 'typing.stop':
            setPartnerTyping(false);
            onTypingChange?.(eventData.userId || '', false);
            break;

          case 'presence.online':
            setPartnerOnline(true);
            onPresenceChange?.(eventData.userId || '', PresenceStatus.ONLINE);
            break;

          case 'presence.offline':
            setPartnerOnline(false);
            setPartnerTyping(false);
            onPresenceChange?.(eventData.userId || '', PresenceStatus.OFFLINE);
            break;

          case 'presence.away':
            onPresenceChange?.(eventData.userId || '', PresenceStatus.AWAY);
            break;

          case 'stage.progress':
          case 'stage.waiting':
            if (eventData.stage !== undefined) {
              setPartnerStage(eventData.stage);
              onStageProgress?.(
                eventData.userId || '',
                eventData.stage,
                (eventData as Record<string, unknown>).status as string || 'unknown'
              );
            }
            break;

          default:
            // Generic session event
            onSessionEvent?.(eventName, eventData);
            break;
        }
      });

      // Enter presence if enabled
      if (enablePresence) {
        await channel.presence.enter({ name: user.name });

        // Subscribe to presence events
        channel.presence.subscribe('enter', (member) => {
          if (member.clientId !== user.id) {
            setPartnerOnline(true);
            onPresenceChange?.(member.clientId, PresenceStatus.ONLINE);
          }
        });

        channel.presence.subscribe('leave', (member) => {
          if (member.clientId !== user.id) {
            setPartnerOnline(false);
            setPartnerTyping(false);
            onPresenceChange?.(member.clientId, PresenceStatus.OFFLINE);
          }
        });

        // Get current presence
        const members = await channel.presence.get();
        const partnerPresent = members.some((m) => m.clientId !== user.id);
        setPartnerOnline(partnerPresent);
      }
    } catch (err) {
      console.error('[Realtime] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnectionStatus(ConnectionStatus.FAILED);
    }
  }, [
    user,
    sessionId,
    enablePresence,
    handleConnectionStateChange,
    onPresenceChange,
    onTypingChange,
    onSessionEvent,
    onStageProgress,
    refetchToken,
  ]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current.presence.unsubscribe();
      channelRef.current.presence.leave();
      channelRef.current = null;
    }

    if (ablyRef.current) {
      ablyRef.current.connection.off();
      ablyRef.current.connection.close();
      ablyRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus(ConnectionStatus.DISCONNECTED);
    setPartnerOnline(false);
    setPartnerTyping(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current += 1;

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect, disconnect]);

  // ============================================================================
  // Typing Indicator
  // ============================================================================

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !user?.id) return;

      // Debounce typing events
      if (lastTypingRef.current === isTyping) return;
      lastTypingRef.current = isTyping;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      const event = isTyping ? 'typing.start' : 'typing.stop';
      channelRef.current.publish(event, {
        userId: user.id,
        sessionId,
        isTyping,
        timestamp: Date.now(),
      });

      // Auto-stop typing after 5 seconds of no input
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          sendTyping(false);
        }, 5000);
      }
    },
    [sessionId, user]
  );

  // ============================================================================
  // App State Handling
  // ============================================================================

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - reconnect if needed
        if (connectionStatus !== ConnectionStatus.CONNECTED) {
          reconnect();
        }
      } else if (nextAppState === 'background') {
        // App went to background - could optionally disconnect
        // For now, keep connection alive for push notifications
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [connectionStatus, reconnect]);

  // ============================================================================
  // Lifecycle
  // ============================================================================

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // ============================================================================
  // Return Value
  // ============================================================================

  return {
    // State
    connectionStatus,
    partnerOnline,
    partnerTyping,
    partnerStage,
    error,
    // Actions
    sendTyping,
    reconnect,
    disconnect,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for subscribing to typing indicators only.
 */
export function usePartnerTyping(sessionId: string): boolean {
  const { partnerTyping } = useRealtime({
    sessionId,
    enablePresence: false,
  });
  return partnerTyping;
}

/**
 * Hook for subscribing to partner presence only.
 */
export function usePartnerPresence(sessionId: string): {
  isOnline: boolean;
  status: ConnectionStatus;
} {
  const { partnerOnline, connectionStatus } = useRealtime({
    sessionId,
    enablePresence: true,
  });
  return { isOnline: partnerOnline, status: connectionStatus };
}

/**
 * Hook for session event subscriptions.
 */
export function useSessionEvents(
  sessionId: string,
  onEvent: (event: SessionEventType, data: SessionEventData) => void
): { connectionStatus: ConnectionStatus } {
  const { connectionStatus } = useRealtime({
    sessionId,
    enablePresence: false,
    onSessionEvent: onEvent,
  });
  return { connectionStatus };
}
