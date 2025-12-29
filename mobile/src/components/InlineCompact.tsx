/**
 * InlineCompact Component
 *
 * An inline version of the Curiosity Compact for embedding in the chat interface.
 * Styled to match the demo at docs-site/static/demo/index.html.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface InlineCompactProps {
  /** Callback when compact is signed */
  onSign: () => void;
  /** Whether signing is in progress */
  isPending?: boolean;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Compact Terms
// ============================================================================

const COMPACT_TERMS = [
  'Approach this process with curiosity rather than certainty',
  'Allow the AI to guide the pace of our work together',
  'Share honestly within my private space',
  'Consider the other perspective when presented',
  'Focus on understanding needs rather than winning',
  'Take breaks when emotions run high',
];

// ============================================================================
// Component
// ============================================================================

export function InlineCompact({
  onSign,
  isPending = false,
  testID = 'inline-compact',
}: InlineCompactProps) {
  const styles = useStyles();
  const [agreed, setAgreed] = useState(false);

  const handleSign = () => {
    if (agreed && !isPending) {
      onSign();
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title}>The Curiosity Compact</Text>

      <View style={styles.termsContainer}>
        {COMPACT_TERMS.map((term, index) => (
          <View key={index} style={styles.termRow}>
            <Text style={styles.termBullet}>{'>'}</Text>
            <Text style={styles.termText}>{term}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        testID={`${testID}-checkbox`}
        style={styles.agreeRow}
        onPress={() => setAgreed(!agreed)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Text style={styles.checkmark}>&#10003;</Text>}
        </View>
        <Text style={styles.agreeLabel}>
          I commit to approaching this with curiosity
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID={`${testID}-sign-button`}
        style={[styles.signButton, !agreed && styles.signButtonDisabled]}
        onPress={handleSign}
        disabled={!agreed || isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: !agreed || isPending }}
      >
        <Text style={styles.signButtonText}>
          {isPending ? 'Signing...' : 'Sign and Begin'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      backgroundColor: t.colors.bgSecondary,
      borderRadius: t.radius.lg,
      padding: t.spacing.xl,
      marginVertical: t.spacing.md,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    title: {
      fontSize: t.typography.fontSize.xl,
      fontWeight: '600',
      color: t.colors.textPrimary,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    termsContainer: {
      marginBottom: t.spacing.lg,
    },
    termRow: {
      flexDirection: 'row',
      paddingVertical: t.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    termBullet: {
      color: colors.accent,
      fontWeight: 'bold',
      marginRight: t.spacing.md,
      fontSize: t.typography.fontSize.md,
    },
    termText: {
      flex: 1,
      fontSize: t.typography.fontSize.md,
      lineHeight: 22,
      color: t.colors.textPrimary,
    },
    agreeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgTertiary,
      borderRadius: t.radius.sm,
      padding: t.spacing.md,
      marginBottom: t.spacing.lg,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: t.radius.sm,
      borderWidth: 2,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: t.spacing.md,
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkmark: {
      color: 'white',
      fontSize: 14,
      fontWeight: 'bold',
    },
    agreeLabel: {
      flex: 1,
      fontSize: t.typography.fontSize.md,
      color: t.colors.textPrimary,
    },
    signButton: {
      backgroundColor: colors.accent,
      paddingVertical: t.spacing.lg,
      paddingHorizontal: t.spacing.xl,
      borderRadius: t.radius.sm,
      alignItems: 'center',
    },
    signButtonDisabled: {
      backgroundColor: t.colors.bgTertiary,
    },
    signButtonText: {
      color: 'white',
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
    },
  }));
