/**
 * API Response Types for BeHeard
 *
 * Standard response wrappers and error types for all API endpoints.
 */

// ============================================================================
// Standard API Response Wrapper
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export enum ErrorCode {
  // Auth errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_STAGE = 'INVALID_STAGE',
  GATE_NOT_SATISFIED = 'GATE_NOT_SATISFIED',

  // Consent errors
  CONSENT_REQUIRED = 'CONSENT_REQUIRED',
  CONSENT_REVOKED = 'CONSENT_REVOKED',

  // Session errors
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  PARTNER_NOT_READY = 'PARTNER_NOT_READY',
  INVITATION_EXPIRED = 'INVITATION_EXPIRED',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// ============================================================================
// Pagination
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}
