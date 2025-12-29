/**
 * EmotionSlider Component
 *
 * A mood/emotion barometer slider that lets users indicate their emotional state.
 * Based on the demo design at docs-site/static/demo/index.html.
 *
 * Features:
 * - Gradient slider from calm (green) to elevated (yellow) to intense (red)
 * - Labels: "Calm", "Elevated", "Intense"
 * - Triggers callback when emotion level is high (>= threshold)
 */

import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface EmotionSliderProps {
  /** Current emotion value (1-10) */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Callback when emotion reaches high threshold */
  onHighEmotion?: (value: number) => void;
  /** Threshold for triggering onHighEmotion (default: 9) */
  highThreshold?: number;
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function EmotionSlider({
  value,
  onChange,
  onHighEmotion,
  highThreshold = 9,
  disabled = false,
  testID = 'emotion-slider',
}: EmotionSliderProps) {
  const styles = useStyles();

  const handleValueChange = (newValue: number) => {
    const roundedValue = Math.round(newValue);
    onChange(roundedValue);

    // Trigger high emotion callback if threshold reached
    if (roundedValue >= highThreshold && onHighEmotion) {
      onHighEmotion(roundedValue);
    }
  };

  // Get color based on current value
  const getValueColor = () => {
    if (value <= 3) return colors.calm;
    if (value <= 6) return colors.elevated;
    return colors.intense;
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>How are you feeling?</Text>
        <Text style={[styles.value, { color: getValueColor() }]} testID={`${testID}-value`}>
          {value}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onValueChange={handleValueChange}
          minimumTrackTintColor={colors.calm}
          maximumTrackTintColor={colors.intense}
          thumbTintColor="#ffffff"
          disabled={disabled}
          testID={`${testID}-control`}
        />
      </View>

      <View style={styles.labels}>
        <Text style={styles.labelText}>Calm</Text>
        <Text style={styles.labelText}>Elevated</Text>
        <Text style={styles.labelText}>Intense</Text>
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
      backgroundColor: t.colors.bgSecondary,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.spacing.sm,
    },
    label: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
    value: {
      fontSize: t.typography.fontSize.md,
      fontWeight: '600',
    },
    sliderContainer: {
      marginVertical: t.spacing.xs,
    },
    slider: {
      width: '100%',
      height: 40,
    },
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: t.spacing.xs,
    },
    labelText: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
    },
  }));
