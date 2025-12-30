/**
 * SessionChatHeader Component
 *
 * A minimal, chat-centric header for session screens.
 * Layout: nickname with online/offline indicator on left, brief status on right.
 * No spinners - just clean, simple status display.
 * Designed to feel like a messaging app rather than a dashboard.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { ConnectionStatus } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface SessionChatHeaderProps {
  /** Partner's display name (nickname) */
  partnerName?: string | null;
  /** Whether the partner is currently online */
  partnerOnline?: boolean;
  /** Whether the partner is currently typing (ignored - no typing indicator in header) */
  partnerTyping?: boolean;
  /** Connection status to the server */
  connectionStatus?: ConnectionStatus;
  /** Brief status text to show on the right (e.g., "invited", "active", etc.) */
  briefStatus?: string;
  /** Hide the online/offline status row (e.g., during invitation crafting before partner exists) */
  hideOnlineStatus?: boolean;
  /** Optional callback when header is pressed (e.g., to show session info) */
  onPress?: () => void;
  /** Optional callback when brief status is pressed (e.g., to show invitation options) */
  onBriefStatusPress?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Simple online/offline status indicator dot
 */
function StatusDot({
  isOnline,
  size = 8,
}: {
  isOnline: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isOnline ? colors.accent : colors.textMuted,
      }}
      testID="status-dot"
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SessionChatHeader({
  partnerName,
  partnerOnline = false,
  partnerTyping: _partnerTyping = false, // Ignored - no typing indicator in header
  connectionStatus = ConnectionStatus.CONNECTED,
  briefStatus,
  hideOnlineStatus = false,
  onPress,
  onBriefStatusPress,
  style,
  testID = 'session-chat-header',
}: SessionChatHeaderProps) {
  const styles = useStyles();

  // Determine if partner is effectively online
  // If no partner (AI mode), always show as "online"
  const isOnline = !partnerName
    ? true
    : connectionStatus === ConnectionStatus.CONNECTED && partnerOnline;

  // Get the online/offline text
  const getOnlineText = (): string => {
    if (!partnerName) {
      return 'online'; // AI is always online
    }
    return isOnline ? 'online' : 'offline';
  };

  const displayName = partnerName || 'Meet Without Fear';

  const content = (
    <View style={[styles.container, style]} testID={testID}>
      {/* Left section: nickname with online/offline indicator below */}
      <View style={styles.leftSection}>
        <Text
          style={styles.partnerName}
          numberOfLines={1}
          testID={`${testID}-partner-name`}
        >
          {displayName}
        </Text>
        {!hideOnlineStatus && (
          <View style={styles.statusRow}>
            <StatusDot isOnline={isOnline} />
            <Text
              style={[styles.onlineText, isOnline && styles.onlineTextActive]}
              testID={`${testID}-online-status`}
            >
              {getOnlineText()}
            </Text>
          </View>
        )}
      </View>

      {/* Right section: brief status (invited, active, etc.) */}
      {briefStatus && (
        onBriefStatusPress ? (
          <TouchableOpacity
            style={styles.briefStatusPill}
            onPress={onBriefStatusPress}
            activeOpacity={0.6}
            testID={`${testID}-brief-status-touchable`}
          >
            <Text
              style={styles.briefStatusText}
              numberOfLines={1}
              testID={`${testID}-brief-status`}
            >
              {briefStatus}
            </Text>
            <Text style={styles.briefStatusChevron}>›</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rightSection}>
            <Text
              style={styles.briefStatus}
              numberOfLines={1}
              testID={`${testID}-brief-status`}
            >
              {briefStatus}
            </Text>
          </View>
        )
      )}
    </View>
  );

  // Wrap in TouchableOpacity if onPress is provided
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        testID={`${testID}-touchable`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      backgroundColor: t.colors.bgSecondary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      minHeight: 48,
    },
    leftSection: {
      flex: 1,
    },
    rightSection: {
      marginLeft: t.spacing.sm,
    },
    partnerName: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    onlineText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textMuted,
    },
    onlineTextActive: {
      color: t.colors.accent,
    },
    briefStatus: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
      fontStyle: 'italic',
    },
    // Tappable pill style for brief status when it has an onPress handler
    briefStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.sm,
      paddingVertical: t.spacing.xs,
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      gap: 4,
    },
    briefStatusText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
    briefStatusChevron: {
      fontSize: 14,
      color: t.colors.textMuted,
      fontWeight: '600',
    },
  }));

// ============================================================================
// Exports
// ============================================================================

export default SessionChatHeader;
