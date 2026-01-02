/**
 * ChatIndicator Component
 *
 * Displays inline indicators/dividers in the chat.
 * Used for things like "Invitation Sent" markers.
 */

import { View, Text } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

export type ChatIndicatorType = 'invitation-sent' | 'stage-transition' | 'session-start' | 'feel-heard';

interface ChatIndicatorProps {
  type: ChatIndicatorType;
  timestamp?: string;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({ type, timestamp, testID }: ChatIndicatorProps) {
  const styles = useStyles();

  const getIndicatorText = (): string => {
    switch (type) {
      case 'invitation-sent':
        return 'Invitation Sent';
      case 'stage-transition':
        return 'Moving Forward';
      case 'session-start':
        return 'Session Started';
      case 'feel-heard':
        return 'Fully Heard';
      default:
        return '';
    }
  };

  const getLineStyle = () => {
    switch (type) {
      case 'invitation-sent':
        return styles.invitationSentLine;
      case 'feel-heard':
        return styles.feelHeardLine;
      default:
        return styles.defaultLine;
    }
  };

  const getTextStyle = () => {
    switch (type) {
      case 'invitation-sent':
        return styles.invitationSentText;
      case 'feel-heard':
        return styles.feelHeardText;
      default:
        return styles.defaultText;
    }
  };

  return (
    <View style={styles.container} testID={testID || `chat-indicator-${type}`}>
      <View style={styles.lineContainer}>
        <View style={[styles.line, getLineStyle()]} />
        <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
        <View style={[styles.line, getLineStyle()]} />
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    lineContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: t.colors.border,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    // Invitation sent: yellow/amber tint - separate line and text styles
    invitationSentLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    invitationSentText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Feel heard: teal/green tint for completion feeling
    feelHeardLine: {
      backgroundColor: 'rgba(20, 184, 166, 0.3)',
    },
    feelHeardText: {
      color: 'rgba(20, 184, 166, 0.9)',
    },
    defaultLine: {
      backgroundColor: t.colors.border,
    },
    defaultText: {
      color: t.colors.textMuted,
    },
  }));
