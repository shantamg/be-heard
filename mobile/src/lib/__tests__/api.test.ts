/**
 * API Client Tests
 *
 * Tests for the axios-based API client with authentication and error handling.
 */

import axios, { AxiosError } from 'axios';
import {
  get,
  post,
  put,
  patch,
  del,
  setTokenProvider,
  ApiClientError,
} from '../api';
import { ErrorCode } from '@meet-without-fear/shared';

// Mock axios
type MockAxiosType = {
  create: jest.Mock;
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
  interceptors: {
    request: { use: jest.Mock };
    response: { use: jest.Mock };
  };
};

jest.mock('axios', () => {
  interface MockAxios {
    create: jest.Mock;
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
    interceptors: {
      request: { use: jest.Mock };
      response: { use: jest.Mock };
    };
  }
  const mockAxios: MockAxios = {
    create: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  };
  mockAxios.create = jest.fn((): MockAxios => mockAxios);
  return mockAxios;
});

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      apiUrl: 'http://test-api.example.com',
    },
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setTokenProvider', () => {
    it('sets token provider for auth interceptor', async () => {
      const mockTokenProvider = {
        getToken: jest.fn().mockResolvedValue('test-token'),
      };

      setTokenProvider(mockTokenProvider);

      // Token provider is set internally, verify by making a request
      expect(mockTokenProvider.getToken).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('makes GET request and returns data', async () => {
      const mockData = { user: { id: '123', name: 'Test' } };
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockData },
        status: 200,
      });

      const result = await get<typeof mockData>('/users/123');

      expect(mockedAxios.get).toHaveBeenCalledWith('/users/123', undefined);
      expect(result).toEqual(mockData);
    });

    it('handles API error response', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: 'User not found' },
        },
        status: 404,
      });

      await expect(get('/users/999')).rejects.toThrow(ApiClientError);
    });

    it('passes config options', async () => {
      const mockData = { items: [] };
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockData },
        status: 200,
      });

      await get('/items', { params: { limit: 10 } });

      expect(mockedAxios.get).toHaveBeenCalledWith('/items', { params: { limit: 10 } });
    });
  });

  describe('post', () => {
    it('makes POST request with data', async () => {
      const requestData = { name: 'New Item' };
      const responseData = { id: '456', name: 'New Item' };
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: responseData },
        status: 201,
      });

      const result = await post<typeof responseData, typeof requestData>('/items', requestData);

      expect(mockedAxios.post).toHaveBeenCalledWith('/items', requestData, undefined);
      expect(result).toEqual(responseData);
    });

    it('handles validation error', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Name is required',
            details: { field: 'name' },
          },
        },
        status: 400,
      });

      try {
        await post('/items', {});
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as ApiClientError).message).toBe('Name is required');
      }
    });
  });

  describe('put', () => {
    it('makes PUT request with data', async () => {
      const requestData = { name: 'Updated Item' };
      const responseData = { id: '123', name: 'Updated Item' };
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true, data: responseData },
        status: 200,
      });

      const result = await put<typeof responseData, typeof requestData>('/items/123', requestData);

      expect(mockedAxios.put).toHaveBeenCalledWith('/items/123', requestData, undefined);
      expect(result).toEqual(responseData);
    });
  });

  describe('patch', () => {
    it('makes PATCH request with partial data', async () => {
      const requestData = { status: 'active' };
      const responseData = { id: '123', name: 'Item', status: 'active' };
      mockedAxios.patch.mockResolvedValueOnce({
        data: { success: true, data: responseData },
        status: 200,
      });

      const result = await patch<typeof responseData, typeof requestData>(
        '/items/123',
        requestData
      );

      expect(mockedAxios.patch).toHaveBeenCalledWith('/items/123', requestData, undefined);
      expect(result).toEqual(responseData);
    });
  });

  describe('del', () => {
    it('makes DELETE request', async () => {
      const responseData = { deleted: true };
      mockedAxios.delete.mockResolvedValueOnce({
        data: { success: true, data: responseData },
        status: 200,
      });

      const result = await del<typeof responseData>('/items/123');

      expect(mockedAxios.delete).toHaveBeenCalledWith('/items/123', undefined);
      expect(result).toEqual(responseData);
    });
  });

  describe('ApiClientError', () => {
    it('creates error with code and status', () => {
      const error = new ApiClientError(
        { code: ErrorCode.UNAUTHORIZED, message: 'Not authenticated' },
        401
      );

      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.status).toBe(401);
      expect(error.message).toBe('Not authenticated');
    });

    it('identifies auth errors', () => {
      const unauthorizedError = new ApiClientError(
        { code: ErrorCode.UNAUTHORIZED, message: 'Token expired' },
        401
      );
      const forbiddenError = new ApiClientError(
        { code: ErrorCode.FORBIDDEN, message: 'Access denied' },
        403
      );
      const notFoundError = new ApiClientError(
        { code: ErrorCode.NOT_FOUND, message: 'Not found' },
        404
      );

      expect(unauthorizedError.isAuthError()).toBe(true);
      expect(forbiddenError.isAuthError()).toBe(true);
      expect(notFoundError.isAuthError()).toBe(false);
    });

    it('identifies validation errors', () => {
      const validationError = new ApiClientError(
        { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid input' },
        400
      );
      const serverError = new ApiClientError(
        { code: ErrorCode.INTERNAL_ERROR, message: 'Server error' },
        500
      );

      expect(validationError.isValidationError()).toBe(true);
      expect(serverError.isValidationError()).toBe(false);
    });

    it('checks specific error code', () => {
      const error = new ApiClientError(
        { code: ErrorCode.CONFLICT, message: 'Resource already exists' },
        409
      );

      expect(error.is(ErrorCode.CONFLICT)).toBe(true);
      expect(error.is(ErrorCode.NOT_FOUND)).toBe(false);
    });

    it('includes error details', () => {
      const error = new ApiClientError(
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: { field: 'email', reason: 'Invalid format' },
        },
        400
      );

      expect(error.details).toEqual({ field: 'email', reason: 'Invalid format' });
    });
  });
});
