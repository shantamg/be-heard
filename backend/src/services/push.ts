import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '../lib/prisma';
import type { SessionEvent } from './realtime';

/**
 * Expo SDK instance for sending push notifications.
 * Only created if we actually need to send notifications.
 */
let expoClient: Expo | null = null;

function getExpo(): Expo {
  if (!expoClient) {
    expoClient = new Expo();
  }
  return expoClient;
}

/**
 * Reset the Expo client (useful for testing).
 */
export function resetExpoClient(): void {
  expoClient = null;
}

/**
 * Push notification message templates for each session event type.
 * Each event has a user-friendly title and body message.
 */
export const PUSH_MESSAGES: Record<SessionEvent, { title: string; body: string }> = {
  'partner.signed_compact': {
    title: 'Partner is ready',
    body: 'They signed the Curiosity Compact. Your turn!',
  },
  'partner.stage_completed': {
    title: 'Partner finished a stage',
    body: 'They completed their work. Check in when ready.',
  },
  'partner.advanced': {
    title: 'Partner moved forward',
    body: 'Your partner is ready for the next step.',
  },
  'partner.empathy_shared': {
    title: 'Empathy received',
    body: 'Your partner shared their understanding of your experience.',
  },
  'partner.needs_shared': {
    title: 'Needs shared',
    body: 'Your partner shared their identified needs.',
  },
  'partner.ranking_submitted': {
    title: 'Ranking submitted',
    body: 'Your partner submitted their strategy rankings.',
  },
  'partner.common_ground_confirmed': {
    title: 'Common ground confirmed',
    body: 'Your partner confirmed the common ground.',
  },
  'partner.ready_to_rank': {
    title: 'Ready to rank',
    body: 'Your partner is ready to rank strategies.',
  },
  'partner.consent_granted': {
    title: 'Content shared',
    body: 'Your partner has shared some content with you.',
  },
  'partner.consent_revoked': {
    title: 'Content withdrawn',
    body: 'Your partner has withdrawn some shared content.',
  },
  'agreement.proposed': {
    title: 'Agreement proposed',
    body: 'A new agreement has been proposed. Review it together.',
  },
  'agreement.confirmed': {
    title: 'Agreement confirmed',
    body: 'Both partners have agreed. Well done!',
  },
  'session.paused': {
    title: 'Session paused',
    body: 'Your partner needs a moment. The session is paused.',
  },
  'session.resumed': {
    title: 'Session resumed',
    body: 'Your partner is back. Ready to continue?',
  },
  'session.resolved': {
    title: 'Session complete',
    body: 'Congratulations! You have resolved this conversation.',
  },
  'session.joined': {
    title: 'Partner joined',
    body: 'Your partner has joined the session.',
  },
  'invitation.declined': {
    title: 'Invitation declined',
    body: 'Your partner has declined the session invitation.',
  },
};

/**
 * Sends a push notification to a user.
 * Fetches the user's push token from the database and sends the notification via Expo.
 *
 * @param userId - The user ID to send the notification to
 * @param event - The session event type (determines message content)
 * @param data - Additional data to include in the notification payload
 * @param sessionId - The session ID for deep linking
 * @returns Promise<boolean> - true if notification was sent successfully
 */
export async function sendPushNotification(
  userId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string
): Promise<boolean> {
  try {
    // Fetch user's push token from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });

    if (!user?.pushToken) {
      console.log(`[Push] No push token for user ${userId}`);
      return false;
    }

    // Validate the push token format
    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.warn(`[Push] Invalid push token format for user ${userId}: ${user.pushToken}`);
      return false;
    }

    // Get message template for this event type
    const message = PUSH_MESSAGES[event] || {
      title: 'BeHeard',
      body: 'You have an update',
    };

    // Construct the push notification
    const pushMessage: ExpoPushMessage = {
      to: user.pushToken,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: {
        sessionId,
        event,
        ...data,
      },
    };

    // Send the notification via Expo
    const expo = getExpo();
    const tickets = await expo.sendPushNotificationsAsync([pushMessage]);

    // Check if the notification was sent successfully
    const ticket = tickets[0];
    if (ticket.status === 'ok') {
      console.log(`[Push] Sent ${event} notification to user ${userId}`);
      return true;
    } else {
      // Handle error cases
      if (ticket.status === 'error') {
        console.error(`[Push] Failed to send notification to user ${userId}:`, ticket.message);

        // If token is invalid, we could clean it up here
        if (
          ticket.details?.error === 'DeviceNotRegistered' ||
          ticket.details?.error === 'InvalidCredentials'
        ) {
          console.log(`[Push] Clearing invalid token for user ${userId}`);
          await prisma.user.update({
            where: { id: userId },
            data: { pushToken: null },
          });
        }
      }
      return false;
    }
  } catch (error) {
    console.error(`[Push] Error sending notification to user ${userId}:`, error);
    return false;
  }
}

/**
 * Sends push notifications to multiple users.
 *
 * @param userIds - Array of user IDs to notify
 * @param event - The session event type
 * @param data - Additional data for the notification
 * @param sessionId - The session ID
 * @returns Promise<number> - Number of successfully sent notifications
 */
export async function sendPushNotifications(
  userIds: string[],
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string
): Promise<number> {
  const results = await Promise.all(
    userIds.map((userId) => sendPushNotification(userId, event, data, sessionId))
  );
  return results.filter(Boolean).length;
}

/**
 * Validates if a string is a valid Expo push token.
 *
 * @param token - The token to validate
 * @returns boolean - true if valid
 */
export function isValidPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}
