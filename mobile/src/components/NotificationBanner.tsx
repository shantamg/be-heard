/**
 * NotificationBanner Component for Meet Without Fear Mobile
 *
 * A dismissible banner for displaying important notifications at the top of the screen.
 * Used for permission prompts and important alerts.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, X, ChevronRight } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface NotificationBannerProps {
  /** Banner title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Called when banner is dismissed */
  onDismiss?: () => void;
  /** Banner variant */
  variant?: 'info' | 'warning' | 'permission';
  /** Custom icon component */
  icon?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Notification banner for important alerts and permission prompts.
 *
 * @example
 * ```tsx
 * <NotificationBanner
 *   title="Enable Notifications"
 *   description="Stay updated on your mediation sessions"
 *   variant="permission"
 *   action={{
 *     label: "Enable",
 *     onPress: () => requestPermission()
 *   }}
 *   onDismiss={() => setShowBanner(false)}
 * />
 * ```
 */
export function NotificationBanner({
  title,
  description,
  action,
  onDismiss,
  variant = 'info',
  icon,
}: NotificationBannerProps) {
  const variantStyles = getVariantStyles(variant);

  const renderIcon = () => {
    if (icon) return icon;

    return (
      <View style={[styles.iconContainer, variantStyles.iconContainer]}>
        <Bell color={variantStyles.iconColor} size={20} />
      </View>
    );
  };

  return (
    <View style={[styles.container, variantStyles.container]} testID="notification-banner">
      {renderIcon()}

      <View style={styles.content}>
        <Text style={[styles.title, variantStyles.title]}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>

      {action && (
        <TouchableOpacity
          style={[styles.actionButton, variantStyles.actionButton]}
          onPress={action.onPress}
          testID="notification-banner-action"
        >
          <Text style={[styles.actionText, variantStyles.actionText]}>{action.label}</Text>
          <ChevronRight color={variantStyles.actionIconColor} size={16} />
        </TouchableOpacity>
      )}

      {onDismiss && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onDismiss}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          testID="notification-banner-close"
        >
          <X color={colors.textMuted} size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Permission Banner - Specialized component for notification permission prompts
// ============================================================================

export interface PermissionBannerProps {
  /** Called when user taps to enable notifications */
  onEnable: () => void;
  /** Called when user dismisses the banner */
  onDismiss: () => void;
}

/**
 * Specialized banner for requesting notification permissions.
 *
 * @example
 * ```tsx
 * {permissionStatus === 'undetermined' && (
 *   <PermissionBanner
 *     onEnable={() => requestPermission()}
 *     onDismiss={() => setDismissed(true)}
 *   />
 * )}
 * ```
 */
export function PermissionBanner({ onEnable, onDismiss }: PermissionBannerProps) {
  return (
    <NotificationBanner
      title="Enable Notifications"
      description="Get updates when your partner responds or joins a session"
      variant="permission"
      action={{
        label: 'Enable',
        onPress: onEnable,
      }}
      onDismiss={onDismiss}
    />
  );
}

// ============================================================================
// Variant Styles
// ============================================================================

interface VariantStyle {
  container: object;
  iconContainer: object;
  iconColor: string;
  title: object;
  actionButton: object;
  actionText: object;
  actionIconColor: string;
}

function getVariantStyles(variant: NotificationBannerProps['variant']): VariantStyle {
  switch (variant) {
    case 'warning':
      return {
        container: {
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          borderColor: colors.warning,
          borderLeftWidth: 3,
          borderTopWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
        },
        iconContainer: { backgroundColor: 'rgba(245, 158, 11, 0.25)' },
        iconColor: colors.warning,
        title: { color: colors.textPrimary },
        actionButton: { backgroundColor: colors.warning },
        actionText: { color: colors.bgPrimary },
        actionIconColor: colors.bgPrimary,
      };
    case 'permission':
      return {
        container: {
          backgroundColor: colors.bgSecondary,
          borderColor: colors.accent,
          borderLeftWidth: 3,
          borderTopWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
        },
        iconContainer: { backgroundColor: 'rgba(16, 163, 127, 0.2)' },
        iconColor: colors.accent,
        title: { color: colors.textPrimary },
        actionButton: { backgroundColor: colors.accent },
        actionText: { color: colors.bgPrimary },
        actionIconColor: colors.bgPrimary,
      };
    default:
      return {
        container: {
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
          borderWidth: 1,
        },
        iconContainer: { backgroundColor: colors.bgTertiary },
        iconColor: colors.textSecondary,
        title: { color: colors.textPrimary },
        actionButton: { backgroundColor: colors.bgTertiary },
        actionText: { color: colors.textPrimary },
        actionIconColor: colors.textPrimary,
      };
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 2,
  },
  closeButton: {
    padding: 4,
  },
});
