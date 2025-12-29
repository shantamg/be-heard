/**
 * Session Helper Utilities
 *
 * Centralized session-related utilities used across controllers.
 */

import { prisma } from '../lib/prisma';
import {
  SessionSummaryDTO,
  StageProgressDTO,
  SessionStatus,
  Stage,
  StageStatus,
} from '@meet-without-fear/shared';

// Type for session with includes (from Prisma)
type SessionWithIncludes = {
  id: string;
  relationshipId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  relationship: {
    members: Array<{
      userId: string;
      nickname: string | null;
      user: {
        id: string;
        name: string | null;
        firstName: string | null;
      };
    }>;
  };
  stageProgress: Array<{
    userId: string;
    stage: number;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    gatesSatisfied?: unknown;
  }>;
};

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

/**
 * Checks if a user is the creator of a session (the one who sent the invitation).
 * Used to allow the creator to work on Stages 0-1 while waiting for partner to accept.
 */
export async function isSessionCreator(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const invitation = await prisma.invitation.findFirst({
    where: {
      sessionId,
      invitedById: userId,
    },
  });

  return invitation !== null;
}

/**
 * Map a session with includes to a SessionSummaryDTO
 */
export function mapSessionToSummary(
  session: SessionWithIncludes,
  currentUserId: string
): SessionSummaryDTO {
  // Find partner member
  const partnerMember = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );
  const myMember = session.relationship.members.find(
    (m) => m.userId === currentUserId
  );

  // Find progress for each user
  const myProgressRecords = session.stageProgress.filter(
    (p) => p.userId === currentUserId
  );
  const partnerProgressRecords = session.stageProgress.filter(
    (p) => p.userId !== currentUserId
  );

  // Get current stage progress (highest stage)
  const myCurrentProgress = myProgressRecords.reduce(
    (max, p) => (p.stage > (max?.stage ?? -1) ? p : max),
    myProgressRecords[0]
  );
  const partnerCurrentProgress = partnerProgressRecords.reduce(
    (max, p) => (p.stage > (max?.stage ?? -1) ? p : max),
    partnerProgressRecords[0]
  );

  const myProgress: StageProgressDTO = myCurrentProgress
    ? {
        stage: myCurrentProgress.stage as Stage,
        status: myCurrentProgress.status as StageStatus,
        startedAt: myCurrentProgress.startedAt.toISOString(),
        completedAt: myCurrentProgress.completedAt?.toISOString() ?? null,
      }
    : {
        stage: Stage.ONBOARDING,
        status: StageStatus.NOT_STARTED,
        startedAt: null,
        completedAt: null,
      };

  const partnerProgress: StageProgressDTO = partnerCurrentProgress
    ? {
        stage: partnerCurrentProgress.stage as Stage,
        status: partnerCurrentProgress.status as StageStatus,
        startedAt: partnerCurrentProgress.startedAt.toISOString(),
        completedAt: partnerCurrentProgress.completedAt?.toISOString() ?? null,
      }
    : {
        stage: Stage.ONBOARDING,
        status: StageStatus.NOT_STARTED,
        startedAt: null,
        completedAt: null,
      };

  // Compute action needed based on gates
  const selfActionNeeded: string[] = [];
  const partnerActionNeeded: string[] = [];

  // Simplified action computation - could be enhanced based on gate status
  if (myProgress.status === StageStatus.NOT_STARTED) {
    selfActionNeeded.push('start_stage');
  }
  if (
    myProgress.status === StageStatus.GATE_PENDING &&
    partnerProgress.status !== StageStatus.COMPLETED
  ) {
    partnerActionNeeded.push('complete_stage');
  }

  return {
    id: session.id,
    relationshipId: session.relationshipId,
    status: session.status as SessionStatus,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    partner: {
      id: partnerMember?.userId ?? '',
      name: partnerMember?.user.firstName ?? partnerMember?.user.name ?? null,
      nickname: myMember?.nickname ?? null, // What I call my partner
    },
    myProgress,
    partnerProgress,
    selfActionNeeded,
    partnerActionNeeded,
  };
}
