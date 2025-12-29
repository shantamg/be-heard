/**
 * Chat Router Types
 *
 * Core types for the extensible chat router system.
 */

import { ChatIntent, IntentDetectionResult, SessionSummaryDTO } from '@be-heard/shared';
import { Request } from 'express';

// ============================================================================
// Intent Handler Interface
// ============================================================================

/**
 * Context passed to intent handlers
 */
export interface IntentHandlerContext {
  userId: string;
  message: string;
  intent: IntentDetectionResult;
  activeSession?: {
    id: string;
    partnerName?: string;
  };
  req: Request;
}

/**
 * Result from an intent handler
 */
export interface IntentHandlerResult {
  /** The type of action taken */
  actionType: string;

  /** Message to display to user */
  message: string;

  /** Optional action buttons */
  actions?: Array<{
    id: string;
    label: string;
    type: 'confirm' | 'cancel' | 'select';
    payload?: Record<string, unknown>;
  }>;

  /** If a session was created or switched */
  sessionChange?: {
    type: 'created' | 'switched';
    sessionId: string;
    session: SessionSummaryDTO;
  };

  /** If the message should be passed to session handler */
  passThrough?: {
    sessionId: string;
  };

  /** Additional data for the client */
  data?: Record<string, unknown>;
}

/**
 * Interface for intent handlers
 * Implement this to add new capabilities to the chat router
 */
export interface IntentHandler {
  /** Unique identifier for this handler */
  readonly id: string;

  /** Display name for debugging */
  readonly name: string;

  /** Intents this handler can process */
  readonly supportedIntents: ChatIntent[];

  /**
   * Priority (higher = checked first)
   * Use for handlers that need to intercept certain messages
   */
  readonly priority: number;

  /**
   * Check if this handler can process the given context
   * Return false to skip to next handler
   */
  canHandle(context: IntentHandlerContext): boolean | Promise<boolean>;

  /**
   * Process the intent and return a result
   */
  handle(context: IntentHandlerContext): Promise<IntentHandlerResult>;

  /**
   * Optional: Clean up any state for this user
   */
  cleanup?(userId: string): void | Promise<void>;
}

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Registry of intent handlers
 */
export interface IntentHandlerRegistry {
  /** Register a new handler */
  register(handler: IntentHandler): void;

  /** Unregister a handler */
  unregister(handlerId: string): void;

  /** Get all handlers for an intent, sorted by priority */
  getHandlers(intent: ChatIntent): IntentHandler[];

  /** Get all registered handlers */
  getAllHandlers(): IntentHandler[];
}

// ============================================================================
// Intent Detection Plugin
// ============================================================================

/**
 * Additional intents that can be detected
 * Plugins can extend the base intent detection
 */
export interface IntentDetectionPlugin {
  /** Unique identifier */
  readonly id: string;

  /** Additional intents this plugin can detect */
  readonly detectableIntents: string[];

  /**
   * Keywords or patterns that suggest this intent
   * Used to augment the AI prompt
   */
  getDetectionHints(): IntentDetectionHint[];

  /**
   * Post-process the detected intent
   * Can modify or enhance the result
   */
  postProcess?(result: IntentDetectionResult): IntentDetectionResult;
}

export interface IntentDetectionHint {
  intent: string;
  keywords: string[];
  examples: string[];
  description: string;
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Generic state store for handlers that need multi-turn state
 */
export interface HandlerStateStore<T> {
  get(userId: string): T | undefined;
  set(userId: string, state: T): void;
  update(userId: string, updates: Partial<T>): T;
  delete(userId: string): void;
  has(userId: string): boolean;
}

/**
 * Create a simple in-memory state store
 */
export function createStateStore<T>(): HandlerStateStore<T> {
  const store = new Map<string, T>();

  return {
    get: (userId) => store.get(userId),
    set: (userId, state) => store.set(userId, state),
    update: (userId, updates) => {
      const existing = store.get(userId);
      const updated = { ...existing, ...updates } as T;
      store.set(userId, updated);
      return updated;
    },
    delete: (userId) => store.delete(userId),
    has: (userId) => store.has(userId),
  };
}
