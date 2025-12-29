/**
 * React Query Provider for Meet Without Fear Mobile
 *
 * Configures and provides the QueryClient to the app.
 */

import React, { type PropsWithChildren, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { AppState, AppStateStatus, Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// ============================================================================
// App Focus Management
// ============================================================================

/**
 * Configure React Query to refetch on app focus.
 * This ensures data is fresh when the user returns to the app.
 */
function setupFocusManager(): () => void {
  const subscription = AppState.addEventListener(
    'change',
    (status: AppStateStatus) => {
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
    }
  );

  return () => subscription.remove();
}

/**
 * Configure React Query to track online/offline status.
 */
function setupOnlineManager(): () => void {
  // NetInfo may not be installed yet - check if available
  if (typeof NetInfo !== 'undefined' && NetInfo.addEventListener) {
    return NetInfo.addEventListener((state: NetInfoState) => {
      onlineManager.setOnline(
        state.isConnected != null &&
          state.isConnected &&
          Boolean(state.isInternetReachable)
      );
    });
  }

  return () => {};
}

// ============================================================================
// Query Client Configuration
// ============================================================================

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data considered fresh for 30 seconds
        staleTime: 30_000,

        // Cache data for 5 minutes
        gcTime: 5 * 60_000,

        // Retry failed requests up to 3 times
        retry: 3,

        // Exponential backoff for retries
        retryDelay: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30000),

        // Refetch on window focus (app comes to foreground)
        refetchOnWindowFocus: true,

        // Refetch on reconnect
        refetchOnReconnect: true,

        // Don't refetch on mount if data is fresh
        refetchOnMount: true,

        // Network mode - always run queries even when offline to use cache
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Retry failed mutations once
        retry: 1,

        // Network mode for mutations
        networkMode: 'offlineFirst',
      },
    },
  });
}

// ============================================================================
// Provider Component
// ============================================================================

type QueryProviderProps = PropsWithChildren;

/**
 * Query Provider component that wraps the app.
 *
 * Features:
 * - Automatic refetch on app focus
 * - Online/offline awareness
 * - Optimistic caching
 * - Retry with exponential backoff
 *
 * @example
 * ```tsx
 * export default function App() {
 *   return (
 *     <QueryProvider>
 *       <NavigationContainer>
 *         {...}
 *       </NavigationContainer>
 *     </QueryProvider>
 *   );
 * }
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps): React.ReactElement {
  // Create client once per app lifecycle
  const [queryClient] = useState(() => createQueryClient());

  // Setup focus and online managers on mount
  React.useEffect(() => {
    const unsubscribeFocus = setupFocusManager();
    const unsubscribeOnline = setupOnlineManager();

    return () => {
      unsubscribeFocus();
      unsubscribeOnline();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children as any}
    </QueryClientProvider>
  );
}

// ============================================================================
// Dev Tools (only in development)
// ============================================================================

/**
 * Get the query client for debugging purposes.
 * Only use this in development.
 */
export function useDebugQueryClient(): QueryClient | null {
  // Hook must be called unconditionally (React rules of hooks)
  const context = React.useContext(
    // @ts-expect-error - accessing internal context for debugging
    QueryClientProvider._context || {}
  ) as { queryClient?: QueryClient };

  // Only return the client in development
  if (__DEV__) {
    return context.queryClient || null;
  }
  return null;
}

export default QueryProvider;
