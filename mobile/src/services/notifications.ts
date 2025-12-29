/**
 * Notification Service for Meet Without Fear Mobile
 *
 * Handles push notification registration, permissions, and platform-specific setup.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ============================================================================
// Types
// ============================================================================

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NotificationData {
  screen?: string;
  sessionId?: string;
  type?: 'invite' | 'stage' | 'message' | 'followup';
  [key: string]: unknown;
}

// ============================================================================
// Notification Handler Configuration
// ============================================================================

/**
 * Configure how notifications appear when app is in foreground.
 * This should be called once at app initialization.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ============================================================================
// Permission Handling
// ============================================================================

/**
 * Check current notification permission status.
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return 'denied';
  }

  const { status } = await Notifications.getPermissionsAsync();
  return status as NotificationPermissionStatus;
}

/**
 * Request notification permissions from the user.
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

// ============================================================================
// Push Token Management
// ============================================================================

/**
 * Get the Expo push token for this device.
 * Returns null if permissions are not granted or an error occurs.
 */
export async function getExpoPushToken(): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error('Expo project ID not configured. Push notifications will not work.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// ============================================================================
// Android Channel Setup
// ============================================================================

/**
 * Set up notification channel for Android.
 * This is required for Android 8.0+ to display notifications.
 */
export function setupAndroidChannel(): void {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });

    // Additional channel for session updates
    Notifications.setNotificationChannelAsync('sessions', {
      name: 'Session Updates',
      description: 'Notifications about your mediation sessions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });

    // Channel for invitations
    Notifications.setNotificationChannelAsync('invitations', {
      name: 'Invitations',
      description: 'Notifications when someone invites you to a session',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the current device platform for push token registration.
 */
export function getDevicePlatform(): 'ios' | 'android' {
  return Platform.OS as 'ios' | 'android';
}

/**
 * Parse notification data from a notification response.
 */
export function parseNotificationData(
  response: Notifications.NotificationResponse
): NotificationData {
  return response.notification.request.content.data as NotificationData;
}

/**
 * Set the badge count on the app icon (iOS only).
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('Failed to set badge count:', error);
  }
}

/**
 * Get the current badge count.
 */
export async function getBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error) {
    console.error('Failed to get badge count:', error);
    return 0;
  }
}
