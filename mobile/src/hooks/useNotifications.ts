/**
 * Notifications Hook for Meet Without Fear Mobile
 *
 * Manages push notification registration, listeners, and navigation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  getExpoPushToken,
  setupAndroidChannel,
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  parseNotificationData,
  getDevicePlatform,
  configureNotificationHandler,
  type NotificationPermissionStatus,
  type NotificationData,
} from '../services/notifications';
import { useAuth } from './useAuth';
import { useUpdatePushToken } from './useProfile';

// ============================================================================
// Types
// ============================================================================

export interface UseNotificationsReturn {
  /** Current permission status */
  permissionStatus: NotificationPermissionStatus | null;
  /** Whether the push token has been registered with backend */
  isRegistered: boolean;
  /** Whether registration is in progress */
  isRegistering: boolean;
  /** Request notification permissions */
  requestPermission: () => Promise<boolean>;
  /** Most recent notification received while app was foregrounded */
  lastNotification: Notifications.Notification | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to manage push notifications.
 *
 * - Requests permissions on mount (if signed in)
 * - Registers push token with backend
 * - Sets up notification listeners
 * - Handles deep linking from notification taps
 *
 * @example
 * ```tsx
 * function App() {
 *   const { permissionStatus, requestPermission } = useNotifications();
 *
 *   if (permissionStatus === 'undetermined') {
 *     return <Button onPress={requestPermission} title="Enable Notifications" />;
 *   }
 *
 *   return <MainContent />;
 * }
 * ```
 */
export function useNotifications(): UseNotificationsReturn {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { mutate: updatePushToken, isPending: isRegistering } = useUpdatePushToken();

  // State
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(
    null
  );
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(
    null
  );

  // Refs for subscription cleanup
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Request permission callback
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestNotificationPermissions();
    const status = await getNotificationPermissionStatus();
    setPermissionStatus(status);
    return granted;
  }, []);

  // Handle notification received while app is foregrounded
  const handleNotificationReceived = useCallback((notification: Notifications.Notification) => {
    setLastNotification(notification);
    console.log('Notification received:', notification.request.content.title);
  }, []);

  // Handle notification tap (navigate to deep link)
  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = parseNotificationData(response);

      if (data.screen) {
        router.push(data.screen as any);
      } else if (data.sessionId) {
        router.push(`/session/${data.sessionId}` as any);
      }
    },
    [router]
  );

  // Initialize notifications on mount
  useEffect(() => {
    // Configure notification handler once
    configureNotificationHandler();

    // Check current permission status
    getNotificationPermissionStatus().then(setPermissionStatus);
  }, []);

  // Register push token and set up listeners when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Set up Android notification channels
    setupAndroidChannel();

    // Register for push notifications
    getExpoPushToken().then((token) => {
      if (token) {
        updatePushToken(
          {
            pushToken: token,
            platform: getDevicePlatform(),
          },
          {
            onSuccess: () => {
              setIsRegistered(true);
            },
            onError: (error) => {
              console.error('Failed to register push token:', error);
            },
          }
        );
      }
    });

    // Handle notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      handleNotificationReceived
    );

    // Handle notification tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    // Cleanup listeners on unmount
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, handleNotificationReceived, handleNotificationResponse, updatePushToken]);

  return {
    permissionStatus,
    isRegistered,
    isRegistering,
    requestPermission,
    lastNotification,
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { NotificationData, NotificationPermissionStatus };
