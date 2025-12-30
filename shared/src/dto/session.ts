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
  createdAt: string; // ISO 8601
  updatedAt: string;

  // Partner info (minimal - just what's needed for display)
  partner: {
    id: string;
    name: string | null;
    nickname: string | null; // What I call my partner (set during invitation or later)
  };

  // Stage progress (both users)
  myProgress: StageProgressDTO;
  partnerProgress: StageProgressDTO;

  // Computed helpers for UI
  selfActionNeeded: string[]; // Gate keys the user still needs
  partnerActionNeeded: string[]; // Gate keys partner must satisfy to unlock next stage
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

  selfActionNeeded: string[];
  partnerActionNeeded: string[];
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
  // Either invite an existing person or provide a name
  personId?: string;

  // OR provide a display name for the new person
  inviteName?: string; // What you call them (nickname)

  // Optional: initial context
  context?: string; // What this session is about (private to creator)
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
  /** The crafted invitation message */
  invitationMessage?: string | null;
  /** Whether the user has confirmed the invitation message */
  messageConfirmed?: boolean;
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

export interface DeclineInvitationRequest {
  reason?: string;
}

export interface DeclineInvitationResponse {
  declined: boolean;
  declinedAt: string;
}

export interface ResendInvitationResponse {
  sent: boolean;
  sentAt: string;
  expiresAt: string;
}

// ============================================================================
// Partner Nickname
// ============================================================================

export interface UpdateNicknameRequest {
  nickname: string | null;
}

export interface UpdateNicknameResponse {
  nickname: string | null;
}
