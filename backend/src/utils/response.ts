/**
 * Response Helper Utilities
 *
 * Centralized response formatting for consistent API responses across all controllers.
 */

import { Response } from 'express';
import { ApiResponse } from '@be-heard/shared';

/**
 * Send a successful API response
 */
export function successResponse<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data } as ApiResponse<T>);
}

/**
 * Send an error API response
 */
export function errorResponse(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
): void {
  res.status(status).json({
    success: false,
    error: { code, message, details },
  } as ApiResponse<never>);
}
