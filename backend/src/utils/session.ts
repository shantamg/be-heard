/**
 * Session Helper Utilities
 *
 * Centralized session-related utilities used across controllers.
 */

import { prisma } from '../lib/prisma';

/**
 * Gets the partner's user ID from a session
 */
export async function getPartnerUserId(
  sessionId: string,
  currentUserId: string
): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const partnerMember = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );

  return partnerMember?.userId ?? null;
}
