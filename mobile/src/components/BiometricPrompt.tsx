/**
 * BiometricPrompt Component
 *
 * Modal prompt shown after first login/signup to offer biometric authentication.
 * Supports Face ID, Touch ID, and Fingerprint based on device capabilities.
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { colors } from '@/src/theme';
import { useBiometricAuth } from '@/src/hooks';

// ============================================================================
// Types
// ============================================================================

interface BiometricPromptProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the user dismisses the modal (either choice) */
  onDismiss: () => void;
  /** Called after successfully enabling biometrics */
  onEnabled?: () => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function BiometricPrompt({
  visible,
  onDismiss,
  onEnabled,
  testID,
}: BiometricPromptProps) {
  const { biometricName, biometricType, enableBiometric, markPrompted, isLoading } =
    useBiometricAuth();

  const handleEnable = async () => {
    const success = await enableBiometric();
    await markPrompted();
    if (success) {
      onEnabled?.();
    }
    onDismiss();
  };

  const handleSkip = async () => {
    await markPrompted();
    onDismiss();
  };

  // Get the appropriate icon based on biometric type
  const BiometricIcon = biometricType === 'face' ? ScanFace : Fingerprint;
  const iconSize = 64;

  // Get platform-specific text
  const title = biometricName
    ? `Enable ${biometricName}?`
    : Platform.OS === 'ios'
      ? 'Enable Face ID or Touch ID?'
      : 'Enable Biometric Login?';

  const description = biometricName
    ? `Sign in quickly and securely using ${biometricName} instead of entering your password each time.`
    : 'Sign in quickly and securely using biometrics instead of entering your password each time.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      testID={testID}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <BiometricIcon size={iconSize} color={colors.accent} strokeWidth={1.5} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Description */}
          <Text style={styles.description}>{description}</Text>

          {/* Benefits */}
          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitItem}>• Quick access with just a glance or touch</Text>
            <Text style={styles.benefitItem}>• Your biometric data stays on your device</Text>
            <Text style={styles.benefitItem}>• You can change this anytime in settings</Text>
          </View>

          {/* Primary Button - Enable */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleEnable}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={`Enable ${biometricName || 'biometric login'}`}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Enabling...' : `Enable ${biometricName || 'Biometrics'}`}
            </Text>
          </TouchableOpacity>

          {/* Secondary Button - Skip */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSkip}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            <Text style={styles.secondaryButtonText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  benefitsContainer: {
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  benefitItem: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
    lineHeight: 18,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default BiometricPrompt;
