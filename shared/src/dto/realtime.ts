/**
 * Realtime DTOs
 *
 * Data Transfer Objects for real-time WebSocket events between partners.
 */

// ============================================================================
// Partner Presence
// ============================================================================

export enum PresenceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  AWAY = 'AWAY',
}

export interface PresenceData {
  userId: string;
  status: PresenceStatus;
  lastSeen: number;
  currentStage?: number;
}

export interface PartnerPresenceEvent {
  type: 'presence';
  userId: string;
  status: PresenceStatus;
  timestamp: number;
}

// ============================================================================
// Typing Indicators
// ============================================================================

export interface TypingEvent {
  type: 'typing';
  userId: string;
  sessionId: string;
  isTyping: boolean;
  timestamp: number;
}

// ============================================================================
// Stage Progress
// ============================================================================

export interface StageProgressEvent {
  type: 'stage_progress';
  userId: string;
  sessionId: string;
  stage: number;
  status: 'in_progress' | 'gate_pending' | 'completed';
  timestamp: number;
}

// ============================================================================
// Session State Updates
// ============================================================================

export interface SessionStateEvent {
  type: 'session_state';
  sessionId: string;
  state: 'active' | 'paused' | 'waiting' | 'resolved';
  pausedBy?: string;
  reason?: string;
  timestamp: number;
}

// ============================================================================
// Session Events (existing + enhanced)
// ============================================================================

export type SessionEventType =
  // Partner actions
  | 'partner.signed_compact'
  | 'partner.stage_completed'
  | 'partner.advanced'
  | 'partner.empathy_shared'
  | 'partner.needs_shared'
  | 'partner.common_ground_confirmed'
  | 'partner.ranking_submitted'
  | 'partner.ready_to_rank'
  | 'partner.consent_granted'
  | 'partner.consent_revoked'
  // Agreements
  | 'agreement.proposed'
  | 'agreement.confirmed'
  // Session lifecycle
  | 'session.joined'
  | 'session.paused'
  | 'session.resumed'
  | 'session.resolved'
  // Invitations
  | 'invitation.declined'
  // Presence (new)
  | 'presence.online'
  | 'presence.offline'
  | 'presence.away'
  // Typing (new)
  | 'typing.start'
  | 'typing.stop'
  // Stage sync (new)
  | 'stage.progress'
  | 'stage.waiting';

export interface SessionEventData {
  sessionId: string;
  userId?: string;
  stage?: number;
  timestamp: number;
  excludeUserId?: string;
  [key: string]: unknown;
}

// ============================================================================
// Realtime Channel Names
// ============================================================================

export const REALTIME_CHANNELS = {
  /** Main session channel for events */
  session: (sessionId: string) => `beheard:session:${sessionId}`,
  /** Presence channel for a session */
  presence: (sessionId: string) => `beheard:session:${sessionId}`,
  /** User's private channel */
  user: (userId: string) => `beheard:user:${userId}`,
} as const;

// ============================================================================
// Realtime Event Payloads
// ============================================================================

export interface RealtimeEventBase {
  sessionId: string;
  timestamp: number;
}

export interface PartnerOnlinePayload extends RealtimeEventBase {
  userId: string;
  name?: string;
}

export interface PartnerTypingPayload extends RealtimeEventBase {
  userId: string;
  isTyping: boolean;
}

export interface StageUpdatePayload extends RealtimeEventBase {
  userId: string;
  stage: number;
  status: 'in_progress' | 'gate_pending' | 'completed';
}

export interface SessionPausedPayload extends RealtimeEventBase {
  pausedBy: string;
  reason?: string;
}

export interface SessionResumedPayload extends RealtimeEventBase {
  resumedBy: string;
}

// ============================================================================
// Aggregate Realtime Event Type
// ============================================================================

export type RealtimeEvent =
  | { event: 'presence.online'; data: PartnerOnlinePayload }
  | { event: 'presence.offline'; data: PartnerOnlinePayload }
  | { event: 'typing.start'; data: PartnerTypingPayload }
  | { event: 'typing.stop'; data: PartnerTypingPayload }
  | { event: 'stage.progress'; data: StageUpdatePayload }
  | { event: 'stage.waiting'; data: StageUpdatePayload }
  | { event: 'session.paused'; data: SessionPausedPayload }
  | { event: 'session.resumed'; data: SessionResumedPayload }
  | { event: SessionEventType; data: SessionEventData };

// ============================================================================
// Connection Status
// ============================================================================

export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  SUSPENDED = 'suspended',
  FAILED = 'failed',
}

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  lastConnected?: number;
  reconnectAttempts: number;
}
