/**
 * Chat Router DTOs
 *
 * Types for the AI message router that intercepts all chat messages
 * and determines intent, enabling conversational session creation
 * and dynamic context switching.
 */

import { SessionSummaryDTO } from './session';
import { MessageDTO } from './message';

// ============================================================================
// Intent Types
// ============================================================================

/**
 * All possible intents the chat router can detect
 */
export enum ChatIntent {
  // Session Management
  CREATE_SESSION = 'CREATE_SESSION',
  SWITCH_SESSION = 'SWITCH_SESSION',
  LIST_SESSIONS = 'LIST_SESSIONS',

  // Session Flow (within active session)
  CONTINUE_CONVERSATION = 'CONTINUE_CONVERSATION',

  // Information Requests
  CHECK_STATUS = 'CHECK_STATUS',
  HELP = 'HELP',

  // System
  UNKNOWN = 'UNKNOWN',
}

/**
 * Confidence level for intent detection
 */
export type IntentConfidence = 'high' | 'medium' | 'low';

// ============================================================================
// Extracted Entities
// ============================================================================

/**
 * Person info extracted from natural language
 */
export interface ExtractedPerson {
  firstName: string;
  lastName?: string;
  contactInfo?: {
    type: 'email' | 'phone';
    value: string;
  };
}

/**
 * Session context extracted from message
 */
export interface ExtractedSessionContext {
  topic?: string;
  emotionalTone?: 'neutral' | 'upset' | 'hopeful' | 'anxious';
}

// ============================================================================
// Intent Detection Result
// ============================================================================

/**
 * Result of intent detection by the small model
 */
export interface IntentDetectionResult {
  intent: ChatIntent;
  confidence: IntentConfidence;

  // Extracted entities based on intent
  person?: ExtractedPerson;
  sessionContext?: ExtractedSessionContext;
  sessionId?: string; // For switch/continue intents

  // What info is still needed to complete the action
  missingInfo?: MissingInfo[];

  // Suggested follow-up question if info is missing
  followUpQuestion?: string;
}

export interface MissingInfo {
  field: 'firstName' | 'lastName' | 'email' | 'phone' | 'sessionId';
  required: boolean;
  promptText: string;
}

// ============================================================================
// Chat Router Request/Response
// ============================================================================

/**
 * Request to the chat router endpoint
 */
export interface ChatRouterRequest {
  content: string;

  // Current context (if any)
  currentSessionId?: string;

  // Conversation history for context (last few messages)
  recentMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Response from the chat router
 */
export interface ChatRouterResponse {
  // The detected intent
  intent: IntentDetectionResult;

  // Action taken based on intent
  action: ChatRouterAction;
}

// ============================================================================
// Router Actions
// ============================================================================

export type ChatRouterAction =
  | CreateSessionAction
  | NeedMoreInfoAction
  | SwitchSessionAction
  | ContinueConversationAction
  | ListSessionsAction
  | HelpAction
  | FallbackAction;

/**
 * Action: Need more information to proceed
 */
export interface NeedMoreInfoAction {
  type: 'NEED_MORE_INFO';
  missingInfo: MissingInfo[];
  conversationalPrompt: string; // Natural language prompt for the missing info
  partialData?: Partial<ExtractedPerson>;
}

/**
 * Action: Create a new session (all required info gathered)
 */
export interface CreateSessionAction {
  type: 'CREATE_SESSION';
  session: SessionSummaryDTO;
  invitationId: string;
  invitationUrl: string;
  confirmationMessage: string; // "I've created a session with John. An invitation has been sent to john@example.com"
}

/**
 * Action: Switch to a different session
 */
export interface SwitchSessionAction {
  type: 'SWITCH_SESSION';
  sessionId: string;
  session: SessionSummaryDTO;
  confirmationMessage: string;
}

/**
 * Action: Continue within current session (pass through to regular message handler)
 */
export interface ContinueConversationAction {
  type: 'CONTINUE_CONVERSATION';
  sessionId: string;
  // The actual response will come from the session's message handler
  passThrough: true;
}

/**
 * Action: List available sessions
 */
export interface ListSessionsAction {
  type: 'LIST_SESSIONS';
  sessions: SessionSummaryDTO[];
  message: string; // Natural language summary
}

/**
 * Action: Provide help information
 */
export interface HelpAction {
  type: 'HELP';
  message: string;
  suggestions: string[];
}

/**
 * Action: Fallback when intent unclear
 */
export interface FallbackAction {
  type: 'FALLBACK';
  message: string;
  suggestions: string[];
}

// ============================================================================
// Conversation State (for multi-turn info gathering)
// ============================================================================

/**
 * State tracking for multi-turn session creation
 */
export interface SessionCreationState {
  step: 'GATHERING_PERSON' | 'GATHERING_CONTACT' | 'CONFIRMING' | 'COMPLETE';
  person: Partial<ExtractedPerson>;
  context?: ExtractedSessionContext;
  confirmedByUser: boolean;

  /**
   * Messages captured during session creation.
   * These are saved to the session when it's created.
   */
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

/**
 * Current chat context stored in the router
 */
export interface ChatContext {
  // Current active session (if any)
  activeSessionId?: string;

  // Pending session creation (if in progress)
  pendingSessionCreation?: SessionCreationState;

  // Recent conversation for context
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

// ============================================================================
// Unified Chat Message (for the main chat interface)
// ============================================================================

/**
 * A message in the unified chat interface
 * Can be from a session, system, or router
 */
export interface UnifiedChatMessage {
  id: string;
  type: 'session' | 'system' | 'router';
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;

  // Session context (if type === 'session')
  sessionId?: string;
  sessionPartnerName?: string;

  // Action buttons (for router messages)
  actions?: ChatMessageAction[];
}

export interface ChatMessageAction {
  id: string;
  label: string;
  type: 'confirm' | 'cancel' | 'select';
  payload?: Record<string, unknown>;
}

// ============================================================================
// Send Message to Unified Chat
// ============================================================================

/**
 * Request to send a message to the unified chat
 */
export interface SendUnifiedChatRequest {
  content: string;
  currentSessionId?: string;

  // If responding to an action
  actionResponse?: {
    actionId: string;
    payload?: Record<string, unknown>;
  };
}

/**
 * Response from sending to unified chat
 */
export interface SendUnifiedChatResponse {
  // The user's message
  userMessage: UnifiedChatMessage;

  // The assistant's response
  assistantResponse: UnifiedChatMessage;

  // If a session was created/switched
  sessionChange?: {
    type: 'created' | 'switched';
    sessionId: string;
    session: SessionSummaryDTO;
  };

  // If we need to pass through to session handler
  passThrough?: {
    sessionId: string;
    userMessage: MessageDTO;
    aiResponse: MessageDTO;
  };
}

// ============================================================================
// Chat Context
// ============================================================================

/**
 * Response from getting chat context
 */
export interface GetChatContextResponse {
  /** User's active sessions */
  activeSessions: SessionSummaryDTO[];

  /** Whether there's a pending session creation */
  hasPendingCreation: boolean;

  /** Current step in pending creation (if any) */
  pendingCreationStep?: 'GATHERING_PERSON' | 'GATHERING_CONTACT' | 'CONFIRMING' | 'COMPLETE';

  /** AI-generated welcome message based on user's recent activity */
  welcomeMessage?: string;
}
