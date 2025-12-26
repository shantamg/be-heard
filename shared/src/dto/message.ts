/**
 * Message DTOs
 *
 * Data Transfer Objects for chat messages and emotional barometer.
 */

import { MessageRole, Stage } from '../enums';

// ============================================================================
// Messages
// ============================================================================

export interface MessageDTO {
  id: string;
  sessionId: string;
  senderId: string | null;  // null for AI messages
  role: MessageRole;
  content: string;
  stage: Stage;
  timestamp: string;

  // For USER messages: was an emotion check included?
  emotionalReading?: EmotionalReadingDTO;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;

  // Optional: include emotional reading with message
  emotionalIntensity?: number;  // 1-10
  emotionalContext?: string;    // Optional description
}

export interface SendMessageResponse {
  userMessage: MessageDTO;
  aiResponse: MessageDTO;

  // If emotional intensity was high, AI might suggest a pause
  suggestPause?: boolean;
  pauseReason?: string;
}

// ============================================================================
// Emotional Barometer
// ============================================================================

export interface EmotionalReadingDTO {
  id: string;
  intensity: number;  // 1-10
  context: string | null;
  stage: Stage;
  timestamp: string;
}

export interface RecordEmotionalReadingRequest {
  sessionId: string;
  intensity: number;  // 1-10
  context?: string;
}

export interface RecordEmotionalReadingResponse {
  reading: EmotionalReadingDTO;

  // If intensity trending up, offer support
  offerSupport?: boolean;
  supportType?: EmotionalSupportType;
}

export enum EmotionalSupportType {
  BREATHING_EXERCISE = 'BREATHING_EXERCISE',
  BODY_SCAN = 'BODY_SCAN',
  GROUNDING = 'GROUNDING',
  PAUSE_SESSION = 'PAUSE_SESSION',
}

// ============================================================================
// Exercise Completion
// ============================================================================

export interface CompleteExerciseRequest {
  sessionId: string;
  exerciseType: EmotionalSupportType;
  completed: boolean;  // false = skipped
}

export interface CompleteExerciseResponse {
  logged: boolean;
  postExerciseCheckIn?: boolean;  // Should we ask for new reading?
}

// ============================================================================
// Chat History
// ============================================================================

export interface GetMessagesRequest {
  sessionId: string;
  stage?: Stage;  // Filter by stage
  cursor?: string;
  limit?: number;
}

export interface GetMessagesResponse {
  messages: MessageDTO[];
  cursor?: string;
  hasMore: boolean;
}
