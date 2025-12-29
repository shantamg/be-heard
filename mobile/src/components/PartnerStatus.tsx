/**
 * PartnerStatus Component
 *
 * Displays the partner's online/offline status and typing indicator.
 * Shows a presence dot and optional typing animation.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import { ConnectionStatus } from '@meet-without-fear/shared';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface PartnerStatusProps {
  /** Partner's name (optional, for display) */
  partnerName?: string;
  /** Whether the partner is currently online */
  isOnline: boolean;
  /** Whether the partner is currently typing */
  isTyping?: boolean;
  /** Current connection status to the server */
  connectionStatus?: ConnectionStatus;
  /** Custom style for the container */
  style?: ViewStyle;
  /** Whether to show the full status text or just the indicator */
  compact?: boolean;
  /** Whether to show typing indicator */
  showTyping?: boolean;
}

// ============================================================================
// Typing Dots Animation
// ============================================================================

interface TypingDotsProps {
  color?: string;
}

function TypingDots({ color = colors.textMuted }: TypingDotsProps) {
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDots = () => {
      const duration = 400;

      Animated.loop(
        Animated.sequence([
          // Dot 1 pulses
          Animated.timing(dot1Opacity, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot1Opacity, {
            toValue: 0.3,
            duration,
            useNativeDriver: true,
          }),
          // Dot 2 pulses
          Animated.timing(dot2Opacity, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Opacity, {
            toValue: 0.3,
            duration,
            useNativeDriver: true,
          }),
          // Dot 3 pulses
          Animated.timing(dot3Opacity, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Opacity, {
            toValue: 0.3,
            duration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateDots();
  }, [dot1Opacity, dot2Opacity, dot3Opacity]);

  return (
    <View style={styles.typingDots}>
      <Animated.View
        style={[styles.dot, { backgroundColor: color, opacity: dot1Opacity }]}
      />
      <Animated.View
        style={[styles.dot, { backgroundColor: color, opacity: dot2Opacity }]}
      />
      <Animated.View
        style={[styles.dot, { backgroundColor: color, opacity: dot3Opacity }]}
      />
    </View>
  );
}

// ============================================================================
// Status Indicator
// ============================================================================

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'connecting' | 'error';
  size?: number;
}

function StatusIndicator({ status, size = 8 }: StatusIndicatorProps) {
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
      default:
        return colors.textMuted;
    }
  };

  return (
    <View
      style={[
        styles.indicator,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: getColor(),
        },
      ]}
    />
  );
}

// ============================================================================
// PartnerStatus Component
// ============================================================================

export function PartnerStatus({
  partnerName,
  isOnline,
  isTyping = false,
  connectionStatus = ConnectionStatus.CONNECTED,
  style,
  compact = false,
  showTyping = true,
}: PartnerStatusProps) {
  // Determine the display status
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
    return isOnline ? 'online' : 'offline';
  };

  const displayStatus = getDisplayStatus();

  // Get status text
  const getStatusText = (): string => {
    if (isTyping && showTyping) {
      return 'typing...';
    }

    switch (displayStatus) {
      case 'online':
        return 'online';
      case 'offline':
        return 'offline';
      case 'connecting':
        return 'connecting...';
      case 'error':
        return 'connection error';
      default:
        return 'offline';
    }
  };

  // Compact mode - just the indicator
  if (compact) {
    return (
      <View style={[styles.compactContainer, style]}>
        <StatusIndicator status={displayStatus} size={6} />
        {isTyping && showTyping && <TypingDots color={colors.textMuted} />}
      </View>
    );
  }

  // Full mode - indicator with text
  return (
    <View style={[styles.container, style]}>
      <StatusIndicator status={displayStatus} />
      <View style={styles.textContainer}>
        {partnerName && (
          <Text style={styles.nameText} numberOfLines={1}>
            {partnerName}
          </Text>
        )}
        <View style={styles.statusRow}>
          {isTyping && showTyping ? (
            <>
              <Text style={styles.statusText}>typing</Text>
              <TypingDots color={colors.textMuted} />
            </>
          ) : (
            <Text
              style={[
                styles.statusText,
                displayStatus === 'online' && styles.onlineText,
                displayStatus === 'error' && styles.errorText,
              ]}
            >
              {getStatusText()}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Compact Variants
// ============================================================================

/**
 * A minimal partner status badge that shows just the online indicator.
 */
export function PartnerStatusBadge({
  isOnline,
  connectionStatus = ConnectionStatus.CONNECTED,
}: Pick<PartnerStatusProps, 'isOnline' | 'connectionStatus'>) {
  const getStatus = (): 'online' | 'offline' | 'connecting' | 'error' => {
    if (connectionStatus === ConnectionStatus.CONNECTING) return 'connecting';
    if (connectionStatus === ConnectionStatus.FAILED) return 'error';
    return isOnline ? 'online' : 'offline';
  };

  return (
    <View style={styles.badge} testID="partner-status-badge">
      <StatusIndicator status={getStatus()} size={10} />
    </View>
  );
}

/**
 * A typing indicator that appears inline with text.
 */
export function InlineTypingIndicator({
  partnerName,
  isTyping,
}: {
  partnerName?: string;
  isTyping: boolean;
}) {
  if (!isTyping) return null;

  return (
    <View style={styles.inlineTyping}>
      <Text style={styles.inlineTypingText}>
        {partnerName ? `${partnerName} is typing` : 'Partner is typing'}
      </Text>
      <TypingDots color={colors.textMuted} />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  indicator: {
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  onlineText: {
    color: colors.accent,
  },
  errorText: {
    color: colors.error,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  badge: {
    padding: 4,
    backgroundColor: colors.bgSecondary,
    borderRadius: 6,
  },
  inlineTyping: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
  },
  inlineTypingText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
