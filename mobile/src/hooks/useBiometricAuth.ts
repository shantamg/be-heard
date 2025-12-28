/**
 * Biometric Authentication Hook
 *
 * Provides biometric authentication support (Face ID, Touch ID, Fingerprint)
 * with local preference storage and backend synchronization.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { patch } from '../lib/api';

// ============================================================================
// Constants
// ============================================================================

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_PROMPTED_KEY = 'biometric_prompted';

// ============================================================================
// Types
// ============================================================================

export interface BiometricAuthState {
  /** Whether the device supports biometrics */
  isAvailable: boolean;
  /** Whether biometrics are enrolled on the device */
  isEnrolled: boolean;
  /** Whether the user has enabled biometric auth for the app */
  isEnabled: boolean;
  /** Whether we're currently loading state */
  isLoading: boolean;
  /** The type of biometric available (Face ID, Touch ID, Fingerprint) */
  biometricType: 'face' | 'fingerprint' | 'iris' | null;
  /** Human-readable name for the biometric type */
  biometricName: string | null;
  /** Whether the user has been shown the opt-in prompt */
  hasPrompted: boolean;
  /** Any error that occurred */
  error: string | null;
}

export interface BiometricAuthActions {
  /** Check if biometrics are available on this device */
  checkAvailability: () => Promise<boolean>;
  /** Prompt for biometric authentication */
  authenticate: (promptMessage?: string) => Promise<boolean>;
  /** Enable biometric auth for this app */
  enableBiometric: () => Promise<boolean>;
  /** Disable biometric auth for this app */
  disableBiometric: () => Promise<void>;
  /** Mark that the user has been shown the opt-in prompt */
  markPrompted: () => Promise<void>;
  /** Refresh the current state */
  refresh: () => Promise<void>;
}

export type UseBiometricAuthReturn = BiometricAuthState & BiometricAuthActions;

// ============================================================================
// Response Types (for backend sync)
// ============================================================================

interface UpdateBiometricPreferenceResponse {
  biometricEnabled: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a human-readable name for the biometric type
 */
function getBiometricName(
  types: LocalAuthentication.AuthenticationType[]
): { type: BiometricAuthState['biometricType']; name: string } | null {
  if (types.length === 0) {
    return null;
  }

  // Prioritize Face ID / Facial Recognition
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return {
      type: 'face',
      name: Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition',
    };
  }

  // Then Fingerprint / Touch ID
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return {
      type: 'fingerprint',
      name: Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint',
    };
  }

  // Iris (Android only)
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return {
      type: 'iris',
      name: 'Iris Recognition',
    };
  }

  return null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useBiometricAuth(): UseBiometricAuthReturn {
  const [state, setState] = useState<BiometricAuthState>({
    isAvailable: false,
    isEnrolled: false,
    isEnabled: false,
    isLoading: true,
    biometricType: null,
    biometricName: null,
    hasPrompted: false,
    error: null,
  });

  // ============================================================================
  // Check Availability
  // ============================================================================

  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      // Check if device has biometric hardware
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        setState((prev) => ({
          ...prev,
          isAvailable: false,
          isEnrolled: false,
          biometricType: null,
          biometricName: null,
          error: null,
        }));
        return false;
      }

      // Check if biometrics are enrolled
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // Get the types of biometrics available
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const biometricInfo = getBiometricName(supportedTypes);

      setState((prev) => ({
        ...prev,
        isAvailable: true,
        isEnrolled,
        biometricType: biometricInfo?.type ?? null,
        biometricName: biometricInfo?.name ?? null,
        error: isEnrolled ? null : 'No biometrics enrolled on this device',
      }));

      return isEnrolled;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check biometric availability';
      setState((prev) => ({
        ...prev,
        isAvailable: false,
        isEnrolled: false,
        error: message,
      }));
      return false;
    }
  }, []);

  // ============================================================================
  // Authenticate
  // ============================================================================

  const authenticate = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: promptMessage ?? `Authenticate with ${state.biometricName ?? 'biometrics'}`,
          fallbackLabel: 'Use passcode',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });

        if (result.success) {
          return true;
        }

        // Handle specific error cases
        if (result.error === 'user_cancel') {
          setState((prev) => ({ ...prev, error: null }));
        } else if (result.error === 'user_fallback') {
          // User chose to use passcode - this is still a form of auth
          setState((prev) => ({ ...prev, error: null }));
        } else if (result.error === 'lockout') {
          setState((prev) => ({
            ...prev,
            error: 'Too many failed attempts. Please try again later.',
          }));
        } else if (result.error === 'not_enrolled') {
          setState((prev) => ({
            ...prev,
            isEnrolled: false,
            error: 'No biometrics enrolled on this device',
          }));
        } else {
          setState((prev) => ({
            ...prev,
            error: result.error ?? 'Authentication failed',
          }));
        }

        return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        setState((prev) => ({ ...prev, error: message }));
        return false;
      }
    },
    [state.biometricName]
  );

  // ============================================================================
  // Enable Biometric
  // ============================================================================

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // First verify the user can authenticate
      const authSuccess = await authenticate('Verify your identity to enable biometric login');

      if (!authSuccess) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return false;
      }

      // Store preference locally
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');

      // Sync to backend (fire and forget - local state is source of truth)
      try {
        await patch<UpdateBiometricPreferenceResponse>('/auth/biometric', {
          enabled: true,
        });
      } catch (backendError) {
        // Log but don't fail - local preference is the source of truth
        console.warn('Failed to sync biometric preference to backend:', backendError);
      }

      setState((prev) => ({
        ...prev,
        isEnabled: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable biometric auth';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      return false;
    }
  }, [authenticate]);

  // ============================================================================
  // Disable Biometric
  // ============================================================================

  const disableBiometric = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Remove local preference
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);

      // Sync to backend (fire and forget)
      try {
        await patch<UpdateBiometricPreferenceResponse>('/auth/biometric', {
          enabled: false,
        });
      } catch (backendError) {
        console.warn('Failed to sync biometric preference to backend:', backendError);
      }

      setState((prev) => ({
        ...prev,
        isEnabled: false,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disable biometric auth';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, []);

  // ============================================================================
  // Mark Prompted
  // ============================================================================

  const markPrompted = useCallback(async (): Promise<void> => {
    try {
      await SecureStore.setItemAsync(BIOMETRIC_PROMPTED_KEY, 'true');
      setState((prev) => ({ ...prev, hasPrompted: true }));
    } catch (error) {
      console.warn('Failed to mark biometric prompted:', error);
    }
  }, []);

  // ============================================================================
  // Refresh State
  // ============================================================================

  const refresh = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Check availability
      await checkAvailability();

      // Load local preferences
      const [enabledValue, promptedValue] = await Promise.all([
        SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
        SecureStore.getItemAsync(BIOMETRIC_PROMPTED_KEY),
      ]);

      setState((prev) => ({
        ...prev,
        isEnabled: enabledValue === 'true',
        hasPrompted: promptedValue === 'true',
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load biometric state';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, [checkAvailability]);

  // ============================================================================
  // Initialize on Mount
  // ============================================================================

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ============================================================================
  // Return State and Actions
  // ============================================================================

  return {
    // State
    isAvailable: state.isAvailable,
    isEnrolled: state.isEnrolled,
    isEnabled: state.isEnabled,
    isLoading: state.isLoading,
    biometricType: state.biometricType,
    biometricName: state.biometricName,
    hasPrompted: state.hasPrompted,
    error: state.error,
    // Actions
    checkAvailability,
    authenticate,
    enableBiometric,
    disableBiometric,
    markPrompted,
    refresh,
  };
}
