/**
 * Notifications Screen
 *
 * Displays the user's notification inbox with support for
 * read/unread states and deep linking.
 */

import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationInbox, type NotificationItem } from '@/src/components/NotificationInbox';
import { useUnreadCount } from '@/src/hooks/useUnreadCount';
import { colors } from '@/src/theme';

// ============================================================================
// Mock Data - Replace with real API
// ============================================================================

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    type: 'invite',
    title: 'New Session Invite',
    body: 'Sarah would like to start a conversation with you.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    read: false,
    sessionId: 'session-1',
  },
  {
    id: '2',
    type: 'stage',
    title: 'Session Advanced',
    body: 'Your session with Alex has moved to the Empathy stage.',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    read: false,
    sessionId: 'session-2',
  },
  {
    id: '3',
    type: 'message',
    title: 'New Message',
    body: 'Alex replied: "I understand how you feel about this..."',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    read: false,
    sessionId: 'session-2',
  },
  {
    id: '4',
    type: 'followup',
    title: 'Follow-up Reminder',
    body: 'How is your agreement with Jordan going?',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    read: true,
    sessionId: 'session-3',
  },
  {
    id: '5',
    type: 'general',
    title: 'Welcome to Meet Without Fear',
    body: 'Thanks for joining! Start your first session to begin.',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    read: true,
  },
];

// ============================================================================
// Component
// ============================================================================

export default function NotificationsScreen() {
  const router = useRouter();
  const { clearCount, setCount } = useUnreadCount();

  const [notifications, setNotifications] = useState<NotificationItem[]>(MOCK_NOTIFICATIONS);
  const [refreshing, setRefreshing] = useState(false);

  // Update unread count when screen is focused
  useFocusEffect(
    useCallback(() => {
      const unreadItems = notifications.filter((n) => !n.read);
      setCount(unreadItems.length);
    }, [notifications, setCount])
  );

  // Handle marking a notification as read
  const handleMarkRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  // Handle marking all as read
  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    clearCount();
  }, [clearCount]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Replace with actual API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  // Handle empty state action
  const handleEmptyAction = useCallback(() => {
    router.push('/session/new');
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.bgSecondary,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            color: colors.textPrimary,
            fontWeight: '600',
          },
        }}
      />

      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.content}>
          <NotificationInbox
            notifications={notifications}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onEmptyAction={handleEmptyAction}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flex: 1,
  },
});
