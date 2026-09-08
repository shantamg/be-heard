import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Star,
  Volume2,
  Bell,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';

import { useAuth } from '@/src/hooks/useAuth';
import { post } from '@/src/lib/api';
import { requestAndRegisterForPushNotifications } from '@/src/services/notifications';
import { designFonts, useAppAppearance, type AppearancePreference } from '@/src/theme';
import { useMemo, useState } from 'react';

/**
 * Settings screen
 * User settings and account management
 */
export default function SettingsScreen() {
  const { palette, preference, setPreference } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const [isSchedulingTestPush, setIsSchedulingTestPush] = useState(false);
  const canTestPushNotifications = user?.email?.toLowerCase() === 'jason@galuten.com';

  const handleSignOut = () => {
    const performSignOut = async () => {
      try {
        // Sign out from Clerk first (clears OAuth session)
        await clerkSignOut();
        // Then clear local auth state
        await signOut();
        router.replace('/(public)');
      } catch (error) {
        console.error('Sign out failed:', error);
      }
    };

    // Alert.alert is a no-op in react-native-web, so the native confirmation
    // flow never fires on web and the button appears inert. Fall back to the
    // browser-native confirm() dialog on web — same two-button shape, works
    // everywhere.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
        void performSignOut();
      }
      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: performSignOut,
        },
      ]
    );
  };

  const handleTestPushNotification = async () => {
    setIsSchedulingTestPush(true);
    try {
      const registered = await requestAndRegisterForPushNotifications();
      if (!registered) {
        Alert.alert('Notifications unavailable', 'Push notifications are not enabled on this device.');
        return;
      }

      const result = await post<{ sent: boolean; delaySeconds: number; reason?: string }>(
        '/auth/test-push-notification'
      );

      if (!result.sent) {
        Alert.alert(
          'Test send failed',
          result.reason || 'Expo did not accept the push notification.'
        );
        return;
      }

      Alert.alert('Test sent', 'Expo accepted the push notification.');
    } catch (error) {
      console.error('Test push notification failed:', error);
      Alert.alert('Test failed', 'Could not schedule the push notification test.');
    } finally {
      setIsSchedulingTestPush(false);
    }
  };

  const mainMenuItems = [
    {
      icon: User,
      label: 'Profile',
      onPress: () => {
        router.push('/settings/account');
      },
    },
    {
      icon: Volume2,
      label: 'Voice Settings',
      onPress: () => {
        router.push('/settings/voice');
      },
    },
  ];

  const memoriesMenuItems = [
    {
      icon: Star,
      label: 'Things to Remember',
      onPress: () => {
        router.push('/settings/memories');
      },
    },
  ];

  const supportMenuItems = [
    {
      icon: Shield,
      label: 'Privacy',
      onPress: () => {
        router.push('/settings/privacy');
      },
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      onPress: () => {
        router.push('/settings/help');
      },
    },
  ];

  const appearanceOptions: {
    value: AppearancePreference;
    label: string;
    Icon: typeof Monitor;
  }[] = [
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <User color={palette.bg} size={40} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Main Menu items */}
        <View style={styles.menuSection}>
          {mainMenuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuItem,
                index === 0 && styles.menuItemFirst,
                index === mainMenuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <item.icon color={palette.accent} size={22} />
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </View>
              <ChevronRight color={palette.textMuted} size={20} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.menuSection}>
          <View style={[styles.menuItem, styles.menuItemFirst, styles.menuItemLast, styles.appearanceItem]}>
            <Text style={styles.menuItemLabel}>Appearance</Text>
            <View style={styles.appearanceControl}>
              {appearanceOptions.map(({ value, label, Icon }) => {
                const selected = preference === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.appearanceButton,
                      selected && styles.appearanceButtonSelected,
                    ]}
                    onPress={() => {
                      void setPreference(value);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${label} appearance`}
                  >
                    <Icon color={selected ? palette.bg : palette.textMuted} size={15} />
                    <Text
                      style={[
                        styles.appearanceButtonText,
                        selected && styles.appearanceButtonTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Memory Menu items */}
        <View style={styles.menuSection}>
          {memoriesMenuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuItem,
                index === 0 && styles.menuItemFirst,
                index === memoriesMenuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <item.icon color={palette.accent} size={22} />
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </View>
              <ChevronRight color={palette.textMuted} size={20} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Support & Privacy Menu items */}
        <View style={styles.menuSection}>
          {supportMenuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuItem,
                index === 0 && styles.menuItemFirst,
                index === supportMenuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <item.icon color={palette.accent} size={22} />
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </View>
              <ChevronRight color={palette.textMuted} size={20} />
            </TouchableOpacity>
          ))}
        </View>

        {canTestPushNotifications && (
          <View style={styles.menuSection}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemFirst, styles.menuItemLast]}
              onPress={handleTestPushNotification}
              disabled={isSchedulingTestPush}
              accessibilityRole="button"
              accessibilityLabel="Test push notification"
            >
              <View style={styles.menuItemLeft}>
                <Bell color={palette.accent} size={22} />
                <Text style={styles.menuItemLabel}>
                  {isSchedulingTestPush ? 'Scheduling Test...' : 'Test Push Notification'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Sign out button */}
        <View style={styles.menuSection}>
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemFirst, styles.menuItemLast]}
            onPress={handleSignOut}
          >
            <View style={styles.menuItemLeft}>
              <LogOut color={palette.danger} size={22} />
              <Text style={[styles.menuItemLabel, styles.signOutLabel]}>
                Sign Out
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App version */}
        <Text style={styles.version}>Meet Without Fear v0.0.1</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    fontFamily: designFonts.sans,
  },
  profileEmail: {
    fontSize: 15,
    color: palette.textMuted,
    marginTop: 4,
    fontFamily: designFonts.sans,
  },
  menuSection: {
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.divider,
  },
  menuItemFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    fontSize: 17,
    color: palette.text,
    fontFamily: designFonts.sans,
  },
  signOutLabel: {
    color: palette.danger,
  },
  appearanceItem: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
    paddingVertical: 18,
  },
  appearanceControl: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: palette.chipBg,
    borderRadius: 14,
    padding: 5,
    width: '100%',
  },
  appearanceButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 8,
  },
  appearanceButtonSelected: {
    backgroundColor: palette.accent,
  },
  appearanceButtonText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: designFonts.sans,
  },
  appearanceButtonTextSelected: {
    color: palette.bg,
  },
  version: {
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: designFonts.sans,
  },
});
