/**
 * SimpleChatHeader Component
 *
 * A minimal header for the chat screen showing just:
 * - Person's name (or "Meet Without Fear" for solo sessions)
 * - A simple status word (e.g., "Listening", "Stage 1")
 *
 * Design based on demo: simple, unobtrusive, doesn't take focus from conversation.
 */

import { View, Text } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface SimpleChatHeaderProps {
  /** Name of the person in the session (e.g., "Jordan") */
  personName?: string;
  /** Simple status word (e.g., "Listening", "Stage 1", "Waiting") */
  status?: string;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SimpleChatHeader({
  personName = 'Meet Without Fear',
  status,
  testID = 'simple-chat-header',
}: SimpleChatHeaderProps) {
  const styles = useStyles();

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.personName} testID={`${testID}-name`}>
        {personName}
      </Text>
      {status && (
        <Text style={styles.status} testID={`${testID}-status`}>
          {status}
        </Text>
      )}
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.bgSecondary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    personName: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    status: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
  }));
