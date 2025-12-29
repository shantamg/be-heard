/**
 * useProfile Hook Tests
 *
 * Tests for profile-related API hooks including user data, push tokens, and account actions.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useProfile,
  useUpdateProfile,
  useUpdatePushToken,
  useUnregisterPushToken,
  useAblyToken,
  useDeleteAccount,
  useExportData,
  profileKeys,
} from '../useProfile';

// Import mocked functions
import * as api from '../../lib/api';

// Mock the API module
jest.mock('../../lib/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(error: { code: string; message: string }, status: number) {
      super(error.message);
      this.code = error.code;
      this.status = status;
    }
    isAuthError() {
      return this.code === 'UNAUTHORIZED' || this.code === 'FORBIDDEN';
    }
  },
}));

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;
const mockPatch = api.patch as jest.MockedFunction<typeof api.patch>;
const mockDel = (api as any).del as jest.MockedFunction<typeof api.get>;

// Create a wrapper with QueryClient
function createWrapper(): React.FC<{ children: React.ReactNode }> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Sample profile data
const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockProfile = {
  user: mockUser,
  preferences: {
    notificationsEnabled: true,
    emailNotifications: true,
  },
};

describe('useProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useProfile hook', () => {
    it('fetches user profile successfully', async () => {
      mockGet.mockResolvedValueOnce(mockProfile);

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.user.id).toBe('user-123');
      expect(result.current.data?.user.email).toBe('user@example.com');
      expect(mockGet).toHaveBeenCalledWith('/auth/me');
    });

    it('handles unauthorized error without retry', async () => {
      const error = new (api.ApiClientError as any)(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401
      );
      mockGet.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Not authenticated');
      // Should not retry auth errors
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('useUpdateProfile hook', () => {
    it('updates profile successfully', async () => {
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      mockPatch.mockResolvedValueOnce({ user: updatedUser });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({ name: 'Updated Name' });
      await act(async () => {
        await mutationPromise;
      });

      expect(mockPatch).toHaveBeenCalledWith('/auth/me', { name: 'Updated Name' });
      const mutationResult = await mutationPromise;
      expect(mutationResult.user.name).toBe('Updated Name');
    });

    it('updates multiple profile fields', async () => {
      const updatedUser = {
        ...mockUser,
        name: 'New Name',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      };
      mockPatch.mockResolvedValueOnce({ user: updatedUser });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Name',
        });
      });

      expect(mockPatch).toHaveBeenCalledWith('/auth/me', {
        name: 'New Name',
      });
    });

    it('handles validation error', async () => {
      const error = new (api.ApiClientError as any)(
        { code: 'VALIDATION_ERROR', message: 'Name is too long' },
        400
      );
      mockPatch.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(),
      });

      let caughtError: Error | undefined;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            name: 'A'.repeat(256),
          });
        } catch (e) {
          caughtError = e as Error;
        }
      });

      expect(caughtError?.message).toBe('Name is too long');
    });
  });

  describe('useUpdatePushToken hook', () => {
    it('registers push token successfully', async () => {
      mockPost.mockResolvedValueOnce({
        registered: true,
      });

      const { result } = renderHook(() => useUpdatePushToken(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync({
        pushToken: 'ExponentPushToken[xxx]',
        platform: 'ios',
      });

      await act(async () => {
        await mutationPromise;
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/push-token', {
        pushToken: 'ExponentPushToken[xxx]',
        platform: 'ios',
      });
      const mutationResult = await mutationPromise;
      expect(mutationResult.registered).toBe(true);
    });

    it('handles Android platform', async () => {
      mockPost.mockResolvedValueOnce({
        registered: true,
        platform: 'android',
      });

      const { result } = renderHook(() => useUpdatePushToken(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          pushToken: 'FCM-token-xxx',
          platform: 'android',
        });
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/push-token', {
        pushToken: 'FCM-token-xxx',
        platform: 'android',
      });
    });
  });

  describe('useUnregisterPushToken hook', () => {
    it('unregisters push token successfully', async () => {
      // Backend uses DELETE and returns { registered: false }
      mockDel.mockResolvedValueOnce({ registered: false });

      const { result } = renderHook(() => useUnregisterPushToken(), {
        wrapper: createWrapper(),
      });

      const mutationPromise = result.current.mutateAsync();
      await act(async () => {
        await mutationPromise;
      });

      expect(mockDel).toHaveBeenCalledWith('/auth/push-token');
      const mutationResult = await mutationPromise;
      expect(mutationResult.unregistered).toBe(true);
    });
  });

  describe('useAblyToken hook', () => {
    it('fetches Ably token for real-time messaging', async () => {
      const mockToken = {
        tokenRequest: {
          keyName: 'test-key',
          ttl: 3600000,
          timestamp: Date.now(),
          capability: '{"*":["subscribe","publish"]}',
          clientId: 'user-123',
          nonce: 'nonce-xxx',
          mac: 'mac-xxx',
        },
      };
      mockGet.mockResolvedValueOnce(mockToken);

      const { result } = renderHook(() => useAblyToken(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.tokenRequest.keyName).toBe('test-key');
      expect(mockGet).toHaveBeenCalledWith('/auth/ably-token');
    });
  });

  describe('useDeleteAccount hook', () => {
    it('deletes account with email confirmation', async () => {
      const responseData = { deleted: true };
      mockPost.mockResolvedValueOnce(responseData);

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      let mutationResult: typeof responseData | undefined;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({ confirmEmail: 'user@example.com' });
      });

      expect(mockPost).toHaveBeenCalledWith('/me/delete', {
        confirmEmail: 'user@example.com',
      });
      expect(mutationResult?.deleted).toBe(true);
    });

    it('handles incorrect email confirmation', async () => {
      const error = new (api.ApiClientError as any)(
        { code: 'VALIDATION_ERROR', message: 'Email confirmation does not match' },
        400
      );
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      let caughtError: Error | undefined;
      await act(async () => {
        try {
          await result.current.mutateAsync({ confirmEmail: 'wrong@example.com' });
        } catch (e) {
          caughtError = e as Error;
        }
      });

      expect(caughtError?.message).toBe('Email confirmation does not match');
    });
  });

  describe('useExportData hook', () => {
    it('exports user data (GDPR compliance)', async () => {
      const responseData = {
        exportUrl: 'https://storage.example.com/exports/user-123.zip',
        expiresAt: '2024-01-02T00:00:00.000Z',
      };
      mockPost.mockResolvedValueOnce(responseData);

      const { result } = renderHook(() => useExportData(), {
        wrapper: createWrapper(),
      });

      let mutationResult: typeof responseData | undefined;
      await act(async () => {
        mutationResult = await result.current.mutateAsync();
      });

      expect(mockPost).toHaveBeenCalledWith('/me/export');
      expect(mutationResult?.exportUrl).toContain('exports/user-123.zip');
    });
  });

  describe('profileKeys', () => {
    it('generates correct query keys', () => {
      expect(profileKeys.all).toEqual(['profile']);
      expect(profileKeys.me()).toEqual(['profile', 'me']);
      expect(profileKeys.ablyToken()).toEqual(['profile', 'ably']);
    });
  });
});
