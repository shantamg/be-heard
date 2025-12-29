import { useEffect, useState, useCallback } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, ApiClientError } from '@/src/lib/api';
import { ErrorCode } from '@meet-without-fear/shared';

const PENDING_INVITATION_KEY = 'pending_invitation';

// ============================================================================
// Types
// ============================================================================

/** Invitation status as returned by the API */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

/** Invitation details returned from the API */
export interface InvitationDetails {
  id: string;
  invitedBy: {
    id: string;
    name: string | null;
  };
  name: string | null;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  session: {
    id: string;
    status: string;
  };
}

/** Error types for invitation fetching */
export type InvitationErrorType = 'not_found' | 'network' | 'unknown';

/** State returned by useInvitationDetails hook */
export interface UseInvitationDetailsState {
  invitation: InvitationDetails | null;
  isLoading: boolean;
  error: {
    type: InvitationErrorType;
    message: string;
  } | null;
  isExpired: boolean;
  isNotFound: boolean;
  refetch: () => Promise<void>;
}

/**
 * Parses invitation data from a deep link URL
 */
function parseInvitationFromUrl(url: string): string | null {
  try {
    const { path, queryParams } = Linking.parse(url);

    // Handle various URL formats:
    // - meetwithoutfear://invitation/abc123
    // - meetwithoutfear://invitation?id=abc123
    // - https://meetwithoutfear.app/invitation/abc123
    // - https://meetwithoutfear.app/invitation?id=abc123

    if (path?.startsWith('invitation/')) {
      // Path format: invitation/abc123
      const parts = path.split('/');
      if (parts.length >= 2 && parts[1]) {
        return parts[1];
      }
    }

    if (path === 'invitation' && queryParams?.id) {
      // Query param format: invitation?id=abc123
      return queryParams.id as string;
    }

    return null;
  } catch (error) {
    console.error('Failed to parse invitation URL:', error);
    return null;
  }
}

/**
 * Hook to handle invitation deep links
 *
 * When the app is opened with an invitation link, the invitation ID
 * is stored and can be retrieved after the user completes authentication.
 */
export function useInvitationLink() {
  const [invitationId, setInvitationId] = useState<string | null>(null);

  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const id = parseInvitationFromUrl(event.url);
      if (id) {
        console.log('[Invitation] Received invitation:', id);
        await AsyncStorage.setItem(PENDING_INVITATION_KEY, id);
        setInvitationId(id);
      }
    };

    // Listen for incoming URLs while app is running
    const subscription = Linking.addEventListener('url', handleUrl);

    // Check initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return invitationId;
}

/**
 * Get the pending invitation ID from storage
 * Call this after successful authentication to navigate to the invited session
 */
export async function getPendingInvitation(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_INVITATION_KEY);
  } catch (error) {
    console.error('Failed to get pending invitation:', error);
    return null;
  }
}

/**
 * Clear the pending invitation from storage
 * Call this after successfully joining a session
 */
export async function clearPendingInvitation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITATION_KEY);
  } catch (error) {
    console.error('Failed to clear pending invitation:', error);
  }
}

/**
 * Hook to manage pending invitations after authentication
 */
export function usePendingInvitation() {
  const [pendingInvitation, setPendingInvitation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPendingInvitation = async () => {
      try {
        const invitation = await getPendingInvitation();
        setPendingInvitation(invitation);
      } catch (error) {
        console.error('Failed to load pending invitation:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingInvitation();
  }, []);

  const clearInvitation = useCallback(async () => {
    await clearPendingInvitation();
    setPendingInvitation(null);
  }, []);

  return {
    pendingInvitation,
    isLoading,
    clearInvitation,
  };
}

/**
 * Generate an invitation deep link URL
 */
export function createInvitationLink(invitationId: string): string {
  // Use Linking.createURL for proper scheme handling
  return Linking.createURL(`invitation/${invitationId}`);
}

// ============================================================================
// Invitation Details Hook
// ============================================================================

/**
 * Hook to fetch and manage invitation details from the API.
 *
 * Handles:
 * - Loading state during fetch
 * - Not found errors (404)
 * - Expired invitation detection
 * - Network errors with retry capability
 *
 * @param invitationId - The invitation ID to fetch, or null/undefined to skip
 */
export function useInvitationDetails(
  invitationId: string | null | undefined
): UseInvitationDetailsState {
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ type: InvitationErrorType; message: string } | null>(null);

  const fetchInvitation = useCallback(async () => {
    if (!invitationId) {
      setIsLoading(false);
      setError({ type: 'not_found', message: 'No invitation ID provided' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await get<{ invitation: InvitationDetails }>(
        `/v1/invitations/${invitationId}`
      );
      setInvitation(response.invitation);
    } catch (err) {
      console.error('[useInvitationDetails] Error fetching invitation:', err);

      if (err instanceof ApiClientError) {
        if (err.code === ErrorCode.NOT_FOUND) {
          setError({ type: 'not_found', message: 'Invitation not found' });
        } else if (err.code === ErrorCode.SERVICE_UNAVAILABLE) {
          setError({ type: 'network', message: 'Unable to connect. Please check your connection.' });
        } else {
          setError({ type: 'unknown', message: err.message || 'An unexpected error occurred' });
        }
      } else {
        setError({ type: 'network', message: 'Unable to connect. Please check your connection.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [invitationId]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  // Compute derived states
  const isExpired = invitation?.status === 'EXPIRED';
  const isNotFound = error?.type === 'not_found';

  return {
    invitation,
    isLoading,
    error,
    isExpired,
    isNotFound,
    refetch: fetchInvitation,
  };
}
