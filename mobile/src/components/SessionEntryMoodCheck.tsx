/**
 * SessionEntryMoodCheck Component
 *
 * A modal that appears when entering a chat session to capture the user's
 * current emotional state. This ensures the emotional barometer reflects
 * how the user is actually feeling at the start of the conversation.
 *
 * Uses the same slider style as IntensityCheck for consistency.
 */

import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Slider from '@react-native-community/slider';
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

export interface SessionEntryMoodCheckProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Initial slider value (defaults to 5) */
  initialValue?: number;
  /** Callback when user completes the check */
  onComplete: (intensity: number) => void;
}

/**
 * SessionEntryMoodCheck - Modal for checking emotional state on session entry
 *
 * Displays a full-screen modal with a slider for users to indicate how they're
 * feeling before starting or resuming a chat conversation.
 */
export function SessionEntryMoodCheck({
  visible,
  initialValue = 5,
  onComplete,
}: SessionEntryMoodCheckProps) {
  const [value, setValue] = useState(initialValue);
  const currentColor = getGradientColor(value);
  const currentLabel = getIntensityLabel(value);

  const handleValueChange = useCallback((newValue: number) => {
    setValue(Math.round(newValue));
  }, []);

  const handleContinue = useCallback(() => {
    onComplete(value);
  }, [onComplete, value]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent
      testID="session-entry-mood-check-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>How are you feeling right now?</Text>

          <View style={styles.currentContainer}>
            <Text style={[styles.currentValue, { color: currentColor }]}>
              {value} - {currentLabel}
            </Text>
          </View>

          <View style={styles.sliderContainer}>
            <Slider
              testID="mood-check-slider"
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
            style={styles.continueButton}
            onPress={handleContinue}
            testID="mood-check-continue-button"
          >
            <Text style={styles.continueButtonText}>Continue to chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
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
    marginBottom: 32,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  scaleLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  continueButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default SessionEntryMoodCheck;
