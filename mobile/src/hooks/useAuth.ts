import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { apiClient } from '../lib/api';
import type { ApiResponse, GetMeResponse, UserDTO } from '@be-heard/shared';

/**
 * User type from backend
 */
export interface User extends UserDTO {
  avatarUrl?: string;
}

/**
 * Authentication context value
 * Clerk-first: Clerk is the auth source, backend profile is just data
 */
export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Hook to access authentication state and methods
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to provide authentication state
 *
 * Clerk-first approach:
 * - Clerk is the single source of truth for "am I logged in?"
 * - Backend user profile is just data we fetch, not a permission gate
 */
export function useAuthProvider(): AuthContextValue {
  const { isSignedIn, isLoaded, signOut: clerkSignOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();

  const [user, setUser] = useState<User | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Sync backend profile when Clerk auth state changes
  useEffect(() => {
    async function syncBackendProfile() {
      // Not signed in - clear user
      if (!isSignedIn || !clerkUser) {
        setUser(null);
        return;
      }

      // Already have user data - no need to refetch
      if (user?.id) {
        return;
      }

      setIsLoadingProfile(true);
      try {
        const response = await apiClient.get<ApiResponse<GetMeResponse>>('/auth/me');

        if (response.data?.data?.user) {
          const backendUser = response.data.data.user;
          setUser({
            id: backendUser.id,
            email: backendUser.email,
            name: backendUser.name || backendUser.email,
            firstName: backendUser.firstName,
            lastName: backendUser.lastName,
            biometricEnabled: backendUser.biometricEnabled,
            createdAt: backendUser.createdAt,
          });
        }
      } catch (error) {
        console.error('[useAuth] Failed to sync backend profile:', error);
        // Don't block the app - create minimal user from Clerk data
        setUser({
          id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          name: clerkUser.fullName || clerkUser.firstName || 'User',
          firstName: clerkUser.firstName || null,
          lastName: clerkUser.lastName || null,
          biometricEnabled: false,
          createdAt: clerkUser.createdAt?.toISOString() || new Date().toISOString(),
        });
      } finally {
        setIsLoadingProfile(false);
      }
    }

    if (isLoaded) {
      syncBackendProfile();
    }
  }, [isSignedIn, isLoaded, clerkUser?.id]);

  const signOut = useCallback(async () => {
    setUser(null);
    await clerkSignOut();
  }, [clerkSignOut]);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  return {
    user,
    isLoading: !isLoaded || isLoadingProfile,
    isAuthenticated: isSignedIn ?? false,
    signOut,
    getToken: getTokenFn,
  };
}

export { AuthContext };
