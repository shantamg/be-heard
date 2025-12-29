import { View, Text } from 'react-native';
import { MessageRole } from '@be-heard/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatBubbleMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  isIntervention?: boolean;
  status?: MessageDeliveryStatus;
}

interface ChatBubbleProps {
  message: ChatBubbleMessage;
  showTimestamp?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({ message, showTimestamp = false }: ChatBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isIntervention = message.isIntervention ?? false;

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusText = (status: MessageDeliveryStatus): string => {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
    }
  };

  // Determine container alignment
  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    return styles.aiContainer;
  };

  // Determine bubble style
  const getBubbleStyle = () => {
    if (isIntervention) return styles.interventionBubble;
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    return styles.aiBubble;
  };

  // Determine text style
  const getTextStyle = () => {
    if (isSystem && !isIntervention) return styles.systemText;
    return styles.text;
  };

  // AI messages get full width container
  const isAI = !isUser && !isSystem;

  return (
    <View
      style={[styles.container, getContainerStyle()]}
      testID={`chat-bubble-${message.id}`}
    >
      <View style={[styles.bubble, isAI && styles.aiBubbleContainer, getBubbleStyle()]}>
        <Text style={getTextStyle()}>{message.content}</Text>
      </View>
      <View style={styles.metaContainer}>
        {showTimestamp && (
          <Text style={[styles.time, isSystem && styles.systemTime]}>
            {formatTime(message.timestamp)}
          </Text>
        )}
        {isUser && message.status && (
          <Text
            style={[
              styles.statusText,
              message.status === 'sending' && styles.statusSending,
              message.status === 'read' && styles.statusRead,
            ]}
          >
            {getStatusText(message.status)}
          </Text>
        )}
      </View>
    </View>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.lg,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    aiContainer: {
      alignItems: 'flex-start',
    },
    systemContainer: {
      alignItems: 'center',
    },
    bubble: {
      maxWidth: '85%',
    },
    // AI messages should be full width
    aiBubbleContainer: {
      maxWidth: '100%',
    },
    // User messages: bgSecondary background, 16px border-radius
    userBubble: {
      backgroundColor: colors.bgSecondary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 16,
    },
    // AI messages: full-width, no bubble background (like demo)
    aiBubble: {
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: 0,
      borderRadius: 0,
    },
    // System messages: bgTertiary background, 12px border-radius, centered
    systemBubble: {
      backgroundColor: colors.bgTertiary,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderRadius: 12,
    },
    // Intervention messages: warning background with left border
    interventionBubble: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
    text: {
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: colors.textPrimary,
      fontFamily: t.typography.fontFamily.regular,
    },
    systemText: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: colors.textSecondary,
      fontFamily: t.typography.fontFamily.regular,
      textAlign: 'center',
    },
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    time: {
      fontSize: t.typography.fontSize.sm,
      color: colors.textSecondary,
    },
    systemTime: {
      textAlign: 'center',
    },
    statusText: {
      fontSize: t.typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: t.typography.fontFamily.regular,
    },
    statusSending: {
      fontStyle: 'italic',
    },
    statusRead: {
      color: colors.accent,
    },
  }));
