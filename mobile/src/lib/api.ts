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

// Get base URL and ensure it has /api suffix
const rawApiUrl =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000';

const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

const REQUEST_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Token Provider Interface
// ============================================================================

/**
 * Interface for providing authentication tokens.
 * This will be implemented by Clerk or other auth providers.
 */
export interface TokenProvider {
  getToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
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
// Token Validation
// ============================================================================

/**
 * Validates that a token has valid JWT format (three dot-separated parts).
 * Does not validate the token signature or claims, just the structure.
 */
function isValidJwtFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Each part should be non-empty and be valid base64url
  return parts.every((part) => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
}

// Track if we've already logged an invalid token warning to avoid spam
let hasLoggedInvalidToken = false;

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
          // Validate JWT format before sending to prevent backend errors
          if (isValidJwtFormat(token)) {
            config.headers.Authorization = `Bearer ${token}`;
            hasLoggedInvalidToken = false; // Reset on successful token
          } else {
            // Log once to avoid spam, then skip adding invalid token
            if (!hasLoggedInvalidToken) {
              console.warn(
                '[API] Invalid JWT format from token provider. Token will not be sent.',
                'Token starts with:',
                token.substring(0, 20) + '...'
              );
              hasLoggedInvalidToken = true;
            }
            // Don't add Authorization header - request will go through unauthenticated
            // This allows the 401 handler to properly trigger sign-in flow
          }
        }
      } catch (error) {
        console.warn('[API] Failed to get auth token:', error);
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ============================================================================
// Response Interceptor - Handle Errors with Token Refresh Retry
// ============================================================================

// Track retry attempts to prevent infinite loops
const RETRY_KEY = '__isRetry';
const INVALID_TOKEN_KEY = '__hasInvalidToken';

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      [RETRY_KEY]?: boolean;
      [INVALID_TOKEN_KEY]?: boolean;
    };

    if (error.response) {
      const { status, data } = error.response;

      // Handle 401 with automatic retry after token refresh
      // Skip retry if we already tried or if we know the token is invalid
      if (
        status === 401 &&
        originalRequest &&
        !originalRequest[RETRY_KEY] &&
        !originalRequest[INVALID_TOKEN_KEY]
      ) {
        originalRequest[RETRY_KEY] = true;

        // Attempt to get a fresh token from Clerk (force refresh to bypass cache)
        if (tokenProvider) {
          try {
            const freshToken = await tokenProvider.getToken({ forceRefresh: true });
            if (freshToken) {
              // Validate the fresh token before retrying
              if (isValidJwtFormat(freshToken)) {
                // Update the request with fresh token and retry
                originalRequest.headers.Authorization = `Bearer ${freshToken}`;
                return apiClient(originalRequest);
              } else {
                // Fresh token is also invalid - don't retry, user needs to re-auth
                console.warn(
                  '[API] Fresh token from provider is also invalid. User needs to sign in again.'
                );
                originalRequest[INVALID_TOKEN_KEY] = true;
              }
            }
          } catch (refreshError) {
            console.warn('[API] Failed to refresh auth token:', refreshError);
          }
        }

        // If we couldn't refresh or token is invalid, the user needs to re-authenticate
        console.warn('[API] Unauthorized - session may have expired, please sign in again');
      }

      // Create standardized API error
      const apiError: ApiError = data?.error || {
        code: mapStatusToErrorCode(status),
        message: error.message || 'An error occurred',
      };

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
