/**
 * Inner Work Session DTOs
 *
 * Data Transfer Objects for inner work (solo self-reflection) sessions.
 */

// ============================================================================
// Inner Work Status
// ============================================================================

export enum InnerWorkStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

// ============================================================================
// Inner Work Session Summary (for lists)
// ============================================================================

export interface InnerWorkSessionSummaryDTO {
  id: string;
  title: string | null;
  summary: string | null;
  theme: string | null;
  status: InnerWorkStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
  messageCount: number;
}

// ============================================================================
// Inner Work Session Detail
// ============================================================================

export interface InnerWorkSessionDetailDTO extends InnerWorkSessionSummaryDTO {
  messages: InnerWorkMessageDTO[];
}

export interface InnerWorkMessageDTO {
  id: string;
  role: 'USER' | 'AI';
  content: string;
  timestamp: string; // ISO 8601
}

// ============================================================================
// Create Inner Work Session
// ============================================================================

export interface CreateInnerWorkSessionRequest {
  title?: string; // Optional user-provided title
}

export interface CreateInnerWorkSessionResponse {
  session: InnerWorkSessionSummaryDTO;
  initialMessage: InnerWorkMessageDTO;
}

// ============================================================================
// Send Inner Work Message
// ============================================================================

export interface SendInnerWorkMessageRequest {
  content: string;
}

export interface SendInnerWorkMessageResponse {
  userMessage: InnerWorkMessageDTO;
  aiMessage: InnerWorkMessageDTO;
}

// ============================================================================
// List Inner Work Sessions
// ============================================================================

export interface ListInnerWorkSessionsResponse {
  sessions: InnerWorkSessionSummaryDTO[];
}

// ============================================================================
// Get Inner Work Session
// ============================================================================

export interface GetInnerWorkSessionResponse {
  session: InnerWorkSessionDetailDTO;
}

// ============================================================================
// Update Inner Work Session
// ============================================================================

export interface UpdateInnerWorkSessionRequest {
  title?: string;
  status?: InnerWorkStatus;
}

export interface UpdateInnerWorkSessionResponse {
  session: InnerWorkSessionSummaryDTO;
}

// ============================================================================
// Archive Inner Work Session
// ============================================================================

export interface ArchiveInnerWorkSessionResponse {
  archived: boolean;
  archivedAt: string;
}
