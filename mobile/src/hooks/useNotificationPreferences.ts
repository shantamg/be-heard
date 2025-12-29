/**
 * Notification Preferences Hook for Meet Without Fear Mobile
 *
 * React Query hooks for fetching and updating notification preferences.
 * Supports optimistic updates for a responsive toggle experience.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import { get, patch, ApiClientError } from '../lib/api';
import {
  NotificationPreferencesDTO,
  GetNotificationPreferencesResponse,
  UpdateNotificationPreferencesRequest,
  UpdateNotificationPreferencesResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const notificationPreferencesKeys = {
  all: ['notificationPreferences'] as const,
  preferences: () => [...notificationPreferencesKeys.all, 'preferences'] as const,
};

// ============================================================================
// Get Notification Preferences Hook
// ============================================================================

/**
 * Fetch the current user's notification preferences.
 *
 * @param options - React Query options
 */
export function useNotificationPreferences(
  options?: Omit<
    UseQueryOptions<NotificationPreferencesDTO, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: notificationPreferencesKeys.preferences(),
    queryFn: async () => {
      const response = await get<GetNotificationPreferencesResponse>(
        '/me/notification-preferences'
      );
      return response.preferences;
    },
    staleTime: 5 * 60_000, // 5 minutes - preferences don't change often
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
// Context Type for Optimistic Updates
// ============================================================================

interface UpdatePreferencesContext {
  previousPreferences: NotificationPreferencesDTO | undefined;
}

// ============================================================================
// Update Notification Preferences Hook Options
// ============================================================================

export interface UseUpdateNotificationPreferencesOptions {
  /** Called when mutation succeeds */
  onSuccess?: (data: UpdateNotificationPreferencesResponse) => void;
  /** Called when mutation fails */
  onError?: (error: ApiClientError) => void;
}

// ============================================================================
// Update Notification Preferences Hook
// ============================================================================

/**
 * Update the current user's notification preferences.
 * Uses optimistic updates for immediate UI feedback.
 */
export function useUpdateNotificationPreferences(
  options?: UseUpdateNotificationPreferencesOptions
) {
  const queryClient = useQueryClient();

  return useMutation<
    UpdateNotificationPreferencesResponse,
    ApiClientError,
    UpdateNotificationPreferencesRequest,
    UpdatePreferencesContext
  >({
    mutationFn: async (request: UpdateNotificationPreferencesRequest) => {
      return patch<UpdateNotificationPreferencesResponse, UpdateNotificationPreferencesRequest>(
        '/me/notification-preferences',
        request
      );
    },
    // Optimistic update for responsive toggles
    onMutate: async (newPreferences): Promise<UpdatePreferencesContext> => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: notificationPreferencesKeys.preferences(),
      });

      // Snapshot the previous value
      const previousPreferences = queryClient.getQueryData<NotificationPreferencesDTO>(
        notificationPreferencesKeys.preferences()
      );

      // Optimistically update to the new value
      if (previousPreferences) {
        queryClient.setQueryData<NotificationPreferencesDTO>(
          notificationPreferencesKeys.preferences(),
          {
            ...previousPreferences,
            ...newPreferences,
          }
        );
      }

      // Return context with the snapshotted value
      return { previousPreferences };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, _newPreferences, context) => {
      if (context?.previousPreferences) {
        queryClient.setQueryData<NotificationPreferencesDTO>(
          notificationPreferencesKeys.preferences(),
          context.previousPreferences
        );
      }
      // Call user's onError if provided
      options?.onError?.(err);
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: notificationPreferencesKeys.preferences(),
      });
    },
    onSuccess: (data) => {
      // Update with server response
      queryClient.setQueryData<NotificationPreferencesDTO>(
        notificationPreferencesKeys.preferences(),
        data.preferences
      );
      // Call user's onSuccess if provided
      options?.onSuccess?.(data);
    },
  });
}

// ============================================================================
// Types Re-export
// ============================================================================

export type {
  NotificationPreferencesDTO,
  UpdateNotificationPreferencesRequest,
};
