/**
 * Shared Enums for Meet Without Fear
 *
 * These mirror the Prisma enums but are available to both backend and mobile
 * without requiring the Prisma client.
 */

// ============================================================================
// Session Lifecycle
// ============================================================================

export enum SessionStatus {
  CREATED = 'CREATED', // Session created, invitation not yet sent
  INVITED = 'INVITED', // Partner invited, awaiting acceptance
  ACTIVE = 'ACTIVE', // Both users engaged
  PAUSED = 'PAUSED', // Cooling period or temporary pause
  WAITING = 'WAITING', // One user ahead, waiting for other
  RESOLVED = 'RESOLVED', // Process completed successfully
  ABANDONED = 'ABANDONED', // Timeout or withdrawal
}

export enum StageStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  GATE_PENDING = 'GATE_PENDING', // Requirements met, awaiting partner
  COMPLETED = 'COMPLETED',
}

// ============================================================================
// Stage Definitions
// ============================================================================

export enum Stage {
  ONBOARDING = 0,
  WITNESS = 1,
  PERSPECTIVE_STRETCH = 2,
  NEED_MAPPING = 3,
  STRATEGIC_REPAIR = 4,
}

export const STAGE_NAMES: Record<Stage, string> = {
  [Stage.ONBOARDING]: 'Onboarding',
  [Stage.WITNESS]: 'The Witness',
  [Stage.PERSPECTIVE_STRETCH]: 'Perspective Stretch',
  [Stage.NEED_MAPPING]: 'Need Mapping',
  [Stage.STRATEGIC_REPAIR]: 'Strategic Repair',
};

// ============================================================================
// User & Content
// ============================================================================

export enum MessageRole {
  USER = 'USER',
  AI = 'AI',
  SYSTEM = 'SYSTEM',
}

export enum Attribution {
  SELF = 'SELF',
  OTHER = 'OTHER',
  MUTUAL = 'MUTUAL',
  EXTERNAL = 'EXTERNAL',
}

export enum NeedCategory {
  SAFETY = 'SAFETY',
  CONNECTION = 'CONNECTION',
  AUTONOMY = 'AUTONOMY',
  RECOGNITION = 'RECOGNITION',
  MEANING = 'MEANING',
  FAIRNESS = 'FAIRNESS',
}

// ============================================================================
// Consent
// ============================================================================

export enum ConsentDecision {
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
  REVOKED = 'REVOKED',
}

export enum ConsentContentType {
  IDENTIFIED_NEED = 'IDENTIFIED_NEED',
  EVENT_SUMMARY = 'EVENT_SUMMARY',
  EMOTIONAL_PATTERN = 'EMOTIONAL_PATTERN',
  BOUNDARY = 'BOUNDARY',
  EMPATHY_DRAFT = 'EMPATHY_DRAFT',
  EMPATHY_ATTEMPT = 'EMPATHY_ATTEMPT',
  STRATEGY_PROPOSAL = 'STRATEGY_PROPOSAL',
}

// ============================================================================
// Agreements (Stage 4)
// ============================================================================

export enum AgreementType {
  MICRO_EXPERIMENT = 'MICRO_EXPERIMENT', // Small, reversible action
  COMMITMENT = 'COMMITMENT', // Longer-term agreement
  CHECK_IN = 'CHECK_IN', // Scheduled follow-up
  HYBRID = 'HYBRID', // Combined elements from multiple strategies
}

export enum AgreementStatus {
  PROPOSED = 'PROPOSED',
  AGREED = 'AGREED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

// ============================================================================
// Global Library
// ============================================================================

export enum GlobalLibrarySource {
  CURATED = 'CURATED', // Admin/expert authored
  CONTRIBUTED = 'CONTRIBUTED', // User-contributed with explicit consent
}
