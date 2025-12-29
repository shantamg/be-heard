/**
 * Toast Component for Meet Without Fear Mobile
 *
 * Animated in-app notification banner that slides down from top.
 */

import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastProps {
  /** Toast title */
  title: string;
  /** Optional body text */
  body?: string;
  /** Optional action button */
  action?: ToastAction;
  /** Called when toast is dismissed */
  onDismiss: () => void;
  /** Duration in milliseconds before auto-dismiss (default: 6000) */
  duration?: number;
  /** Toast variant for styling */
  variant?: 'default' | 'success' | 'error' | 'warning';
}

// ============================================================================
// Component
// ============================================================================

/**
 * Toast notification component.
 *
 * Slides in from the top of the screen and auto-dismisses after a set duration.
 *
 * @example
 * ```tsx
 * <Toast
 *   title="Session Invite"
 *   body="John invited you to a session"
 *   action={{ label: "View", onPress: () => router.push('/session/123') }}
 *   onDismiss={() => setShowToast(false)}
 * />
 * ```
 */
export function Toast({
  title,
  body,
  action,
  onDismiss,
  duration = 6000,
  variant = 'default',
}: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in with spring animation
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const handleActionPress = () => {
    action?.onPress();
    dismiss();
  };

  const variantStyles = getVariantStyles(variant);

  return (
    <Animated.View
      style={[
        styles.container,
        variantStyles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      testID="toast-container"
    >
      <View style={styles.content}>
        <Text style={[styles.title, variantStyles.title]} numberOfLines={1}>
          {title}
        </Text>
        {body && (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>

      {action && (
        <TouchableOpacity
          style={[styles.actionButton, variantStyles.actionButton]}
          onPress={handleActionPress}
          testID="toast-action"
        >
          <Text style={[styles.actionText, variantStyles.actionText]}>{action.label}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.closeButton}
        onPress={dismiss}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        testID="toast-close"
      >
        <X color={colors.textSecondary} size={20} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Variant Styles
// ============================================================================

function getVariantStyles(variant: ToastProps['variant']) {
  switch (variant) {
    case 'success':
      return {
        container: { borderLeftColor: colors.accent, borderLeftWidth: 4 },
        title: { color: colors.accent },
        actionButton: { backgroundColor: colors.accent },
        actionText: { color: colors.textPrimary },
      };
    case 'error':
      return {
        container: { borderLeftColor: colors.error, borderLeftWidth: 4 },
        title: { color: colors.error },
        actionButton: { backgroundColor: colors.error },
        actionText: { color: colors.textPrimary },
      };
    case 'warning':
      return {
        container: { borderLeftColor: colors.warning, borderLeftWidth: 4 },
        title: { color: colors.warning },
        actionButton: { backgroundColor: colors.warning },
        actionText: { color: colors.textPrimary },
      };
    default:
      return {
        container: {},
        title: {},
        actionButton: {},
        actionText: {},
      };
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 6,
    marginRight: 8,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
});
