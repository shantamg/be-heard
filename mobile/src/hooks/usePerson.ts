/**
 * Person Hooks for BeHeard Mobile
 *
 * React Query hooks for person/relationship-related API operations.
 */

import {
  useQuery,
  UseQueryOptions,
} from '@tanstack/react-query';
import { get, ApiClientError } from '../lib/api';
import { Stage } from '@be-heard/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const personKeys = {
  all: ['people'] as const,
  lists: () => [...personKeys.all, 'list'] as const,
  details: () => [...personKeys.all, 'detail'] as const,
  detail: (id: string) => [...personKeys.details(), id] as const,
  sessions: (id: string) => [...personKeys.detail(id), 'sessions'] as const,
  pastSessions: (id: string) => [...personKeys.sessions(id), 'past'] as const,
};

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = 'waiting_on_you' | 'your_turn' | 'waiting_on_partner' | 'both_active';

export interface ActiveSessionInfo {
  id: string;
  stage: Stage;
  status: SessionStatus;
  lastUpdate: string;
}

export interface PersonDTO {
  id: string;
  name: string;
  initials: string;
  connectedSince: string;
  activeSession: ActiveSessionInfo | null;
}

export interface PastSessionDTO {
  id: string;
  date: string;
  topic: string;
}

export interface GetPersonResponse {
  person: PersonDTO;
}

export interface GetPastSessionsResponse {
  sessions: PastSessionDTO[];
}

// ============================================================================
// Get Person Hook
// ============================================================================

/**
 * Fetch person details by ID, including active session info.
 *
 * @param personId - The person ID to fetch
 * @param options - React Query options
 */
export function usePerson(
  personId: string | undefined,
  options?: Omit<
    UseQueryOptions<PersonDTO, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: personKeys.detail(personId || ''),
    queryFn: async () => {
      if (!personId) throw new Error('Person ID is required');
      const response = await get<GetPersonResponse>(`/people/${personId}`);
      return response.person;
    },
    enabled: !!personId,
    staleTime: 30_000, // 30 seconds
    ...options,
  });
}

// ============================================================================
// Get Past Sessions Hook
// ============================================================================

/**
 * Fetch past (completed) sessions for a specific person.
 *
 * @param personId - The person ID to fetch sessions for
 * @param options - React Query options
 */
export function usePastSessions(
  personId: string | undefined,
  options?: Omit<
    UseQueryOptions<PastSessionDTO[], ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: personKeys.pastSessions(personId || ''),
    queryFn: async () => {
      if (!personId) throw new Error('Person ID is required');
      const response = await get<GetPastSessionsResponse>(
        `/people/${personId}/sessions?status=completed`
      );
      return response.sessions;
    },
    enabled: !!personId,
    staleTime: 60_000, // 1 minute
    ...options,
  });
}
