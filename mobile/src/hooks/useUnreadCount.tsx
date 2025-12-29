/**
 * useUnreadCount Hook for Meet Without Fear Mobile
 *
 * Manages unread notification count with real-time updates.
 * Provides count display for notification badge in header.
 */

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

// ============================================================================
// Types
// ============================================================================

export interface UseUnreadCountReturn {
  /** Number of unread notifications */
  unreadCount: number;
  /** Whether count is being loaded */
  isLoading: boolean;
  /** Increment unread count (for new notifications) */
  incrementCount: () => void;
  /** Clear all unread count (when user views notifications) */
  clearCount: () => void;
  /** Decrement count by specific amount */
  decrementCount: (amount?: number) => void;
  /** Manually set the count */
  setCount: (count: number) => void;
  /** Refresh the count from server */
  refetch: () => Promise<void>;
}

// Query key for notification count
export const notificationCountKey = ['notifications', 'unreadCount'] as const;

// ============================================================================
// Mock API - Replace with real API when available
// ============================================================================

// In-memory store for demo (replace with actual API)
let mockUnreadCount = 3;

async function fetchUnreadCount(): Promise<number> {
  // TODO: Replace with actual API call
  // const response = await apiClient.get('/notifications/unread-count');
  // return response.data.count;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockUnreadCount;
}

async function markAllAsRead(): Promise<void> {
  // TODO: Replace with actual API call
  // await apiClient.post('/notifications/mark-all-read');

  mockUnreadCount = 0;
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to manage unread notification count.
 *
 * Fetches initial count from server, provides methods to update count,
 * and can be used with real-time subscriptions for live updates.
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { unreadCount, clearCount } = useUnreadCount();
 *
 *   const handleBellPress = () => {
 *     router.push('/notifications');
 *     clearCount();
 *   };
 *
 *   return (
 *     <TouchableOpacity onPress={handleBellPress}>
 *       <Bell color={colors.textPrimary} size={24} />
 *       <NotificationBadge count={unreadCount} />
 *     </TouchableOpacity>
 *   );
 * }
 * ```
 */
export function useUnreadCount(): UseUnreadCountReturn {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial count
  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Initial fetch on mount and auth changes
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Increment count (for new notifications)
  const incrementCount = useCallback(() => {
    setUnreadCount((prev) => prev + 1);
    mockUnreadCount += 1; // Update mock store
  }, []);

  // Clear all unread count
  const clearCount = useCallback(async () => {
    const previousCount = unreadCount;
    setUnreadCount(0);

    try {
      await markAllAsRead();
      // Invalidate any notification queries
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      // Restore count on error
      setUnreadCount(previousCount);
      console.error('Failed to mark notifications as read:', error);
    }
  }, [unreadCount, queryClient]);

  // Decrement count
  const decrementCount = useCallback((amount = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - amount));
    mockUnreadCount = Math.max(0, mockUnreadCount - amount);
  }, []);

  // Set count directly
  const setCount = useCallback((count: number) => {
    setUnreadCount(Math.max(0, count));
    mockUnreadCount = Math.max(0, count);
  }, []);

  return {
    unreadCount,
    isLoading,
    incrementCount,
    clearCount,
    decrementCount,
    setCount,
    refetch,
  };
}

// ============================================================================
// Context for Global Access (Optional)
// ============================================================================

type UnreadCountContextValue = UseUnreadCountReturn;

const UnreadCountContext = createContext<UnreadCountContextValue | null>(null);

/**
 * Provider for global unread count access.
 *
 * Wrap your app with this provider to share unread count state
 * across components without prop drilling.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <UnreadCountProvider>
 *       <Navigation />
 *     </UnreadCountProvider>
 *   );
 * }
 * ```
 */
export function UnreadCountProvider({ children }: { children: ReactNode }) {
  const unreadCountState = useUnreadCount();

  return (
    <UnreadCountContext.Provider value={unreadCountState}>
      {children}
    </UnreadCountContext.Provider>
  );
}

/**
 * Hook to access global unread count.
 * Must be used within UnreadCountProvider.
 */
export function useUnreadCountContext(): UnreadCountContextValue {
  const context = useContext(UnreadCountContext);

  if (!context) {
    throw new Error('useUnreadCountContext must be used within UnreadCountProvider');
  }

  return context;
}
