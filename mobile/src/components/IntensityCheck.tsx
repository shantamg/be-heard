/**
 * IntensityCheck Component
 *
 * A reusable component for checking emotional intensity after exercises.
 * Uses the same slider style as EmotionalBarometer for consistency.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useCallback } from 'react';
import { colors } from '@/theme';

/**
 * Get interpolated color between green and red based on value (1-10)
 * Matches the EmotionalBarometer gradient
 */
function getGradientColor(value: number): string {
  const t = (value - 1) / 9;

  if (t <= 0.5) {
    // Calm (#10a37f) to Elevated (#f59e0b)
    const localT = t * 2;
    const r = Math.round(16 + (245 - 16) * localT);
    const g = Math.round(163 + (158 - 163) * localT);
    const b = Math.round(127 + (11 - 127) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Elevated (#f59e0b) to Intense (#ef4444)
    const localT = (t - 0.5) * 2;
    const r = Math.round(245 + (239 - 245) * localT);
    const g = Math.round(158 + (68 - 158) * localT);
    const b = Math.round(11 + (68 - 11) * localT);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Get intensity label for a value
 */
function getIntensityLabel(value: number): string {
  if (value <= 4) return 'Calm';
  if (value <= 7) return 'Elevated';
  return 'Intense';
}

export interface IntensityCheckProps {
  /** Current intensity value (1-10) */
  value: number;
  /** Callback when intensity changes */
  onChange: (value: number) => void;
  /** Callback when user confirms and is done */
  onDone: () => void;
  /** Label for the done button */
  doneButtonLabel?: string;
}

/**
 * IntensityCheck - Post-exercise intensity check component
 *
 * Displays a slider matching the EmotionalBarometer style for users
 * to rate how they're feeling after completing an exercise.
 */
export function IntensityCheck({
  value,
  onChange,
  onDone,
  doneButtonLabel = 'Back to chat',
}: IntensityCheckProps) {
  const currentColor = getGradientColor(value);
  const currentLabel = getIntensityLabel(value);

  const handleValueChange = useCallback(
    (newValue: number) => {
      onChange(Math.round(newValue));
    },
    [onChange]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How are you feeling now?</Text>

      <View style={styles.currentContainer}>
        <Text style={[styles.currentValue, { color: currentColor }]}>
          {value} - {currentLabel}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          testID="intensity-slider"
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onValueChange={handleValueChange}
          minimumTrackTintColor={currentColor}
          maximumTrackTintColor={colors.bgTertiary}
          thumbTintColor={currentColor}
        />

        <View style={styles.labels}>
          <Text style={styles.scaleLabel}>Calm</Text>
          <Text style={styles.scaleLabel}>Elevated</Text>
          <Text style={styles.scaleLabel}>Intense</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.doneButton}
        onPress={onDone}
        testID="done-button"
      >
        <Text style={styles.doneButtonText}>{doneButtonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  currentContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  currentValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  sliderContainer: {
    width: '100%',
    marginBottom: 40,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  scaleLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  doneButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 12,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default IntensityCheck;
