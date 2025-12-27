/**
 * Profile Hooks for BeHeard Mobile
 *
 * React Query hooks for user profile and push notifications.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, patch, ApiClientError } from '../lib/api';
import {
  GetMeResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UpdatePushTokenRequest,
  UpdatePushTokenResponse,
  AblyTokenResponse,
} from '@be-heard/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  ablyToken: () => [...profileKeys.all, 'ably'] as const,
};

// ============================================================================
// Get Current User Profile Hook
// ============================================================================

/**
 * Fetch the current authenticated user's profile.
 *
 * @param options - React Query options
 */
export function useProfile(
  options?: Omit<UseQueryOptions<GetMeResponse, ApiClientError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: async () => {
      return get<GetMeResponse>('/me');
    },
    staleTime: 5 * 60_000, // 5 minutes - profile doesn't change often
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error instanceof ApiClientError && error.isAuthError()) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
  });
}

// ============================================================================
// Update Profile Hook
// ============================================================================

/**
 * Update the current user's profile.
 */
export function useUpdateProfile(
  options?: Omit<
    UseMutationOptions<UpdateProfileResponse, ApiClientError, UpdateProfileRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateProfileRequest) => {
      return patch<UpdateProfileResponse, UpdateProfileRequest>('/me', request);
    },
    onSuccess: (data) => {
      // Update the cached profile
      queryClient.setQueryData<GetMeResponse>(profileKeys.me(), (old) => {
        if (!old) return old;
        return {
          ...old,
          user: data.user,
        };
      });
    },
    ...options,
  });
}

// ============================================================================
// Push Token Hooks
// ============================================================================

/**
 * Register or update push notification token.
 */
export function useUpdatePushToken(
  options?: Omit<
    UseMutationOptions<UpdatePushTokenResponse, ApiClientError, UpdatePushTokenRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdatePushTokenRequest) => {
      return post<UpdatePushTokenResponse, UpdatePushTokenRequest>(
        '/me/push-token',
        request
      );
    },
    onSuccess: (data) => {
      // Update profile to reflect push notification status
      queryClient.setQueryData<GetMeResponse>(profileKeys.me(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pushNotificationsEnabled: data.registered,
        };
      });
    },
    ...options,
  });
}

/**
 * Unregister push notification token.
 */
export function useUnregisterPushToken(
  options?: Omit<
    UseMutationOptions<{ unregistered: boolean }, ApiClientError, void>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return post<{ unregistered: boolean }>('/me/push-token/unregister');
    },
    onSuccess: () => {
      // Update profile to reflect push notification status
      queryClient.setQueryData<GetMeResponse>(profileKeys.me(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pushNotificationsEnabled: false,
        };
      });
    },
    ...options,
  });
}

// ============================================================================
// Ably Token Hook (for real-time messaging)
// ============================================================================

/**
 * Get an Ably token for real-time messaging.
 */
export function useAblyToken(
  options?: Omit<UseQueryOptions<AblyTokenResponse, ApiClientError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: profileKeys.ablyToken(),
    queryFn: async () => {
      return get<AblyTokenResponse>('/me/ably-token');
    },
    staleTime: 50 * 60_000, // Token valid for ~1 hour, refresh early
    refetchInterval: 50 * 60_000, // Refetch before expiry
    ...options,
  });
}

// ============================================================================
// Account Actions
// ============================================================================

/**
 * Delete the current user's account.
 * This is a destructive action that cannot be undone.
 */
export function useDeleteAccount(
  options?: Omit<
    UseMutationOptions<{ deleted: boolean }, ApiClientError, { confirmEmail: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ confirmEmail }) => {
      return post<{ deleted: boolean }>('/me/delete', { confirmEmail });
    },
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear();
    },
    ...options,
  });
}

/**
 * Export user data (GDPR compliance).
 */
export function useExportData(
  options?: Omit<
    UseMutationOptions<{ exportUrl: string; expiresAt: string }, ApiClientError, void>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async () => {
      return post<{ exportUrl: string; expiresAt: string }>('/me/export');
    },
    ...options,
  });
}
