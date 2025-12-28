/**
 * Consent DTOs
 *
 * Data Transfer Objects for the Consensual Bridge mechanism.
 *
 * FUTURE FEATURE: These DTOs define the planned consent system where users
 * explicitly control what data is shared with their partner through the
 * Consensual Bridge. See /docs/mvp-planning/plans/backend/api/consent.md
 * for the full API specification.
 *
 * Core principle: Nothing moves from UserVessel to SharedVessel without
 * explicit consent. The AI generates transformed content (heat removed,
 * need preserved), and users can review, edit, grant, deny, or revoke consent.
 *
 * Implementation status: DTOs defined, API endpoints not yet implemented.
 * These types are kept for future implementation of the consent flow.
 */

import { ConsentDecision, ConsentContentType } from '../enums';

// ============================================================================
// Consent Records
// ============================================================================

export interface ConsentRecordDTO {
  id: string;
  contentType: ConsentContentType;
  decision: ConsentDecision;
  decidedAt: string;
  revokedAt: string | null;

  // Description of what was consented (not the raw content)
  contentDescription: string;
}

// ============================================================================
// Consent Request (AI asks user to share something)
// ============================================================================

export interface ConsentRequestDTO {
  id: string;
  contentType: ConsentContentType;
  contentDescription: string;  // What the AI is asking to share

  // Preview of transformed content (what partner would see)
  transformedPreview: string;

  // Original content reference (for user to understand what's being shared)
  originalContentId: string;
  originalContentSummary: string;
}

export interface RequestConsentRequest {
  sessionId: string;
  contentType: ConsentContentType;
  originalContentId: string;
}

export interface RequestConsentResponse {
  consentRequest: ConsentRequestDTO;
}

// ============================================================================
// Consent Decision
// ============================================================================

export interface DecideConsentRequest {
  sessionId: string;
  consentRequestId: string;
  decision: ConsentDecision.GRANTED | ConsentDecision.DENIED;

  // Optional: user can edit the transformed content before sharing
  editedContent?: string;
}

export interface DecideConsentResponse {
  recorded: boolean;
  consentRecord: ConsentRecordDTO;

  // If granted, what was shared (transformed)
  sharedContent?: ConsentedContentDTO;
}

// ============================================================================
// Consented Content (what partner can see)
// ============================================================================

export interface ConsentedContentDTO {
  id: string;
  sourceUserId: string;
  transformedContent: string;  // Heat removed, need preserved
  consentedAt: string;
  consentActive: boolean;
}

// ============================================================================
// Consent Revocation
// ============================================================================

export interface RevokeConsentRequest {
  sessionId: string;
  consentRecordId: string;
}

export interface RevokeConsentResponse {
  revoked: boolean;
  revokedAt: string;

  // Note: revocation is permanent for this content
  // Partner will no longer see this content
}

// ============================================================================
// Pending Consents (for UI to show what needs decision)
// ============================================================================

export interface GetPendingConsentsRequest {
  sessionId: string;
}

export interface GetPendingConsentsResponse {
  pendingRequests: ConsentRequestDTO[];
}
