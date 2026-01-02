import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, patch, ApiClientError } from '../lib/api';
import type { ApiResponse, GetMeResponse, UserDTO } from '@meet-without-fear/shared';

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
  updateUser: (updates: Partial<User>) => void;
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
            lastMoodIntensity: backendUser.lastMoodIntensity,
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
          lastMoodIntensity: null,
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

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  return {
    user,
    isLoading: !isLoaded || isLoadingProfile,
    isAuthenticated: isSignedIn ?? false,
    signOut,
    getToken: getTokenFn,
    updateUser,
  };
}

export { AuthContext };

// ============================================================================
// Query Keys
// ============================================================================

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

// ============================================================================
// Update Mood Hook
// ============================================================================

interface UpdateMoodResponse {
  lastMoodIntensity: number;
}

interface UpdateMoodRequest {
  intensity: number;
}

/**
 * Update the user's default mood intensity.
 * This is called from the session entry mood check to persist the preference.
 */
export function useUpdateMood() {
  const queryClient = useQueryClient();

  return useMutation<UpdateMoodResponse, ApiClientError, UpdateMoodRequest>({
    mutationFn: async ({ intensity }) => {
      return patch<UpdateMoodResponse>('/auth/me/mood', { intensity });
    },
    onSuccess: () => {
      // Invalidate user data to refetch lastMoodIntensity
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
