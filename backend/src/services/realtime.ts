import Ably from 'ably';
import { sendPushNotification } from './push';
import {
  SessionEventType,
  SessionEventData,
  PresenceStatus,
  REALTIME_CHANNELS,
} from '@be-heard/shared';

/**
 * Session events for real-time communication between partners.
 * Re-export from shared for backward compatibility.
 */
export type SessionEvent = Extract<
  SessionEventType,
  | 'partner.signed_compact'
  | 'partner.stage_completed'
  | 'partner.advanced'
  | 'partner.empathy_shared'
  | 'partner.needs_shared'
  | 'partner.ranking_submitted'
  | 'agreement.proposed'
  | 'agreement.confirmed'
  | 'session.joined'
  | 'session.paused'
  | 'session.resumed'
  | 'session.resolved'
  | 'invitation.declined'
>;

// Re-export for backward compatibility
export type { SessionEventData };

/**
 * Ably client singleton.
 * Throws if ABLY_API_KEY is not configured.
 */
function getAblyClient(): Ably.Rest {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error('ABLY_API_KEY not configured - realtime features require Ably');
  }
  return new Ably.Rest(apiKey);
}

// Lazy-initialized Ably client
let ablyClient: Ably.Rest | undefined;

function getAbly(): Ably.Rest {
  if (ablyClient === undefined) {
    ablyClient = getAblyClient();
  }
  return ablyClient;
}

/**
 * Reset the Ably client (useful for testing).
 */
export function resetAblyClient(): void {
  ablyClient = undefined;
}

// ============================================================================
// Typing Indicator State (in-memory for now, could be Redis)
// ============================================================================

interface TypingState {
  isTyping: boolean;
  lastUpdate: number;
}

const typingStates = new Map<string, TypingState>();

/**
 * Get the typing state key for a user in a session.
 */
function getTypingKey(sessionId: string, userId: string): string {
  return `${sessionId}:${userId}`;
}

/**
 * Typing indicator timeout in milliseconds.
 * After this time without updates, typing is considered stopped.
 */
const TYPING_TIMEOUT = 5000;

// ============================================================================
// Core Event Publishing
// ============================================================================

/**
 * Publishes a session event to the Ably channel for the given session.
 *
 * @param sessionId - The session ID to publish to
 * @param event - The event type to publish
 * @param data - The event data payload
 * @param excludeUserId - Optional user ID to exclude from receiving the event
 * @returns Promise<void>
 */
export async function publishSessionEvent(
  sessionId: string,
  event: SessionEvent | SessionEventType,
  data: Record<string, unknown>,
  excludeUserId?: string
): Promise<void> {
  const ably = getAbly();

  const eventData: SessionEventData = {
    sessionId,
    timestamp: Date.now(),
    excludeUserId,
    ...data,
  };

  try {
    const channel = ably.channels.get(REALTIME_CHANNELS.session(sessionId));
    await channel.publish(event, eventData);
    console.log(`[Realtime] Published ${event} to session ${sessionId}`);
  } catch (error) {
    console.error(`[Realtime] Failed to publish ${event} to session ${sessionId}:`, error);
    throw error;
  }
}

// ============================================================================
// Presence Management
// ============================================================================

/**
 * Checks if a user is present (online) in a session's presence channel.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID to check
 * @returns Promise<boolean> - true if user is present
 */
export async function isUserPresent(sessionId: string, userId: string): Promise<boolean> {
  const ably = getAbly();

  try {
    const presenceChannel = ably.channels.get(REALTIME_CHANNELS.session(sessionId));
    const presenceResult = await presenceChannel.presence.get();
    // Ably v2 returns a PaginatedResult, need to access .items
    const members = presenceResult.items || [];
    return members.some((m: Ably.PresenceMessage) => m.clientId === userId);
  } catch (error) {
    console.error(`[Realtime] Failed to check presence for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get all present users in a session.
 *
 * @param sessionId - The session ID
 * @returns Promise<string[]> - Array of user IDs currently present
 */
export async function getSessionPresence(sessionId: string): Promise<string[]> {
  const ably = getAbly();

  try {
    const presenceChannel = ably.channels.get(REALTIME_CHANNELS.session(sessionId));
    const presenceResult = await presenceChannel.presence.get();
    const members = presenceResult.items || [];
    return members.map((m: Ably.PresenceMessage) => m.clientId).filter(Boolean) as string[];
  } catch (error) {
    console.error(`[Realtime] Failed to get presence for session ${sessionId}:`, error);
    return [];
  }
}

/**
 * Publish a presence update for a user.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID
 * @param status - The presence status
 * @param userName - Optional user name
 */
export async function publishPresenceUpdate(
  sessionId: string,
  userId: string,
  status: PresenceStatus,
  userName?: string
): Promise<void> {
  const event = status === PresenceStatus.ONLINE
    ? 'presence.online'
    : status === PresenceStatus.OFFLINE
      ? 'presence.offline'
      : 'presence.away';

  await publishSessionEvent(sessionId, event, {
    userId,
    name: userName,
    status,
  });
}

// ============================================================================
// Typing Indicators
// ============================================================================

/**
 * Publish a typing indicator update.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID who is typing
 * @param isTyping - Whether the user is typing
 */
export async function publishTypingIndicator(
  sessionId: string,
  userId: string,
  isTyping: boolean
): Promise<void> {
  const key = getTypingKey(sessionId, userId);
  const currentState = typingStates.get(key);

  // Debounce: only publish if state actually changed
  if (currentState?.isTyping === isTyping) {
    typingStates.set(key, { isTyping, lastUpdate: Date.now() });
    return;
  }

  typingStates.set(key, { isTyping, lastUpdate: Date.now() });

  const event = isTyping ? 'typing.start' : 'typing.stop';
  await publishSessionEvent(sessionId, event, {
    userId,
    isTyping,
  }, userId); // Exclude the typing user from receiving their own typing event
}

/**
 * Get typing state for a user in a session.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID
 * @returns The typing state or null if not found
 */
export function getTypingState(sessionId: string, userId: string): TypingState | null {
  const key = getTypingKey(sessionId, userId);
  const state = typingStates.get(key);

  if (!state) return null;

  // Check if typing has timed out
  if (state.isTyping && Date.now() - state.lastUpdate > TYPING_TIMEOUT) {
    typingStates.set(key, { isTyping: false, lastUpdate: Date.now() });
    return { isTyping: false, lastUpdate: Date.now() };
  }

  return state;
}

/**
 * Clear typing state for a user in a session.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID
 */
export function clearTypingState(sessionId: string, userId: string): void {
  const key = getTypingKey(sessionId, userId);
  typingStates.delete(key);
}

/**
 * Clear all typing states for a session.
 *
 * @param sessionId - The session ID
 */
export function clearSessionTypingStates(sessionId: string): void {
  for (const key of typingStates.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      typingStates.delete(key);
    }
  }
}

// ============================================================================
// Stage Progress Sync
// ============================================================================

/**
 * Publish a stage progress update to notify partner.
 *
 * @param sessionId - The session ID
 * @param userId - The user who progressed
 * @param stage - The current stage number
 * @param status - The stage status
 */
export async function publishStageProgress(
  sessionId: string,
  userId: string,
  stage: number,
  status: 'in_progress' | 'gate_pending' | 'completed'
): Promise<void> {
  await publishSessionEvent(sessionId, 'stage.progress', {
    userId,
    stage,
    status,
  }, userId);
}

/**
 * Publish a stage waiting notification when one partner is ahead.
 *
 * @param sessionId - The session ID
 * @param waitingUserId - The user who is waiting
 * @param stage - The stage they are waiting at
 */
export async function publishStageWaiting(
  sessionId: string,
  waitingUserId: string,
  stage: number
): Promise<void> {
  await publishSessionEvent(sessionId, 'stage.waiting', {
    userId: waitingUserId,
    stage,
    status: 'gate_pending',
  }, waitingUserId);
}

// ============================================================================
// Session State Updates
// ============================================================================

/**
 * Publish a session paused event.
 *
 * @param sessionId - The session ID
 * @param pausedByUserId - The user who paused the session
 * @param reason - Optional reason for pausing
 */
export async function publishSessionPaused(
  sessionId: string,
  pausedByUserId: string,
  reason?: string
): Promise<void> {
  await publishSessionEvent(sessionId, 'session.paused', {
    pausedBy: pausedByUserId,
    reason,
  });

  // Clear typing states when session is paused
  clearSessionTypingStates(sessionId);
}

/**
 * Publish a session resumed event.
 *
 * @param sessionId - The session ID
 * @param resumedByUserId - The user who resumed the session
 */
export async function publishSessionResumed(
  sessionId: string,
  resumedByUserId: string
): Promise<void> {
  await publishSessionEvent(sessionId, 'session.resumed', {
    resumedBy: resumedByUserId,
  });
}

/**
 * Publish a session resolved event.
 *
 * @param sessionId - The session ID
 * @param resolvedByUserId - The user who resolved the session
 */
export async function publishSessionResolved(
  sessionId: string,
  resolvedByUserId: string
): Promise<void> {
  await publishSessionEvent(sessionId, 'session.resolved', {
    resolvedBy: resolvedByUserId,
  });

  // Clear typing states when session is resolved
  clearSessionTypingStates(sessionId);
}

// ============================================================================
// Partner Notification (with fallback to push)
// ============================================================================

/**
 * Notifies a partner of a session event.
 * If the partner is online (present in the Ably channel), the event is published.
 * If the partner is offline, a push notification is sent instead.
 *
 * @param sessionId - The session ID
 * @param partnerId - The partner's user ID
 * @param event - The event type
 * @param data - The event data payload
 */
export async function notifyPartner(
  sessionId: string,
  partnerId: string,
  event: SessionEvent,
  data: Record<string, unknown>
): Promise<void> {
  const partnerPresent = await isUserPresent(sessionId, partnerId);

  if (partnerPresent) {
    // Partner is online - publish to Ably channel
    await publishSessionEvent(sessionId, event, data);
  } else {
    // Partner is offline - send push notification
    await sendPushNotification(partnerId, event, data, sessionId);
  }
}

/**
 * Notifies a partner and always publishes to Ably channel.
 * If partner is offline, also sends a push notification.
 *
 * @param sessionId - The session ID
 * @param partnerId - The partner's user ID
 * @param event - The event type
 * @param data - The event data payload
 */
export async function notifyPartnerWithFallback(
  sessionId: string,
  partnerId: string,
  event: SessionEvent,
  data: Record<string, unknown>
): Promise<void> {
  // Always publish to Ably for clients that might reconnect
  await publishSessionEvent(sessionId, event, data);

  // Also send push if partner is offline
  const partnerPresent = await isUserPresent(sessionId, partnerId);
  if (!partnerPresent) {
    await sendPushNotification(partnerId, event, data, sessionId);
  }
}

// ============================================================================
// Channel Names (re-export from shared)
// ============================================================================

/**
 * Get the Ably channel name for a session.
 *
 * @param sessionId - The session ID
 * @returns The Ably channel name
 */
export function getSessionChannelName(sessionId: string): string {
  return REALTIME_CHANNELS.session(sessionId);
}

/**
 * Get the Ably channel name for a user's private channel.
 *
 * @param userId - The user ID
 * @returns The Ably channel name
 */
export function getUserChannelName(userId: string): string {
  return REALTIME_CHANNELS.user(userId);
}
