/**
 * Session DTOs
 *
 * Data Transfer Objects for session-related API operations.
 */

import { SessionStatus, Stage, StageStatus } from '../enums';

// ============================================================================
// Session Summary (for lists and cards)
// ============================================================================

export interface SessionSummaryDTO {
  id: string;
  relationshipId: string;
  status: SessionStatus;
  createdAt: string;  // ISO 8601
  updatedAt: string;

  // Partner info (minimal - just what's needed for display)
  partner: {
    id: string;
    name: string | null;
  };

  // Stage progress (both users)
  myProgress: StageProgressDTO;
  partnerProgress: StageProgressDTO;

  // Computed helpers for UI
  isMyTurn: boolean;
  waitingOnPartner: boolean;
}

export interface StageProgressDTO {
  stage: Stage;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
}

// ============================================================================
// Session Detail (full session view)
// ============================================================================

export interface SessionDetailDTO extends SessionSummaryDTO {
  // Relationship context
  relationship: {
    id: string;
    createdAt: string;
    sessionCount: number;
  };

  // Stage gate status (for current stage)
  currentGates: StageGateDTO[];

  // Resolution info (if resolved)
  resolvedAt: string | null;
}

export interface StageGateDTO {
  id: string;
  description: string;
  satisfied: boolean;
  requiredForAdvance: boolean;
}

// ============================================================================
// Session Creation
// ============================================================================

export interface CreateSessionRequest {
  // Either invite an existing person or invite by contact info
  personId?: string;

  // OR invite by contact
  inviteEmail?: string;
  invitePhone?: string;
  inviteName?: string;  // Display name for the invitation

  // Optional: initial context
  context?: string;  // What this session is about (private to creator)
}

export interface CreateSessionResponse {
  session: SessionSummaryDTO;
  invitationId: string;
  invitationUrl: string;
}

// ============================================================================
// Session Invitation
// ============================================================================

export interface InvitationDTO {
  id: string;
  sessionId: string;
  invitedBy: {
    id: string;
    name: string | null;
  };
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export interface AcceptInvitationRequest {
  invitationId: string;
}

export interface AcceptInvitationResponse {
  session: SessionSummaryDTO;
}
