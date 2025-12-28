import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useBiometricAuth } from '../useBiometricAuth';
import * as api from '../../lib/api';

// Mock expo-local-authentication
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock API client
jest.mock('../../lib/api', () => ({
  patch: jest.fn(),
}));

const mockHasHardwareAsync = LocalAuthentication.hasHardwareAsync as jest.MockedFunction<
  typeof LocalAuthentication.hasHardwareAsync
>;
const mockIsEnrolledAsync = LocalAuthentication.isEnrolledAsync as jest.MockedFunction<
  typeof LocalAuthentication.isEnrolledAsync
>;
const mockSupportedAuthenticationTypesAsync =
  LocalAuthentication.supportedAuthenticationTypesAsync as jest.MockedFunction<
    typeof LocalAuthentication.supportedAuthenticationTypesAsync
  >;
const mockAuthenticateAsync = LocalAuthentication.authenticateAsync as jest.MockedFunction<
  typeof LocalAuthentication.authenticateAsync
>;

const mockGetItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const mockSetItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;

const mockPatch = api.patch as jest.MockedFunction<typeof api.patch>;

describe('useBiometricAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: biometrics available and enrolled
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue();
    mockDeleteItemAsync.mockResolvedValue();
    mockPatch.mockResolvedValue({ biometricEnabled: true });
  });

  describe('initial state', () => {
    it('starts with loading state', () => {
      const { result } = renderHook(() => useBiometricAuth());

      expect(result.current.isLoading).toBe(true);
    });

    it('checks availability on mount', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockHasHardwareAsync).toHaveBeenCalled();
      expect(mockIsEnrolledAsync).toHaveBeenCalled();
      expect(mockSupportedAuthenticationTypesAsync).toHaveBeenCalled();
    });

    it('sets isAvailable when hardware exists', async () => {
      mockHasHardwareAsync.mockResolvedValue(true);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(true);
    });

    it('sets isAvailable to false when no hardware', async () => {
      mockHasHardwareAsync.mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(false);
    });

    it('sets isEnrolled when biometrics are enrolled', async () => {
      mockIsEnrolledAsync.mockResolvedValue(true);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnrolled).toBe(true);
    });

    it('sets isEnrolled to false when not enrolled', async () => {
      mockIsEnrolledAsync.mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnrolled).toBe(false);
      expect(result.current.error).toBe('No biometrics enrolled on this device');
    });

    it('detects fingerprint biometric type', async () => {
      mockSupportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.biometricType).toBe('fingerprint');
    });

    it('detects face recognition biometric type', async () => {
      mockSupportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.biometricType).toBe('face');
    });

    it('loads isEnabled from SecureStore', async () => {
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'biometric_enabled') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnabled).toBe(true);
    });

    it('loads hasPrompted from SecureStore', async () => {
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'biometric_prompted') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPrompted).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('calls LocalAuthentication.authenticateAsync', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.authenticate();
      });

      expect(success).toBe(true);
      expect(mockAuthenticateAsync).toHaveBeenCalled();
    });

    it('returns false when authentication fails', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.authenticate();
      });

      expect(success).toBe(false);
    });

    it('sets error on lockout', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'lockout' });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.authenticate();
      });

      expect(result.current.error).toBe('Too many failed attempts. Please try again later.');
    });

    it('uses custom prompt message', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.authenticate('Custom prompt');
      });

      expect(mockAuthenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptMessage: 'Custom prompt',
        })
      );
    });
  });

  describe('enableBiometric', () => {
    it('authenticates before enabling', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.enableBiometric();
      });

      expect(mockAuthenticateAsync).toHaveBeenCalled();
    });

    it('stores preference in SecureStore', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.enableBiometric();
      });

      expect(mockSetItemAsync).toHaveBeenCalledWith('biometric_enabled', 'true');
    });

    it('syncs to backend', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.enableBiometric();
      });

      expect(mockPatch).toHaveBeenCalledWith('/auth/biometric', { enabled: true });
    });

    it('sets isEnabled to true on success', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);

      await act(async () => {
        await result.current.enableBiometric();
      });

      expect(result.current.isEnabled).toBe(true);
    });

    it('returns false if authentication fails', async () => {
      mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.enableBiometric();
      });

      expect(success).toBe(false);
      expect(result.current.isEnabled).toBe(false);
    });

    it('still enables if backend sync fails', async () => {
      mockPatch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.enableBiometric();
      });

      // Should still be enabled locally
      expect(result.current.isEnabled).toBe(true);
      expect(mockSetItemAsync).toHaveBeenCalledWith('biometric_enabled', 'true');
    });
  });

  describe('disableBiometric', () => {
    it('removes preference from SecureStore', async () => {
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'biometric_enabled') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.disableBiometric();
      });

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('biometric_enabled');
    });

    it('syncs to backend', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.disableBiometric();
      });

      expect(mockPatch).toHaveBeenCalledWith('/auth/biometric', { enabled: false });
    });

    it('sets isEnabled to false', async () => {
      mockGetItemAsync.mockImplementation((key) => {
        if (key === 'biometric_enabled') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isEnabled).toBe(true);
      });

      await act(async () => {
        await result.current.disableBiometric();
      });

      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe('markPrompted', () => {
    it('stores prompted flag in SecureStore', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markPrompted();
      });

      expect(mockSetItemAsync).toHaveBeenCalledWith('biometric_prompted', 'true');
    });

    it('sets hasPrompted to true', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasPrompted).toBe(false);

      await act(async () => {
        await result.current.markPrompted();
      });

      expect(result.current.hasPrompted).toBe(true);
    });
  });

  describe('refresh', () => {
    it('reloads all state', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear mock call counts
      jest.clearAllMocks();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockHasHardwareAsync).toHaveBeenCalled();
      expect(mockIsEnrolledAsync).toHaveBeenCalled();
      expect(mockGetItemAsync).toHaveBeenCalled();
    });
  });

  describe('checkAvailability', () => {
    it('returns true when biometrics are available and enrolled', async () => {
      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let available: boolean = false;
      await act(async () => {
        available = await result.current.checkAvailability();
      });

      expect(available).toBe(true);
    });

    it('returns false when no hardware', async () => {
      mockHasHardwareAsync.mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let available: boolean = true;
      await act(async () => {
        available = await result.current.checkAvailability();
      });

      expect(available).toBe(false);
    });

    it('returns false when not enrolled', async () => {
      mockIsEnrolledAsync.mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let available: boolean = true;
      await act(async () => {
        available = await result.current.checkAvailability();
      });

      expect(available).toBe(false);
    });
  });

  describe('error handling', () => {
    it('handles hardware check error gracefully', async () => {
      mockHasHardwareAsync.mockRejectedValue(new Error('Hardware check failed'));

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAvailable).toBe(false);
      expect(result.current.error).toBe('Hardware check failed');
    });

    it('handles authentication error gracefully', async () => {
      mockAuthenticateAsync.mockRejectedValue(new Error('Auth failed'));

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.authenticate();
      });

      expect(result.current.error).toBe('Auth failed');
    });
  });
});
