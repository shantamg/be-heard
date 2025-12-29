/**
 * useRealtime Hook Tests
 *
 * Tests for the realtime WebSocket hook that manages Ably connections.
 * Note: These tests use a mock Ably client which simulates async connection.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useRealtime, usePartnerTyping, usePartnerPresence } from '../useRealtime';
import { ConnectionStatus, PresenceStatus } from '@meet-without-fear/shared';

// Mock the dependencies
jest.mock('../useProfile', () => ({
  useAblyToken: () => ({
    data: { tokenRequest: { keyName: 'test-key' } },
    refetch: jest.fn().mockResolvedValue({ data: { tokenRequest: { keyName: 'test-key' } } }),
  }),
}));

jest.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', name: 'Test User' },
  }),
}));

// Mock AppState
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

describe('useRealtime', () => {
  const testSessionId = 'session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('returns initial state with correct structure', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      // Initial state should have these properties
      expect(result.current).toHaveProperty('connectionStatus');
      expect(result.current).toHaveProperty('partnerOnline');
      expect(result.current).toHaveProperty('partnerTyping');
      expect(result.current).toHaveProperty('error');
      expect(result.current.partnerOnline).toBe(false);
      expect(result.current.partnerTyping).toBe(false);
    });

    it('provides action functions', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      expect(typeof result.current.sendTyping).toBe('function');
      expect(typeof result.current.reconnect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
    });
  });

  describe('connection management', () => {
    it('starts in connecting state', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      // Should start connecting
      expect(result.current.connectionStatus).toBe(ConnectionStatus.CONNECTING);
    });

    it('calls onConnectionChange callback', async () => {
      const onConnectionChange = jest.fn();

      renderHook(() =>
        useRealtime({
          sessionId: testSessionId,
          onConnectionChange,
        })
      );

      // Wait for the async connection callback
      await waitFor(
        () => {
          expect(onConnectionChange).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );
    });

    it('provides disconnect function', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      expect(result.current.disconnect).toBeDefined();
      expect(typeof result.current.disconnect).toBe('function');
    });

    it('provides reconnect function', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      expect(result.current.reconnect).toBeDefined();
      expect(typeof result.current.reconnect).toBe('function');
    });
  });

  describe('typing indicators', () => {
    it('provides sendTyping function', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      expect(result.current.sendTyping).toBeDefined();
      expect(typeof result.current.sendTyping).toBe('function');
    });

    it('can call sendTyping without errors', () => {
      const { result } = renderHook(() =>
        useRealtime({ sessionId: testSessionId })
      );

      // Should not throw
      expect(() => {
        act(() => {
          result.current.sendTyping(true);
          result.current.sendTyping(false);
        });
      }).not.toThrow();
    });
  });

  describe('callbacks', () => {
    it('accepts onTypingChange callback', () => {
      const onTypingChange = jest.fn();

      const { result } = renderHook(() =>
        useRealtime({
          sessionId: testSessionId,
          onTypingChange,
        })
      );

      expect(result.current.sendTyping).toBeDefined();
    });

    it('accepts onPresenceChange callback', () => {
      const onPresenceChange = jest.fn();

      const { result } = renderHook(() =>
        useRealtime({
          sessionId: testSessionId,
          onPresenceChange,
        })
      );

      expect(result.current.partnerOnline).toBe(false);
    });

    it('accepts onSessionEvent callback', () => {
      const onSessionEvent = jest.fn();

      const { result } = renderHook(() =>
        useRealtime({
          sessionId: testSessionId,
          onSessionEvent,
        })
      );

      expect(result.current.connectionStatus).toBeDefined();
    });

    it('accepts onStageProgress callback', () => {
      const onStageProgress = jest.fn();

      const { result } = renderHook(() =>
        useRealtime({
          sessionId: testSessionId,
          onStageProgress,
        })
      );

      expect(result.current.partnerStage).toBeUndefined();
    });
  });
});

describe('usePartnerTyping', () => {
  it('returns typing status', () => {
    const { result } = renderHook(() => usePartnerTyping('session-123'));

    expect(result.current).toBe(false);
  });
});

describe('usePartnerPresence', () => {
  it('returns presence and connection status structure', () => {
    const { result } = renderHook(() => usePartnerPresence('session-123'));

    expect(result.current).toHaveProperty('isOnline');
    expect(result.current).toHaveProperty('status');
    expect(result.current.isOnline).toBe(false);
    // Status starts as CONNECTING
    expect(result.current.status).toBe(ConnectionStatus.CONNECTING);
  });
});
