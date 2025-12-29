/**
 * CurrentSessionCard Component
 *
 * Displays the current active session card with stage, status, and continue action.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Stage, STAGE_NAMES } from '@meet-without-fear/shared';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export type SessionStatusType = 'waiting_on_you' | 'your_turn' | 'waiting_on_partner' | 'both_active';

interface CurrentSessionCardProps {
  /** Session ID for navigation */
  sessionId: string;
  /** Current stage of the session */
  stage: Stage;
  /** Current session status */
  status: SessionStatusType;
  /** Partner's name for status messages */
  partnerName: string;
  /** Time since last update (e.g., "2h ago") */
  lastUpdate: string;
}

// Status text mapping
const STATUS_TEXT: Record<SessionStatusType, string> = {
  waiting_on_you: 'Waiting on you',
  your_turn: 'Ready to continue',
  waiting_on_partner: 'Waiting for',
  both_active: 'Both working on',
};

// ============================================================================
// Component
// ============================================================================

/**
 * CurrentSessionCard displays the active session with this person.
 *
 * Features:
 * - Current stage name and number
 * - Status message based on who is waiting
 * - Continue Session button to navigate to session
 */
export function CurrentSessionCard({
  sessionId,
  stage,
  status,
  partnerName,
  lastUpdate,
}: CurrentSessionCardProps) {
  const router = useRouter();

  const handleContinue = () => {
    router.push(`/session/${sessionId}`);
  };

  const getStatusMessage = (): string => {
    switch (status) {
      case 'waiting_on_partner':
        return `Waiting for ${partnerName} - ${lastUpdate}`;
      case 'both_active':
        return `Both working on ${STAGE_NAMES[stage]}`;
      case 'waiting_on_you':
      case 'your_turn':
      default:
        return `${STATUS_TEXT[status]} - ${lastUpdate}`;
    }
  };

  return (
    <View style={styles.container} testID="current-session-card">
      <Text style={styles.stageLabel}>{STAGE_NAMES[stage]}</Text>
      <Text style={styles.status}>{getStatusMessage()}</Text>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={handleContinue}
        accessibilityRole="button"
        accessibilityLabel="Continue session"
      >
        <Text style={styles.continueText}>Continue Session</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  stageLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  continueButton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CurrentSessionCard;
