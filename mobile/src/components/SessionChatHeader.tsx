/**
 * SessionChatHeader Component
 *
 * A minimal, chat-centric header for session screens.
 * Shows partner info and online status - clean chat experience.
 * Designed to feel like a messaging app rather than a dashboard.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { ConnectionStatus } from '@be-heard/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface SessionChatHeaderProps {
  /** Partner's display name */
  partnerName?: string | null;
  /** Whether the partner is currently online */
  partnerOnline?: boolean;
  /** Whether the partner is currently typing */
  partnerTyping?: boolean;
  /** Connection status to the server */
  connectionStatus?: ConnectionStatus;
  /** Optional callback when header is pressed (e.g., to show session info) */
  onPress?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Animated typing indicator with three pulsing dots
 */
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.4)).current;
  const dot2 = useRef(new Animated.Value(0.4)).current;
  const dot3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const duration = 350;
    const delay = 150;

    const animation = Animated.loop(
      Animated.stagger(delay, [
        Animated.sequence([
          Animated.timing(dot1, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot1, {
            toValue: 0.4,
            duration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot2, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot2, {
            toValue: 0.4,
            duration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot3, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot3, {
            toValue: 0.4,
            duration,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const styles = useTypingStyles();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>typing</Text>
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { opacity: dot3 }]} />
      </View>
    </View>
  );
}

const useTypingStyles = () =>
  createStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    text: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
      marginRight: 4,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.colors.textMuted,
    },
  }));

/**
 * Online status indicator dot
 */
function StatusDot({
  status,
  size = 8,
}: {
  status: 'online' | 'offline' | 'connecting' | 'error';
  size?: number;
}) {
  const getColor = () => {
    switch (status) {
      case 'online':
        return colors.accent;
      case 'offline':
        return colors.textMuted;
      case 'connecting':
        return colors.warning;
      case 'error':
        return colors.error;
    }
  };

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: getColor(),
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
  partnerTyping = false,
  connectionStatus = ConnectionStatus.CONNECTED,
  onPress,
  style,
  testID = 'session-chat-header',
}: SessionChatHeaderProps) {
  const styles = useStyles();

  // Derive display status
  const getDisplayStatus = (): 'online' | 'offline' | 'connecting' | 'error' => {
    if (
      connectionStatus === ConnectionStatus.CONNECTING ||
      connectionStatus === ConnectionStatus.SUSPENDED
    ) {
      return 'connecting';
    }
    if (connectionStatus === ConnectionStatus.FAILED) {
      return 'error';
    }
    // If no partner (AI mode), always show as "online"
    if (!partnerName) {
      return 'online';
    }
    return partnerOnline ? 'online' : 'offline';
  };

  const displayStatus = getDisplayStatus();

  // Status text when not typing
  const getStatusText = (): string => {
    // For AI assistant, show "AI assistant" instead of online/offline
    if (!partnerName) {
      return 'AI assistant';
    }
    switch (displayStatus) {
      case 'online':
        return 'online';
      case 'offline':
        return 'offline';
      case 'connecting':
        return 'connecting...';
      case 'error':
        return 'connection lost';
    }
  };

  const displayName = partnerName || 'BeHeard';

  const content = (
    <View style={[styles.container, style]} testID={testID}>
      {/* Centered: Partner info */}
      <View style={styles.centerSection}>
        <View style={styles.nameRow}>
          <StatusDot status={displayStatus} />
          <Text
            style={styles.partnerName}
            numberOfLines={1}
            testID={`${testID}-partner-name`}
          >
            {displayName}
          </Text>
        </View>

        {/* Status line: either typing indicator or status text */}
        <View style={styles.statusRow}>
          {partnerTyping ? (
            <TypingIndicator />
          ) : (
            <Text
              style={[
                styles.statusText,
                displayStatus === 'online' && styles.statusOnline,
                displayStatus === 'error' && styles.statusError,
              ]}
              testID={`${testID}-status`}
            >
              {getStatusText()}
            </Text>
          )}
        </View>
      </View>
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
      justifyContent: 'center',
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      backgroundColor: t.colors.bgSecondary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      minHeight: 56,
    },
    centerSection: {
      alignItems: 'center',
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    partnerName: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    statusRow: {
      marginTop: 2,
      alignItems: 'center',
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
    },
    statusOnline: {
      color: t.colors.accent,
    },
    statusError: {
      color: t.colors.error,
    },
  }));

// ============================================================================
// Exports
// ============================================================================

export default SessionChatHeader;
