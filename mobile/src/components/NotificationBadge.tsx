/**
 * NotificationBadge Component for Meet Without Fear Mobile
 *
 * A small badge that displays the unread notification count.
 * Positioned as an overlay on the bell icon in the header.
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

// ============================================================================
// Types
// ============================================================================

export interface NotificationBadgeProps {
  /** Number of unread notifications */
  count: number;
  /** Size variant of the badge */
  size?: 'small' | 'medium';
  /** Custom background color */
  backgroundColor?: string;
  /** Custom text color */
  textColor?: string;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Notification badge component.
 *
 * Displays a red circle with white number for unread notifications.
 * Shows "9+" when count exceeds 9.
 * Hidden when count is 0 or less.
 *
 * @example
 * ```tsx
 * <View style={styles.iconContainer}>
 *   <Bell color={colors.textPrimary} size={24} />
 *   <NotificationBadge count={5} />
 * </View>
 * ```
 */
export function NotificationBadge({
  count,
  size = 'small',
  backgroundColor = colors.error,
  textColor = '#FFFFFF',
  testID = 'notification-badge',
}: NotificationBadgeProps) {
  // Don't render if no unread notifications
  if (count <= 0) {
    return null;
  }

  const displayCount = count > 9 ? '9+' : String(count);
  const isLarge = displayCount.length > 1;

  const sizeStyles = size === 'medium' ? styles.medium : styles.small;
  const sizeLargeStyles = size === 'medium' ? styles.mediumLarge : styles.smallLarge;

  return (
    <View
      style={[
        styles.badge,
        sizeStyles,
        isLarge && sizeLargeStyles,
        { backgroundColor },
      ]}
      testID={testID}
      accessibilityLabel={`${count} unread notifications`}
      accessibilityRole="text"
    >
      <Text
        style={[
          styles.text,
          size === 'medium' && styles.mediumText,
          { color: textColor },
        ]}
      >
        {displayCount}
      </Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.bgPrimary,
  },
  small: {
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  smallLarge: {
    minWidth: 20,
    paddingHorizontal: 4,
  },
  medium: {
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  mediumLarge: {
    minWidth: 24,
    paddingHorizontal: 5,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  mediumText: {
    fontSize: 12,
  },
});
