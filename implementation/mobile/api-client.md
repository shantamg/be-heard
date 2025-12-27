# API Client Implementation

## Source Documentation

- [API Index](../../docs/mvp-planning/plans/backend/api/index.md)
- [Shared Contracts](../../shared/src/contracts/)

## Prerequisites

- [ ] `mobile/auth-flow.md` complete (for auth token)
- [ ] `shared/api-contracts.md` complete

## External Services Required

> **None.** Uses backend API.

## Scope

Create typed API client with React Query hooks for all endpoints.

## Implementation Steps

### 1. Install dependencies

```bash
cd mobile
npm install @tanstack/react-query axios
```

### 2. Create API client base

Create `mobile/src/lib/api.ts`:

```typescript
import axios from 'axios';
import { useAuth } from '@clerk/clerk-expo';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

// Auth interceptor hook
export function useApiClient() {
  const { getToken } = useAuth();

  const client = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' }
  });

  client.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
}
```

### 3. Create React Query provider

Update `mobile/app/_layout.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 2
    }
  }
});

// Wrap app with QueryClientProvider
```

### 4. Create session hooks

Create `mobile/src/hooks/useSessions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';
import type {
  SessionSummaryDTO,
  SessionDetailDTO,
  CreateSessionRequest,
  CreateSessionResponse
} from '@be-heard/shared';

export function useSessions() {
  const api = useApiClient();

  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { sessions: SessionSummaryDTO[] } }>('/sessions');
      return data.data.sessions;
    }
  });
}

export function useSession(sessionId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data } = await api.get<{ data: { session: SessionDetailDTO } }>(`/sessions/${sessionId}`);
      return data.data.session;
    },
    enabled: !!sessionId
  });
}

export function useCreateSession() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateSessionRequest) => {
      const { data } = await api.post<{ data: CreateSessionResponse }>('/sessions', request);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  });
}
```

### 5. Create message hooks

Create `mobile/src/hooks/useMessages.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';
import type { MessageDTO } from '@be-heard/shared';

export function useMessages(sessionId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['messages', sessionId],
    queryFn: async () => {
      const { data } = await api.get<{ data: { messages: MessageDTO[] } }>(
        `/sessions/${sessionId}/messages`
      );
      return data.data.messages;
    },
    enabled: !!sessionId,
    refetchInterval: 5000 // Poll every 5s as backup to realtime
  });
}

export function useSendMessage(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const { data } = await api.post(`/sessions/${sessionId}/messages`, { content });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
    }
  });
}
```

### 6. Create auth hooks

Create `mobile/src/hooks/useProfile.ts`:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';
import type { GetMeResponse } from '@be-heard/shared';

export function useProfile() {
  const api = useApiClient();

  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get<{ data: GetMeResponse }>('/auth/me');
      return data.data;
    }
  });
}

export function useUpdatePushToken() {
  const api = useApiClient();

  return useMutation({
    mutationFn: async (pushToken: string) => {
      const { data } = await api.post('/auth/push-token', {
        pushToken,
        platform: Platform.OS
      });
      return data.data;
    }
  });
}
```

### 7. Create stage-specific hooks

Create hooks for each stage's API endpoints:
- `useCompact` (stage 0)
- `useEmpathy` (stage 2)
- `useNeeds` (stage 3)
- `useStrategies` (stage 4)

### 8. Write tests

Create `mobile/src/hooks/__tests__/useSessions.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSessions } from '../useSessions';

describe('useSessions', () => {
  it('fetches sessions list', async () => {
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeInstanceOf(Array);
  });
});
```

### 9. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] API client attaches auth token
- [ ] Sessions hooks fetch and cache correctly
- [ ] Mutations invalidate relevant queries
- [ ] Error handling works (401, 404, etc.)
- [ ] Types match shared contracts
- [ ] `npm run check` passes
- [ ] `npm run test` passes
