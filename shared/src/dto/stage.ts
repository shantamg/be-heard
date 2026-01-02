/**
 * Stage DTOs
 *
 * Data Transfer Objects for stage progression and gate validation.
 */

import { Stage, StageStatus } from '../enums';

// ============================================================================
// Stage Progress
// ============================================================================

export interface StageProgressDetailDTO {
  stage: Stage;
  status: StageStatus;
  startedAt: string;
  completedAt: string | null;

  // Gate satisfaction details
  gates: GateSatisfactionDTO;
}

export interface PartnerStageStatusDTO {
  stage: Stage;
  status: StageStatus;
  // Note: we don't expose partner's gate details - just overall status
}

// ============================================================================
// Gate Satisfaction
// ============================================================================

/**
 * Gate satisfaction varies by stage. Each stage has specific requirements.
 */
export type GateSatisfactionDTO = Stage0Gates | Stage1Gates | Stage2Gates | Stage3Gates | Stage4Gates;

export interface Stage0Gates {
  stage: Stage.ONBOARDING;
  compactSigned: boolean;
  compactSignedAt: string | null;
  partnerCompactSigned: boolean;
}

export interface Stage1Gates {
  stage: Stage.WITNESS;
  feelHeardConfirmed: boolean;
  feelHeardConfirmedAt: string | null;
  finalEmotionalReading: number | null; // 1-10
}

export interface Stage2Gates {
  stage: Stage.PERSPECTIVE_STRETCH;
  empathyDraftReady: boolean;
  empathyConsented: boolean;
  partnerConsented: boolean;
  partnerValidated: boolean;
}

export interface Stage3Gates {
  stage: Stage.NEED_MAPPING;
  needsConfirmed: boolean;
  partnerNeedsConfirmed: boolean;
  commonGroundConfirmed: boolean;
}

export interface Stage4Gates {
  stage: Stage.STRATEGIC_REPAIR;
  strategiesSubmitted: boolean;
  rankingsSubmitted: boolean;
  overlapIdentified: boolean;
  agreementCreated: boolean;
}

// ============================================================================
// Stage Advancement
// ============================================================================

export interface AdvanceStageRequest {
  sessionId: string;
  fromStage: Stage;
  toStage: Stage;
}

export interface AdvanceStageResponse {
  success: boolean;
  newProgress: StageProgressDetailDTO;

  // If advancement failed, explain why
  blockedReason?: StageBlockedReason;
  unsatisfiedGates?: string[];
}

export enum StageBlockedReason {
  GATES_NOT_SATISFIED = 'GATES_NOT_SATISFIED',
  PARTNER_NOT_READY = 'PARTNER_NOT_READY',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  INVALID_STAGE_TRANSITION = 'INVALID_STAGE_TRANSITION',
}

// ============================================================================
// Stage Progress (API Responses)
// ============================================================================

/** Milestone timestamps that persist across stage transitions */
export interface SessionMilestonesDTO {
  feelHeardConfirmedAt: string | null;
}

export interface GetProgressResponse {
  sessionId: string;
  myProgress: StageProgressDetailDTO;
  partnerProgress: PartnerStageStatusDTO;
  canAdvance: boolean;
  advanceBlockedReason?: StageBlockedReason;
  milestones?: SessionMilestonesDTO;
}

// ============================================================================
// Stage 0: Curiosity Compact
// ============================================================================

export interface SignCompactRequest {
  sessionId: string;
}

export interface SignCompactResponse {
  signed: boolean;
  signedAt: string;
  partnerSigned: boolean;
  canAdvance: boolean;
}

export interface CompactStatusResponse {
  mySigned: boolean;
  mySignedAt: string | null;
  partnerSigned: boolean;
  partnerSignedAt: string | null;
  canAdvance: boolean;
}

// ============================================================================
// Stage 1: Feel Heard Confirmation
// ============================================================================

export interface ConfirmFeelHeardRequest {
  sessionId: string;
  confirmed: boolean; // false = "not yet"
}

export interface ConfirmFeelHeardResponse {
  confirmed: boolean;
  confirmedAt: string | null;
  canAdvance: boolean;
  partnerCompleted: boolean;

  // Optional final emotional reading (stored when user completes stage)
  finalEmotionalReading?: number | null;

  // Transition message from AI when user confirms they feel heard
  transitionMessage?: {
    id: string;
    content: string;
    timestamp: string;
    stage: number;
  } | null;
}
