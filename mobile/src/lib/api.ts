/**
 * API Client for BeHeard Mobile
 *
 * Axios-based HTTP client with authentication interceptor and error handling.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';
import { ApiError, ApiResponse, ErrorCode } from '@be-heard/shared';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000/api';

const REQUEST_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Token Provider Interface
// ============================================================================

/**
 * Interface for providing authentication tokens.
 * This will be implemented by Clerk or other auth providers.
 */
export interface TokenProvider {
  getToken: () => Promise<string | null>;
}

let tokenProvider: TokenProvider | null = null;

/**
 * Set the token provider for authentication.
 * Called during app initialization with Clerk's getToken.
 */
export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

// ============================================================================
// API Client Instance
// ============================================================================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// Request Interceptor - Add Auth Token
// ============================================================================

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    if (tokenProvider) {
      try {
        const token = await tokenProvider.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.warn('Failed to get auth token:', error);
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ============================================================================
// Response Interceptor - Handle Errors
// ============================================================================

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response) {
      const { status, data } = error.response;

      // Create standardized API error
      const apiError: ApiError = data?.error || {
        code: mapStatusToErrorCode(status),
        message: error.message || 'An error occurred',
      };

      // Handle specific error cases
      if (status === 401) {
        // Token expired or invalid - could trigger re-auth here
        console.warn('Unauthorized - token may be expired');
      }

      return Promise.reject(new ApiClientError(apiError, status));
    }

    // Network error or timeout
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(
        new ApiClientError(
          { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Request timed out' },
          0
        )
      );
    }

    return Promise.reject(
      new ApiClientError(
        { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Network error' },
        0
      )
    );
  }
);

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Custom error class for API errors with full type information.
 */
export class ApiClientError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }

  /**
   * Check if this is a specific error code.
   */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if this is an authentication error.
   */
  isAuthError(): boolean {
    return this.code === ErrorCode.UNAUTHORIZED || this.code === ErrorCode.FORBIDDEN;
  }

  /**
   * Check if this is a validation error.
   */
  isValidationError(): boolean {
    return this.code === ErrorCode.VALIDATION_ERROR;
  }
}

function mapStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}

// ============================================================================
// Type-Safe Request Methods
// ============================================================================

/**
 * Make a GET request with typed response.
 */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<ApiResponse<T>>(url, config);
  if (!response.data.success || !response.data.data) {
    throw new ApiClientError(
      response.data.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' },
      response.status
    );
  }
  return response.data.data;
}

/**
 * Make a POST request with typed request and response.
 */
export async function post<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.post<ApiResponse<T>>(url, data, config);
  if (!response.data.success || !response.data.data) {
    throw new ApiClientError(
      response.data.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' },
      response.status
    );
  }
  return response.data.data;
}

/**
 * Make a PUT request with typed request and response.
 */
export async function put<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.put<ApiResponse<T>>(url, data, config);
  if (!response.data.success || !response.data.data) {
    throw new ApiClientError(
      response.data.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' },
      response.status
    );
  }
  return response.data.data;
}

/**
 * Make a PATCH request with typed request and response.
 */
export async function patch<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.patch<ApiResponse<T>>(url, data, config);
  if (!response.data.success || !response.data.data) {
    throw new ApiClientError(
      response.data.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' },
      response.status
    );
  }
  return response.data.data;
}

/**
 * Make a DELETE request with typed response.
 */
export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<ApiResponse<T>>(url, config);
  if (!response.data.success || !response.data.data) {
    throw new ApiClientError(
      response.data.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' },
      response.status
    );
  }
  return response.data.data;
}

// ============================================================================
// Exports
// ============================================================================

export { apiClient };
export default apiClient;
