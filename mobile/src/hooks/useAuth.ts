import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../lib/api';
import type { ApiResponse, GetMeResponse, UserDTO } from '@be-heard/shared';

const AUTH_TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/**
 * Extended user type for authentication
 * Extends UserDTO with optional avatar field for local auth state
 */
export interface User extends UserDTO {
  avatarUrl?: string;
}

/**
 * Optional external auth adapter (e.g., Clerk) so we can bridge to backend tokens.
 */
export interface AuthAdapter {
  getToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  getUser?: () => Promise<User | null>;
  signOut?: () => Promise<void>;
}

/**
 * Authentication state
 */
export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingVerification: boolean;
}

/**
 * Authentication context value
 */
export interface AuthContextValue extends AuthState {
  signIn: (email: string) => Promise<void>;
  verifySignInCode: (code: string) => Promise<void>;
  signUp: (email: string, name: string) => Promise<void>;
  verifySignUpCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  /**
   * Bootstrap from an external session (e.g., Clerk) and sync profile from backend.
   */
  bootstrapExternalSession: (token: string, user?: User | null) => Promise<void>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// External adapter registry (singleton)
let registeredAdapter: AuthAdapter | null = null;

export function registerAuthAdapter(adapter: AuthAdapter): void {
  registeredAdapter = adapter;
}

/**
 * Hook to access authentication state and methods
 * Must be used within an AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook for protected route navigation
 * Redirects unauthenticated users to login
 */
export function useProtectedRoute() {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Wait for both auth and navigation to be loaded
    if (isLoading || !navigationState?.key) return;

    const inPublicGroup = segments[0] === '(public)';
    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && inAuthGroup) {
      // User is not signed in but trying to access protected route
      router.replace('/(public)');
    } else if (isAuthenticated && inPublicGroup) {
      // User is signed in but on public route, redirect to home
      router.replace('/');
    }
  }, [isAuthenticated, segments, isLoading, navigationState?.key, router]);
}

/**
 * Hook to provide authentication state (for AuthProvider)
 * This is the implementation that manages auth state.
 * Uses email code verification flow by default; can be bootstrapped with Clerk via registerAuthAdapter.
 */
export function useAuthProvider(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    pendingVerification: false,
  });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = useCallback(async () => {
    try {
      // Prefer external adapter if available (e.g., Clerk)
      if (registeredAdapter) {
        const token = await registeredAdapter.getToken();
        if (token) {
          const externalUser = registeredAdapter.getUser ? await registeredAdapter.getUser() : null;
          const hydrated = await syncFromBackend(token, externalUser);
          if (hydrated) return;
        }
        // If Clerk is configured but returns no token, user needs to re-authenticate
        // Don't fall back to SecureStore as it may contain stale/mock tokens
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          pendingVerification: false,
        });
        return;
      }

      // Only use SecureStore when no external adapter (Clerk) is configured
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);

      if (token) {
        const cachedUser = userJson ? (JSON.parse(userJson) as User) : null;
        const hydrated = await syncFromBackend(token, cachedUser);
        if (hydrated) return;
      }

      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        pendingVerification: false,
      });
    } catch (error) {
      console.error('Session check failed:', error);
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        pendingVerification: false,
      });
    }
  }, []);

  const signIn = useCallback(async (email: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // In production, this would call Clerk to send email code
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Auth] Verification code sent to ${email}`);
      setPendingEmail(email);

      setState((prev) => ({
        ...prev,
        isLoading: false,
        pendingVerification: true,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      if (registeredAdapter?.signOut) {
        await registeredAdapter.signOut();
      }

      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        pendingVerification: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const getToken = useCallback(async () => {
    if (registeredAdapter) {
      return registeredAdapter.getToken();
    }
    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  }, []);

  const syncFromBackend = useCallback(
    async (token: string, fallbackUser: User | null = null): Promise<boolean> => {
      try {
        const response = await apiClient.get<ApiResponse<GetMeResponse>>('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.data.data?.user) {
          throw new Error('Invalid response from backend');
        }

        const user: User = {
          id: response.data.data.user.id,
          email: response.data.data.user.email,
          name: response.data.data.user.name || response.data.data.user.email,
          firstName: response.data.data.user.firstName,
          lastName: response.data.data.user.lastName,
          biometricEnabled: response.data.data.user.biometricEnabled,
          createdAt: response.data.data.user.createdAt,
        };

        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

        setState({
          user,
          isLoading: false,
          isAuthenticated: true,
          pendingVerification: false,
        });
        return true;
      } catch {
        if (fallbackUser) {
          await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fallbackUser));
          setState({
            user: fallbackUser,
            isLoading: false,
            isAuthenticated: true,
            pendingVerification: false,
          });
          return true;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isAuthenticated: false,
        }));
        return false;
      }
    },
    []
  );

  const bootstrapExternalSession = useCallback(
    async (token: string, user?: User | null) => {
      setState((prev) => ({ ...prev, isLoading: true }));
      const hydrated = await syncFromBackend(token, user ?? null);

      if (!hydrated && user) {
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
        setState({
          user,
          isLoading: false,
          isAuthenticated: true,
          pendingVerification: false,
        });
      }
    },
    [syncFromBackend]
  );

  const verifySignInCode = useCallback(
    async (code: string) => {
      if (!pendingEmail) {
        throw new Error('No pending email verification');
      }

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // In production, verify with Clerk; for dev, accept any 6-digit code
        if (code.length !== 6) {
          throw new Error('Invalid verification code');
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: `user_${Date.now()}`,
          email: pendingEmail,
          name: pendingEmail.split('@')[0],
          firstName: null,
          lastName: null,
          biometricEnabled: false,
          createdAt: new Date().toISOString(),
        };

        const token = `token_${Date.now()}`;
        await bootstrapExternalSession(token, user);

        setPendingEmail(null);
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [pendingEmail, bootstrapExternalSession]
  );

  const signUp = useCallback(async (email: string, name: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // In production, this would call Clerk to create account and send code
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`[Auth] Signup verification code sent to ${email}`);
      setPendingEmail(email);
      setPendingName(name);

      setState((prev) => ({
        ...prev,
        isLoading: false,
        pendingVerification: true,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const verifySignUpCode = useCallback(
    async (code: string) => {
      if (!pendingEmail) {
        throw new Error('No pending email verification');
      }

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // In production, verify with Clerk; for dev, accept any 6-digit code
        if (code.length !== 6) {
          throw new Error('Invalid verification code');
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: `user_${Date.now()}`,
          email: pendingEmail,
          name: pendingName || pendingEmail.split('@')[0],
          firstName: pendingName?.split(' ')[0] || null,
          lastName: pendingName?.split(' ').slice(1).join(' ') || null,
          biometricEnabled: false,
          createdAt: new Date().toISOString(),
        };

        const token = `token_${Date.now()}`;

        await bootstrapExternalSession(token, user);

        setPendingEmail(null);
        setPendingName(null);
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [pendingEmail, pendingName, bootstrapExternalSession]
  );

  return {
    ...state,
    signIn,
    verifySignInCode,
    signUp,
    verifySignUpCode,
    signOut,
    getToken,
    bootstrapExternalSession,
  };
}

// Export the context for AuthProvider
export { AuthContext };
