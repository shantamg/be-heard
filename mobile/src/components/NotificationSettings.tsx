/**
 * NotificationSettings Component
 *
 * Reusable component for managing notification preferences.
 * Includes toggles for push/email notifications and per-event settings.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  Bell,
  Mail,
  MessageCircle,
  Users,
  Calendar,
  Settings,
} from 'lucide-react-native';
import { colors } from '../theme';
import { useNotifications } from '../hooks/useNotifications';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  NotificationPreferencesDTO,
  UpdateNotificationPreferencesRequest,
} from '../hooks/useNotificationPreferences';

// ============================================================================
// Types
// ============================================================================

interface NotificationSettingsProps {
  /** Called when preferences are successfully updated */
  onUpdate?: (preferences: NotificationPreferencesDTO) => void;
}

interface ToggleItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

// ============================================================================
// Toggle Item Component
// ============================================================================

function ToggleItem({
  icon,
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: ToggleItemProps) {
  return (
    <View style={[styles.toggleItem, disabled && styles.toggleItemDisabled]}>
      <View style={styles.toggleIcon}>{icon}</View>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleTitle, disabled && styles.toggleTitleDisabled]}>
          {title}
        </Text>
        <Text style={[styles.toggleDescription, disabled && styles.toggleDescriptionDisabled]}>
          {description}
        </Text>
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.bgTertiary, true: colors.accent }}
        thumbColor={value ? colors.textPrimary : colors.textMuted}
        ios_backgroundColor={colors.bgTertiary}
      />
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationSettings({ onUpdate }: NotificationSettingsProps) {
  const { permissionStatus, requestPermission, isRegistered } = useNotifications();

  const {
    data: preferences,
    isLoading: isLoadingPreferences,
    isError: isPreferencesError,
  } = useNotificationPreferences();

  const { mutate: updatePreferences, isPending: isUpdating } =
    useUpdateNotificationPreferences({
      onSuccess: (data) => {
        onUpdate?.(data.preferences);
      },
    });

  // Determine if push notifications are available at the OS level
  const pushDeniedByOS = permissionStatus === 'denied';
  const pushGrantedByOS = permissionStatus === 'granted';

  // Master push toggle should be disabled if OS denied permissions
  const canTogglePush = !pushDeniedByOS;
  const pushEffectivelyEnabled =
    pushGrantedByOS && isRegistered && (preferences?.pushEnabled ?? false);

  // Per-event toggles are disabled if push is not enabled
  const eventTogglesDisabled = !pushEffectivelyEnabled;

  // Handle preference updates
  const handlePreferenceChange = useCallback(
    (key: keyof UpdateNotificationPreferencesRequest, value: boolean) => {
      updatePreferences({ [key]: value });
    },
    [updatePreferences]
  );

  // Handle enabling push notifications
  const handleEnablePush = useCallback(async () => {
    if (pushDeniedByOS) {
      // Direct user to OS settings
      Alert.alert(
        'Notifications Disabled',
        'To enable notifications, please go to Settings and enable them for Meet Without Fear.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    } else {
      // Request permission and enable
      const granted = await requestPermission();
      if (granted) {
        handlePreferenceChange('pushEnabled', true);
      }
    }
  }, [pushDeniedByOS, requestPermission, handlePreferenceChange]);

  // Handle toggling push master switch
  const handlePushToggle = useCallback(
    (value: boolean) => {
      if (value && !pushGrantedByOS) {
        handleEnablePush();
      } else {
        handlePreferenceChange('pushEnabled', value);
      }
    },
    [pushGrantedByOS, handleEnablePush, handlePreferenceChange]
  );

  // Render loading state
  if (isLoadingPreferences) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  // Render error state
  if (isPreferencesError || !preferences) {
    return (
      <View style={styles.errorContainer}>
        <Bell color={colors.error} size={32} />
        <Text style={styles.errorText}>Failed to load notification preferences</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* OS Permission Status Banner */}
      {pushDeniedByOS && (
        <View style={styles.section}>
          <View style={styles.warningBanner}>
            <Bell color={colors.error} size={20} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Notifications Blocked</Text>
              <Text style={styles.warningDescription}>
                Enable in your device settings to receive push notifications
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleEnablePush}
            testID="open-settings-button"
          >
            <Settings color={colors.textPrimary} size={20} />
            <Text style={styles.settingsButtonText}>Open Device Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Master Toggles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Channels</Text>
        <View style={styles.toggleList}>
          <ToggleItem
            testID="push-toggle"
            icon={<Bell color={colors.accent} size={20} />}
            title="Push Notifications"
            description="Receive notifications on your device"
            value={preferences.pushEnabled && pushGrantedByOS}
            onValueChange={handlePushToggle}
            disabled={!canTogglePush || isUpdating}
          />
          <ToggleItem
            testID="email-toggle"
            icon={<Mail color={colors.accent} size={20} />}
            title="Email Notifications"
            description="Receive updates via email"
            value={preferences.emailEnabled}
            onValueChange={(value) => handlePreferenceChange('emailEnabled', value)}
            disabled={isUpdating}
          />
        </View>
      </View>

      {/* Per-Event Toggles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Types</Text>
        {eventTogglesDisabled && (
          <Text style={styles.sectionHint}>
            Enable push notifications above to customize these settings
          </Text>
        )}
        <View style={styles.toggleList}>
          <ToggleItem
            testID="invitations-toggle"
            icon={<MessageCircle color={colors.accent} size={20} />}
            title="New Invitations"
            description="When someone invites you to a session"
            value={preferences.newInvitations}
            onValueChange={(value) => handlePreferenceChange('newInvitations', value)}
            disabled={eventTogglesDisabled || isUpdating}
          />
          <ToggleItem
            testID="partner-actions-toggle"
            icon={<Users color={colors.accent} size={20} />}
            title="Partner Actions"
            description="When your partner signs compact, completes a stage, etc."
            value={preferences.partnerActions}
            onValueChange={(value) => handlePreferenceChange('partnerActions', value)}
            disabled={eventTogglesDisabled || isUpdating}
          />
          <ToggleItem
            testID="reminders-toggle"
            icon={<Calendar color={colors.accent} size={20} />}
            title="Follow-up Reminders"
            description="Reminders to check in on your agreements"
            value={preferences.followUpReminders}
            onValueChange={(value) => handlePreferenceChange('followUpReminders', value)}
            disabled={eventTogglesDisabled || isUpdating}
          />
        </View>
      </View>

      {/* Info Text */}
      <View style={styles.section}>
        <Text style={styles.infoText}>
          Notifications help you stay connected with your mediation sessions. You can
          customize which types of notifications you receive above.
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.error,
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  warningDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  settingsButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  toggleList: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleItemDisabled: {
    opacity: 0.5,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toggleContent: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  toggleTitleDisabled: {
    color: colors.textMuted,
  },
  toggleDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toggleDescriptionDisabled: {
    color: colors.textMuted,
  },
  infoText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 8,
  },
});

export default NotificationSettings;
