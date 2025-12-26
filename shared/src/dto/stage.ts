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
  sessionId: string;
  userId: string;
  stage: Stage;
  status: StageStatus;
  startedAt: string;
  completedAt: string | null;

  // Gate satisfaction details
  gates: GateSatisfactionDTO;

  // Partner status (limited info)
  partnerStatus: PartnerStageStatusDTO;
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
export type GateSatisfactionDTO =
  | Stage0Gates
  | Stage1Gates
  | Stage2Gates
  | Stage3Gates
  | Stage4Gates;

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
  finalEmotionalReading: number | null;  // 1-10
}

export interface Stage2Gates {
  stage: Stage.PERSPECTIVE_STRETCH;
  empathyAttemptCreated: boolean;
  empathyAttemptConsentedToShare: boolean;
  receivedPartnerAttempt: boolean;
  validatedPartnerAttempt: boolean;
  validatedAt: string | null;
}

export interface Stage3Gates {
  stage: Stage.NEED_MAPPING;
  needsIdentified: boolean;
  needsConfirmed: boolean;
  needsConsentedToShare: boolean;
  commonGroundIdentified: boolean;
}

export interface Stage4Gates {
  stage: Stage.STRATEGIC_REPAIR;
  proposalsCreated: boolean;
  proposalsRanked: boolean;
  agreementReached: boolean;
  followUpScheduled: boolean;
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

// ============================================================================
// Stage 1: Feel Heard Confirmation
// ============================================================================

export interface ConfirmFeelHeardRequest {
  sessionId: string;
  confirmed: boolean;  // false = "not yet"
}

export interface ConfirmFeelHeardResponse {
  confirmed: boolean;
  confirmedAt: string | null;
  canAdvance: boolean;
  partnerCompleted: boolean;
}
