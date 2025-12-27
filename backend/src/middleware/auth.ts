/**
 * Authentication Middleware
 *
 * Clerk-based authentication for all environments.
 * Requires CLERK_SECRET_KEY to be configured.
 */

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from './errors';
import { prisma } from '../lib/prisma';
import { ApiResponse, ErrorCode } from '@be-heard/shared';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  id: string;
  clerkId: string | null;
  email: string;
  name: string | null;
  pushToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clerkUserId?: string;
    }
  }
}

// ============================================================================
// Clerk Authentication
// ============================================================================

/**
 * Verifies Clerk JWT and returns the user ID
 */
async function verifyClerkToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const { verifyToken } = await import('@clerk/express');
    const token = authHeader.slice(7);
    const session = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return session.sub;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Auth] Clerk token verification failed:', error);
    }
    return null;
  }
}

/**
 * Clerk authentication handler
 */
async function handleClerkAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  required: boolean
): Promise<void> {
  // Check Clerk is configured
  if (!process.env.CLERK_SECRET_KEY) {
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Authentication not configured: set CLERK_SECRET_KEY',
      },
    };
    res.status(500).json(response);
    return;
  }

  const clerkUserId = await verifyClerkToken(req);

  if (!clerkUserId) {
    if (required) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      };
      res.status(401).json(response);
      return;
    }
    next();
    return;
  }

  try {
    // Upsert user based on Clerk ID
    const user = await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {},
      create: {
        clerkId: clerkUserId,
        email: `${clerkUserId}@pending.clerk`, // Placeholder, updated on first profile fetch
        name: null,
      },
    });

    req.user = user;
    req.clerkUserId = clerkUserId;
    next();
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Middleware Exports
// ============================================================================

/**
 * Requires authentication - returns 401 if not authenticated
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await handleClerkAuth(req, res, next, true);
}

/**
 * Optional authentication - populates req.user if authenticated, continues if not
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await handleClerkAuth(req, res, next, false);
}

/**
 * Gets the current authenticated user or throws
 */
export function getUser(req: Request): AuthUser {
  if (!req.user) {
    throw new UnauthorizedError('No authenticated user');
  }
  return req.user;
}

/**
 * Checks if the current user has access to a relationship
 */
export async function requireRelationshipAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError();
  }

  const relationshipId = req.params.relationshipId;
  if (!relationshipId) {
    next();
    return;
  }

  try {
    const membership = await prisma.relationshipMember.findFirst({
      where: {
        relationshipId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access to this relationship denied');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Checks if the current user has access to a session
 */
export async function requireSessionAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError();
  }

  const sessionId = req.params.sessionId;
  if (!sessionId) {
    next();
    return;
  }

  try {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    });

    if (!session) {
      throw new ForbiddenError('Access to this session denied');
    }

    next();
  } catch (error) {
    next(error);
  }
}
