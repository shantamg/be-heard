import { Tabs, useRouter } from 'expo-router';
import { MessageCircle, FolderOpen, User, Bell } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors } from '@/src/theme';
import { NotificationBadge } from '@/src/components/NotificationBadge';
import { useUnreadCount } from '@/src/hooks/useUnreadCount';

/**
 * Header notification bell button with badge
 */
function NotificationButton() {
  const router = useRouter();
  const { unreadCount } = useUnreadCount();

  const handlePress = () => {
    router.push('/notifications');
  };

  return (
    <TouchableOpacity
      style={styles.notificationButton}
      onPress={handlePress}
      accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      accessibilityRole="button"
      testID="notification-bell-button"
    >
      <View>
        <Bell color={colors.textPrimary} size={22} />
        <NotificationBadge count={unreadCount} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Tab bar configuration
 * Three main tabs: Chat (main), Sessions (list), Profile
 *
 * Chat is the primary interface - users start and continue conversations here.
 * Sessions provides a list view of all sessions for quick access.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <MessageCircle color={color} size={size} />
          ),
          headerTitle: 'BeHeard',
          headerRight: () => <NotificationButton />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <FolderOpen color={color} size={size} />
          ),
          headerTitle: 'My Sessions',
          headerRight: () => <NotificationButton />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <User color={color} size={size} />
          ),
          headerTitle: 'Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgSecondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
    paddingBottom: 4,
    height: 60,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  header: {
    backgroundColor: colors.bgSecondary,
    shadowColor: 'transparent',
    elevation: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontWeight: '600',
    fontSize: 17,
    color: colors.textPrimary,
  },
  notificationButton: {
    padding: 8,
    marginRight: 8,
  },
});
