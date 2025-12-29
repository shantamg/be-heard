/**
 * NotificationInbox Component for Meet Without Fear Mobile
 *
 * Displays a list of notifications with support for read/unread states
 * and deep linking on tap.
 */

import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Users, MessageCircle, Calendar, CheckCircle, Bell } from 'lucide-react-native';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

export type NotificationType = 'invite' | 'stage' | 'message' | 'followup' | 'general';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  deepLink?: string;
  sessionId?: string;
}

export interface NotificationInboxProps {
  /** List of notifications to display */
  notifications: NotificationItem[];
  /** Called when a notification is marked as read */
  onMarkRead: (id: string) => void;
  /** Called when all notifications are marked as read */
  onMarkAllRead?: () => void;
  /** Whether data is being refreshed */
  refreshing?: boolean;
  /** Called on pull-to-refresh */
  onRefresh?: () => void;
  /** Called when inbox is empty and user taps action */
  onEmptyAction?: () => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  invite: Mail,
  stage: Users,
  message: MessageCircle,
  followup: Calendar,
  general: Bell,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  invite: colors.accent,
  stage: colors.success,
  message: '#3B82F6',
  followup: colors.warning,
  general: colors.textMuted,
};

// ============================================================================
// Component
// ============================================================================

/**
 * Notification inbox component.
 *
 * Displays a list of notifications with icons based on type,
 * read/unread indicators, and deep linking support.
 *
 * @example
 * ```tsx
 * <NotificationInbox
 *   notifications={notifications}
 *   onMarkRead={handleMarkRead}
 *   onMarkAllRead={handleMarkAllRead}
 *   refreshing={isRefreshing}
 *   onRefresh={handleRefresh}
 * />
 * ```
 */
export function NotificationInbox({
  notifications,
  onMarkRead,
  onMarkAllRead,
  refreshing = false,
  onRefresh,
  onEmptyAction,
}: NotificationInboxProps) {
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handlePress = (notification: NotificationItem) => {
    onMarkRead(notification.id);

    if (notification.deepLink) {
      router.push(notification.deepLink as any);
    } else if (notification.sessionId) {
      router.push(`/session/${notification.sessionId}` as any);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const Icon = NOTIFICATION_ICONS[item.type] || Bell;
    const iconColor = NOTIFICATION_COLORS[item.type] || '#6B7280';

    return (
      <TouchableOpacity
        style={[styles.item, !item.read && styles.unread]}
        onPress={() => handlePress(item)}
        testID={`notification-item-${item.id}`}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
          <Icon color={iconColor} size={20} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, !item.read && styles.unreadTitle]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>

        {!item.read && <View style={styles.unreadDot} testID={`notification-unread-${item.id}`} />}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (notifications.length === 0) return null;

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Notifications {unreadCount > 0 && `(${unreadCount})`}
        </Text>
        {unreadCount > 0 && onMarkAllRead && (
          <TouchableOpacity onPress={onMarkAllRead} testID="mark-all-read-button">
            <View style={styles.markAllReadButton}>
              <CheckCircle color={colors.accent} size={16} />
              <Text style={styles.markAllReadText}>Mark all read</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer} testID="notification-inbox-empty">
      <View style={styles.emptyIconContainer}>
        <Bell color={colors.textMuted} size={48} />
      </View>
      <Text style={styles.emptyTitle}>No notifications</Text>
      <Text style={styles.emptyDescription}>
        You will receive notifications when your partner responds or invites you to a session.
      </Text>
      {onEmptyAction && (
        <TouchableOpacity style={styles.emptyAction} onPress={onEmptyAction}>
          <Text style={styles.emptyActionText}>Start a Session</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        ) : undefined
      }
      testID="notification-inbox"
    />
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  markAllReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllReadText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  item: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  unread: {
    backgroundColor: colors.bgTertiary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '600',
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignSelf: 'center',
    marginLeft: 8,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyAction: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  emptyActionText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
