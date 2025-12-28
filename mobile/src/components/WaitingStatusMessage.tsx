/**
 * WaitingStatusMessage Component
 *
 * Displays waiting status as an inline chat-style message.
 * Used to notify users about partner progress without blocking the UI.
 */

import { View, Text, ActivityIndicator } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

export type WaitingStatusType =
  | 'compact-pending' // Stage 0: Waiting for partner to sign compact
  | 'witness-pending' // Stage 1: Waiting for partner to complete witness
  | 'empathy-pending' // Stage 2: Waiting for partner to share empathy
  | 'needs-pending' // Stage 3: Waiting for partner to confirm needs
  | 'ranking-pending' // Stage 4: Waiting for partner to submit ranking
  | 'partner-signed' // Partner has signed compact
  | 'partner-completed-witness' // Partner completed witness stage
  | 'partner-shared-empathy' // Partner shared their empathy attempt
  | 'partner-confirmed-needs'; // Partner confirmed their needs

export interface WaitingStatusMessageProps {
  type: WaitingStatusType;
  partnerName: string;
  testID?: string;
}

// ============================================================================
// Status Messages
// ============================================================================

const getStatusConfig = (
  type: WaitingStatusType,
  partnerName: string
): { message: string; isWaiting: boolean; icon: string } => {
  switch (type) {
    // Waiting states (show spinner)
    case 'compact-pending':
      return {
        message: `Waiting for ${partnerName} to sign the Curiosity Compact...`,
        isWaiting: true,
        icon: 'hourglass',
      };
    case 'witness-pending':
      return {
        message: `${partnerName} is still in their witness session. You can continue chatting with me in the meantime.`,
        isWaiting: true,
        icon: 'hourglass',
      };
    case 'empathy-pending':
      return {
        message: `Waiting for ${partnerName} to share their perspective on how you're feeling...`,
        isWaiting: true,
        icon: 'hourglass',
      };
    case 'needs-pending':
      return {
        message: `Waiting for ${partnerName} to confirm their needs. Keep chatting with me while you wait.`,
        isWaiting: true,
        icon: 'hourglass',
      };
    case 'ranking-pending':
      return {
        message: `Waiting for ${partnerName} to submit their strategy rankings...`,
        isWaiting: true,
        icon: 'hourglass',
      };

    // Completion states (show checkmark)
    case 'partner-signed':
      return {
        message: `${partnerName} has signed the Curiosity Compact! You can both now begin.`,
        isWaiting: false,
        icon: 'checkmark',
      };
    case 'partner-completed-witness':
      return {
        message: `${partnerName} has completed their witness session. They're ready to move forward when you are.`,
        isWaiting: false,
        icon: 'checkmark',
      };
    case 'partner-shared-empathy':
      return {
        message: `${partnerName} has shared their understanding of your perspective. I'll show you their attempt.`,
        isWaiting: false,
        icon: 'checkmark',
      };
    case 'partner-confirmed-needs':
      return {
        message: `${partnerName} has confirmed their needs. Let's see what you have in common.`,
        isWaiting: false,
        icon: 'checkmark',
      };

    default:
      return {
        message: `Waiting for ${partnerName}...`,
        isWaiting: true,
        icon: 'hourglass',
      };
  }
};

// ============================================================================
// Component
// ============================================================================

export function WaitingStatusMessage({
  type,
  partnerName,
  testID = 'waiting-status-message',
}: WaitingStatusMessageProps) {
  const styles = useStyles();
  const { message, isWaiting, icon } = getStatusConfig(type, partnerName);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.iconContainer}>
        {isWaiting ? (
          <ActivityIndicator
            size="small"
            color={styles.spinnerColor.color}
            testID={`${testID}-spinner`}
          />
        ) : (
          <Text style={styles.checkmark} testID={`${testID}-checkmark`}>
            {icon === 'checkmark' ? '\u2713' : '\u23F3'}
          </Text>
        )}
      </View>
      <View style={styles.messageContainer}>
        <Text style={styles.label}>
          {isWaiting ? 'Status Update' : 'Good News'}
        </Text>
        <Text style={styles.message}>{message}</Text>
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
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginHorizontal: t.spacing.lg,
      marginVertical: t.spacing.md,
      padding: t.spacing.md,
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accent,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: t.colors.bgSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: t.spacing.md,
    },
    spinnerColor: {
      color: t.colors.accent,
    },
    checkmark: {
      fontSize: 16,
      color: t.colors.success,
    },
    messageContainer: {
      flex: 1,
    },
    label: {
      fontSize: t.typography.fontSize.xs,
      fontWeight: '600',
      color: t.colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: t.spacing.xs,
    },
    message: {
      fontSize: t.typography.fontSize.sm,
      lineHeight: 20,
      color: t.colors.textSecondary,
    },
  }));

export default WaitingStatusMessage;
