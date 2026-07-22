/**
 * Stage 1 Controller
 *
 * Handles the Witness stage endpoints:
 * - POST /sessions/:id/messages - Send message and get AI response
 * - POST /sessions/:id/feel-heard - Confirm user feels heard
 * - GET /sessions/:id/messages - Get conversation history
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getOrchestratedResponse, type FullAIContext } from '../services/ai';
import { getModelCompletionWithTools, getSonnetResponse, getSonnetStreamingResponse, BrainActivityCallType, isMockLLMEnabled } from '../lib/bedrock';
import { brainService } from '../services/brain-service';
import { buildInitialMessagePrompt, buildStagePrompt, buildStagePromptString } from '../services/stage-prompts';
import { parseMicroTagResponse } from '../utils/micro-tag-parser';
import {
  getToolsForStage,
  parseSessionStateToolInput,
  SESSION_STATE_TOOL_NAME,
  type SessionStateToolInput,
} from '../services/stage-tools';
import { StreamTagSanitizer } from '../services/stream-tag-sanitizer';
import {
  sendMessageRequestSchema,
  feelHeardRequestSchema,
  getMessagesQuerySchema,
  MessageRole,
  DEFAULT_PRIVACY_PREFERENCES,
  PrivacyPreferencesDTO,
  type StreamEvent,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent, notifySessionMembers, publishMessageAIResponse, publishMessageError, publishTopicFrameUpdated } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId, isSessionCreator, touchUserSessionActivity } from '../utils/session';
import { embedSessionContent } from '../services/embedding';
import { updateSessionSummary, getSessionSummary } from '../services/conversation-summarizer';
import { runReconcilerForDirection, getSharedContextForGuesser } from '../services/reconciler';
import { updateContext } from '../lib/request-context';
import { runPartnerSessionClassifier, ensureFactIds, CategorizedFactWithId } from '../services/partner-session-classifier';
import { consolidateGlobalFacts } from '../services/global-memory';
import { assembleContextBundle, formatContextForPrompt } from '../services/context-assembler';
import type { MemoryIntentResult } from '../services/memory-intent';
import { handleDispatch, type DispatchContext } from '../services/dispatch-handler';
import { getMilestoneContext, getSharedContentContext } from '../services/shared-context';
import { CONTEXT_WINDOW, trimConversationHistory } from '../utils/token-budget';
import { estimateContextSizes, finalizeTurnMetrics, recordContextSizes } from '../services/llm-telemetry';
import { captureProposedNeedsForUser, captureSingleNeedForUser } from '../services/needs';
import { applyNeedAction, applyNeedEdits } from '../services/needs-edit-applier.service';
import { interpretNeedEditRequest } from '../services/needs-edit-interpreter.service';
import { cleanVisibleAIText } from '../utils/visible-text';
import { captureStage4Turn } from '../services/stage4-capture.service';
import { applyStage4AutoClosureFromSignal } from '../services/stage4-auto-closure.service';
import {
  buildTendingConversationPrompt,
  isExplicitAskForInput,
  type TendingConversationPromptContext,
} from '../services/stage4-prompts';
import { getStage4State as buildStage4State, Stage4StateNotFoundError } from '../services/stage4-state';
import type { ParsedStage4WalkthroughAction } from '../utils/micro-tag-parser';

// ============================================================================
// Helpers
// ============================================================================

async function getShowActivityStatus(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { privacyPreferences: true } as any,
  });
  const preferences = ((user as { privacyPreferences?: unknown } | null)?.privacyPreferences as PrivacyPreferencesDTO | null) ?? DEFAULT_PRIVACY_PREFERENCES;
  return preferences.showActivityStatus;
}

/**
 * Check if partner has completed stage 1 "feel heard"
 */
async function hasPartnerCompletedStage1(
  sessionId: string,
  currentUserId: string
): Promise<boolean> {
  const partnerId = await getPartnerUserId(sessionId, currentUserId);
  if (!partnerId) return false;

  const partnerProgress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 1,
      },
    },
  });

  if (!partnerProgress) return false;

  const gates = partnerProgress.gatesSatisfied as Record<string, unknown> | null;
  return gates?.feelHeard === true || gates?.feelHeardConfirmed === true;
}

async function getStage4InventoryPromptContext(sessionId: string, currentUserId: string): Promise<string | null> {
  const proposals = await prisma.strategyProposal.findMany({
    where: { sessionId },
    orderBy: { updatedAt: 'asc' },
    take: 12,
  });

  const activeProposals = proposals.filter((proposal) => proposal.status !== 'REMOVED');
  if (activeProposals.length === 0) return null;

  return activeProposals
    .map((proposal) => {
      const owner = proposal.createdByUserId === currentUserId
        ? 'current user'
        : proposal.createdByUserId
          ? 'partner'
          : 'shared/no owner';
      const details = [
        `id=${proposal.id}`,
        `kind=${proposal.kind}`,
        `owner=${owner}`,
        `description="${proposal.description}"`,
      ];
      if (proposal.duration) details.push(`duration="${proposal.duration}"`);
      if (proposal.measureOfSuccess) details.push(`success="${proposal.measureOfSuccess}"`);
      return `- ${details.join(' | ')}`;
    })
    .join('\n');
}

async function getStage4WalkthroughPromptContext(
  sessionId: string,
  currentUserId: string
): Promise<string | null> {
  try {
    const state = await buildStage4State(sessionId, currentUserId);
    const walkthrough = state.walkthrough;
    const lines = [
      `phase=${walkthrough.phase}`,
      `currentIndex=${walkthrough.currentIndex + 1}`,
      `totalInPhase=${walkthrough.totalInPhase}`,
    ];

    if (walkthrough.currentNeed) {
      lines.push(
        `currentNeedId=${walkthrough.currentNeed.id}`,
        `currentNeedLabel="${walkthrough.currentNeed.label}"`,
        `currentNeedSource=${walkthrough.currentNeed.source}`,
        `currentNeedStatus=${walkthrough.currentNeed.status}`,
      );
    } else {
      lines.push('currentNeedId=null');
    }

    const formatNeed = (need: typeof walkthrough.ownNeeds[number]) =>
      `- id=${need.id} | status=${need.status} | label="${need.label}"`;
    if (walkthrough.ownNeeds.length > 0) {
      lines.push('ownNeeds:', ...walkthrough.ownNeeds.map(formatNeed));
    }
    if (walkthrough.partnerNeeds.length > 0) {
      lines.push('partnerNeeds:', ...walkthrough.partnerNeeds.map(formatNeed));
    }

    const currentProposalLines = walkthrough.proposalGroups
      .flatMap((group) =>
        group.proposals.map((proposal) => {
          const details = [
            `- group=${group.key}`,
            `id=${proposal.id}`,
            `kind=${proposal.kind}`,
            `description="${proposal.description}"`,
          ];
          if (proposal.duration) details.push(`duration="${proposal.duration}"`);
          if (proposal.measureOfSuccess) details.push(`success="${proposal.measureOfSuccess}"`);
          return details.join(' | ');
        })
      );
    if (currentProposalLines.length > 0) {
      lines.push('currentNeedProposals:', ...currentProposalLines);
    }

    return lines.join('\n');
  } catch (error) {
    if (error instanceof Stage4StateNotFoundError) return null;
    logger.warn('[getStage4WalkthroughPromptContext] failed', { error });
    return null;
  }
}

async function applyStage4WalkthroughAction(
  sessionId: string,
  userId: string,
  action: ParsedStage4WalkthroughAction
): Promise<boolean> {
  if (action.action === 'NONE') return false;

  const before = await buildStage4State(sessionId, userId);
  const currentNeed = before.walkthrough.currentNeed;
  if (!currentNeed) return false;
  if (before.walkthrough.phase !== 'MY_NEEDS' && before.walkthrough.phase !== 'PARTNER_NEEDS') {
    return false;
  }
  if (currentNeed.status === 'covered' || currentNeed.status === 'skipped') return false;
  if (action.needId && action.needId !== currentNeed.id) {
    logger.warn('[applyStage4WalkthroughAction] Ignoring action for non-current need', {
      sessionId,
      userId,
      actionNeedId: action.needId,
      currentNeedId: currentNeed.id,
    });
    return false;
  }

  const progress = await prisma.stageProgress.findUnique({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 4 } },
    select: { gatesSatisfied: true },
  });
  const gates = (progress?.gatesSatisfied as Record<string, unknown> | null) ?? {};
  const existing =
    gates.stage4Walkthrough &&
    typeof gates.stage4Walkthrough === 'object' &&
    !Array.isArray(gates.stage4Walkthrough)
      ? (gates.stage4Walkthrough as Record<string, unknown>)
      : {};
  const covered = new Set(
    Array.isArray(existing.coveredNeedIds)
      ? existing.coveredNeedIds.filter((id): id is string => typeof id === 'string')
      : []
  );
  const skipped = new Set(
    Array.isArray(existing.skippedNeedIds)
      ? existing.skippedNeedIds.filter((id): id is string => typeof id === 'string')
      : []
  );
  if (action.action === 'COVERED') {
    covered.add(currentNeed.id);
    skipped.delete(currentNeed.id);
  } else {
    skipped.add(currentNeed.id);
    covered.delete(currentNeed.id);
  }

  const remainingOwn = before.walkthrough.ownNeeds.find(
    (need) => !covered.has(need.id) && !skipped.has(need.id)
  );
  const remainingPartner = before.walkthrough.partnerNeeds.find(
    (need) => !covered.has(need.id) && !skipped.has(need.id)
  );
  const phase =
    before.walkthrough.phase === 'MY_NEEDS' && remainingOwn
      ? 'MY_NEEDS'
      : before.walkthrough.phase === 'MY_NEEDS' && remainingPartner
        ? 'PARTNER_NEEDS'
        : before.walkthrough.phase === 'PARTNER_NEEDS' && remainingPartner
          ? 'PARTNER_NEEDS'
          : remainingOwn
            ? 'MY_NEEDS'
            : remainingPartner
              ? 'PARTNER_NEEDS'
              : 'QUALITY_REVIEW';
  const currentNeedId =
    phase === 'MY_NEEDS'
      ? remainingOwn?.id ?? null
      : phase === 'PARTNER_NEEDS'
        ? remainingPartner?.id ?? null
        : null;

  await prisma.stageProgress.update({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 4 } },
    data: {
      gatesSatisfied: {
        ...gates,
        stage4Walkthrough: {
          phase,
          currentNeedId,
          coveredNeedIds: [...covered],
          skippedNeedIds: [...skipped],
          updatedAt: new Date().toISOString(),
          updatedFrom: 'ai_walkthrough_action',
          lastAction: action.action,
          lastReason: action.reason ?? null,
        },
      } satisfies Prisma.InputJsonValue,
    },
  });

  logger.info('[applyStage4WalkthroughAction] Advanced Stage 4 walkthrough from model action', {
    sessionId,
    userId,
    needId: currentNeed.id,
    action: action.action,
    nextPhase: phase,
    nextNeedId: currentNeedId,
  });
  return true;
}

/**
 * Stage 4 Phase 6 — open needs (not declined, not yet willing-covered) with
 * their labels, so the AI can surface one at a time in main chat with the
 * user's own phrasing.
 */
async function getStage4OpenNeedsForPrompt(
  sessionId: string,
  userId: string
): Promise<Array<{ needLabel: string }> | null> {
  try {
    const [coverageRows, willingSelections, declinations] = await Promise.all([
      prisma.stage4NeedCoverage.findMany({
        where: { sessionId, coverageStatus: { in: ['OPEN', 'PARTIAL'] } },
        select: { id: true, needId: true, needLabel: true, coveringProposalIds: true },
      }),
      prisma.stage4ProposalSelection.findMany({
        where: { sessionId, userId, decision: 'WILLING' },
        select: { proposalId: true },
      }),
      prisma.stage4NeedDeclination.findMany({
        where: { sessionId, userId },
        select: { needId: true },
      }),
    ]);
    if (coverageRows.length === 0) return null;
    const willingIds = new Set(willingSelections.map((s) => s.proposalId));
    const declined = new Set(declinations.map((d) => d.needId));
    const candidateRows = coverageRows.filter((row) => {
      const needId = row.needId ?? row.id;
      if (declined.has(needId)) return false;
      const covered = row.coveringProposalIds.some((pid) => willingIds.has(pid));
      return !covered;
    });
    if (candidateRows.length === 0) return null;
    const needIds = candidateRows.map((r) => r.needId).filter((n): n is string => Boolean(n));
    const needs = needIds.length > 0
      ? await prisma.identifiedNeed.findMany({
          where: { id: { in: needIds }, vessel: { userId } },
          select: { id: true, need: true },
        })
      : [];
    const byId = new Map(needs.map((n) => [n.id, n.need] as const));
    const labels: Array<{ needLabel: string }> = [];
    for (const row of candidateRows) {
      // Prefer the user's exact phrasing from IdentifiedNeed; fall back to the
      // coverage row's needLabel so coverage rows without an IdentifiedNeed
      // link (or whose link belongs to the partner's vessel) still surface.
      const label = (row.needId && byId.get(row.needId)) || row.needLabel;
      if (label) labels.push({ needLabel: label });
    }
    return labels.length > 0 ? labels : null;
  } catch (err) {
    logger.warn('[getStage4OpenNeedsForPrompt] failed', { error: err });
    return null;
  }
}

/**
 * Stage 4 Phase 6 (Surface 6) — listen-first mode. Active when the session is
 * RESOLVED and the user hasn't yet explicitly asked the AI for input since
 * re-entry. Once any user message in history matches the explicit-ask regex,
 * advice mode persists for the rest of the conversation.
 */
async function isStage4ListenFirstMode(
  _sessionId: string,
  _userId: string,
  sessionStatus: string,
  history: Array<{ role: string; content: string }>
): Promise<boolean> {
  if (sessionStatus !== 'RESOLVED') return false;
  const askedForInput = history.some(
    (m) => m.role === 'USER' && isExplicitAskForInput(m.content)
  );
  return !askedForInput;
}

async function getTendingConversationContextForPrompt(
  sessionId: string,
  userId: string
): Promise<TendingConversationPromptContext | null> {
  try {
    const [entries, needs, selectedNotes, latestCheckins] = await Promise.all([
      prisma.tendingEntry.findMany({
        where: {
          sessionId,
          OR: [
            { scope: 'SHARED' },
            { scope: 'INDIVIDUAL', ownerUserId: userId },
            { scope: 'INDIVIDUAL', optedInShared: true },
          ],
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
        take: 8,
        select: {
          id: true,
          summary: true,
          scope: true,
          agreement: { select: { measureOfSuccess: true } },
        },
      }),
      prisma.stage4NeedCoverage.findMany({
        where: { sessionId, sourceUserId: userId },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
        select: { needId: true, needLabel: true },
      }),
      prisma.tendingBetweenPeriodNote.findMany({
        where: {
          sessionId,
          userId,
          carryForwardSelected: true,
        },
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
        select: {
          id: true,
          content: true,
          consentToShareWithPartner: true,
        },
      }),
      prisma.tendingCheckin.findMany({
        where: { sessionId, userId },
        orderBy: [{ submittedAt: 'desc' }],
        take: 3,
        include: {
          entryOutcomes: true,
          needOutcomes: true,
          adjustments: true,
        },
      }),
    ]);

    if (entries.length === 0 && selectedNotes.length === 0 && latestCheckins.length === 0) {
      return null;
    }

    const latestStructuredOutcomes = latestCheckins.flatMap((checkin) => [
      `Check-in ${checkin.id}: continueChoice=${checkin.continueChoice ?? 'none'} nextAction=${checkin.nextAction ?? 'none'}`,
      ...checkin.entryOutcomes.map((outcome) =>
        `Entry ${outcome.tendingEntryId}: followThrough=${outcome.followThroughStatus}; helpfulness=${outcome.helpfulnessStatus ?? 'none'}; blockers=${outcome.blockerCategories.join(', ') || 'none'}; stillWorthTrying=${outcome.stillWorthTrying ?? 'unknown'}`
      ),
      ...checkin.needOutcomes.map((outcome) =>
        `Need ${outcome.needLabel}: ${outcome.resolutionStatus}${outcome.nextAction ? `; nextAction=${outcome.nextAction}` : ''}`
      ),
      ...checkin.adjustments.map((adjustment) =>
        `Adjustment ${adjustment.tendingEntryId}: ${adjustment.revisedCommitmentText ?? 'no text'}${adjustment.revisedCadence ? `; cadence=${adjustment.revisedCadence}` : ''}${adjustment.revisedSuccessCriteria ? `; success=${adjustment.revisedSuccessCriteria}` : ''}`
      ),
    ]).join('\n');

    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        summary: entry.summary,
        scope: entry.scope,
        successCriteria: entry.agreement?.measureOfSuccess ?? null,
      })),
      needs: needs.map((need) => ({
        id: need.needId,
        label: need.needLabel,
      })),
      selectedBetweenPeriodNotes: selectedNotes.map((note) => ({
        id: note.id,
        content: note.content,
        consentToShareWithPartner: note.consentToShareWithPartner,
      })),
      latestStructuredOutcomes: latestStructuredOutcomes || null,
    };
  } catch (err) {
    logger.warn('[getTendingConversationContextForPrompt] failed', { sessionId, userId, error: err });
    return null;
  }
}

/**
 * Get a fallback initial message when AI is unavailable
 */
function getFallbackInitialMessage(
  userName: string,
  partnerName: string | undefined,
  isInvitationPhase: boolean,
  isInvitee: boolean
): string {
  const partner = partnerName || 'them';

  if (isInvitee) {
    return `I'd like to hear your side now. What's been happening from your point of view with ${partner}?`;
  }

  if (isInvitationPhase) {
    return `Hey ${userName}, what's going on with ${partner}?`;
  }

  return `Hey ${userName}, what's on your mind?`;
}

const STAGE2_ROADMAP_COPY =
  `Here's what comes next: there are a few more steps in this process. First, each of you tries to understand what the other person might be going through. Then you'll each explore what matters most to you, and eventually use that to get clearer about what is possible next, whether together or separately.`;

function buildStage2TransitionFallback(
  partnerName: string | undefined,
  partnerStatus: 'not_joined' | 'in_progress' | 'completed'
): string {
  const partner = partnerName || 'your partner';
  const mutualPhrase = partnerStatus === 'not_joined'
    ? `${partnerName || 'Your partner'} will be doing this same thing for you on their side.`
    : `${partnerName || 'Your partner'} is doing this same thing for you on their side.`;

  return `That gives us enough to move to the next step.\n\n${STAGE2_ROADMAP_COPY}\n\nThis next part may feel unusual: try to imagine what ${partner} might be experiencing, even if you are still upset with them. This is not about excusing, agreeing, softening your boundary, or deciding what happens next. It is a guess about how this may be landing for ${partner}, while keeping your own truth intact. ${mutualPhrase}\n\nWhat do you think might be going on for ${partner} in all of this?`;
}

function scrubStage2RepairFraming(content: string): string {
  const researchToRepairRegex = new RegExp(
    [
      "there is a lot of research|there's a lot of research|research shows",
      'genuinely tr(?:y|ies)ing to see',
      'work things out',
    ].join('[^.]*'),
    'gi'
  );
  const moveForwardTogetherRegex = new RegExp(
    ['once you both feel', 'move forward together'].join('[^.]*'),
    'gi'
  );

  return content
    .replace(
      researchToRepairRegex,
      "This is not about excusing, agreeing, or deciding what happens next"
    )
    .replace(moveForwardTogetherRegex,
      "If something feels off, you can say what is missing before the process continues."
    );
}

const PLANNER_LINE_PREFIXES = [
  'i should',
  'so both lists should',
  '— so both lists should',
  "here's my plan",
  'the prompt says',
  'i need to follow',
  'i need to present',
  'i need to check the prompt',
  'i need to use the prompt',
  'i need to make sure both lists',
];

function stripUntaggedReasoningPreamble(text: string): string {
  const marker = text.match(/\bFor\s+stage4_(?:walkthrough|proposals)\s*:/i);
  if (!marker || marker.index === undefined) return text;

  const afterMarker = text.slice(marker.index);
  const nextParagraph = afterMarker.match(/\n\s*\n+/);
  if (!nextParagraph || nextParagraph.index === undefined) return text;

  const visibleStart = marker.index + nextParagraph.index + nextParagraph[0].length;
  return text.slice(visibleStart);
}

export function scrubVisibleAIText(
  text: string,
  options: { preserveBoundaryWhitespace?: boolean } = {}
): { text: string; scrubbed: boolean } {
  const before = text;
  const preambleScrubbed = stripUntaggedReasoningPreamble(text);
  const plannerScrubbed = preambleScrubbed
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim().toLowerCase();
      return !PLANNER_LINE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    })
    .join('\n')
    .replace(/\bI should\b/gi, '')
    .replace(/\bso both lists should be available\b/gi, '');
  const cleaned = cleanVisibleAIText(plannerScrubbed, {
    preserveBoundaryWhitespace: options.preserveBoundaryWhitespace,
  });

  return { text: cleaned, scrubbed: cleaned !== before };
}

export function isReadyForStage3RevealText(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (/\bnot\s+ready\b/.test(normalized) || /\b(?:don'?t|do not)\s+(?:want|feel ready)\b/.test(normalized)) {
    return false;
  }
  return /\b(i'?m|i am|we are)?\s*ready\b/.test(normalized) &&
    /(list|lists|needs|side by side|reveal|see them|see it|show)/.test(normalized);
}

function isClarifyingStage4Response(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.endsWith('?')) return false;

  return /\b(?:do you mean|what do you mean|which|or something else|clarify|more specific|can you say more|are you saying)\b/i.test(trimmed);
}

async function getStage3GateResponse(sessionId: string, userId: string): Promise<string | null> {
  const partnerId = await getPartnerUserId(sessionId, userId);
  const progress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId,
        stage: 3,
      },
    },
  });
  if (!progress) return null;

  const vessel = await prisma.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
    include: { identifiedNeeds: { orderBy: { createdAt: 'asc' } } },
  });
  const needs = vessel?.identifiedNeeds ?? [];
  const gates = progress.gatesSatisfied as Record<string, unknown> | null;
  const ownShared = gates?.needsShared === true;
  const ownConfirmed = gates?.needsConfirmed === true || (needs.length > 0 && needs.every((need) => need.confirmed));

  if (needs.length === 0) {
    return "Let's first put words to what matters most for you here. What do you need in order to feel clear, grounded, or able to move forward from this?";
  }

  if (!ownConfirmed) {
    return "I've captured a draft of what matters to you. Please review and confirm your needs before we move any further.";
  }

  if (!ownShared) {
    return "Your needs are ready for your review. If they still feel right, you can choose to share them for the side-by-side step.";
  }

  if (!partnerId) {
    return "Your needs are shared. We'll wait until your partner has shared theirs before showing anything side by side.";
  }

  const partnerProgress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 3,
      },
    },
  });
  const partnerGates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;
  if (partnerGates?.needsShared !== true) {
    return "Your needs are shared. We'll wait until your partner has shared theirs before showing anything side by side.";
  }

  return "Both needs lists are ready to review side by side. Take a look at them and notice what stands out before deciding whether they feel accurate.";
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Send a message in Stage 1 and get AI witness response
 * POST /sessions/:id/messages
 *
 * @deprecated This endpoint is deprecated. Use POST /sessions/:id/messages/stream instead.
 * The streaming endpoint provides real-time token streaming and better error handling.
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  logger.warn('[sendMessage] DEPRECATED: Fire-and-forget endpoint called. Clients should use /messages/stream instead.');

  errorResponse(
    res,
    'ENDPOINT_DEPRECATED',
    'This endpoint is deprecated. Please use POST /sessions/:id/messages/stream for SSE streaming.',
    410 // HTTP 410 Gone
  );
}


/**
 * Confirm that user feels heard and can proceed
 * POST /sessions/:id/feel-heard
 */
export async function confirmFeelHeard(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = feelHeardRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { confirmed, feedback } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: {
        relationship: {
          include: {
            members: {
              select: {
                userId: true,
                nickname: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    firstName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Get user's current stage progress (needed for both status check and stage validation)
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
      },
      orderBy: { stage: 'desc' },
    });

    // Check session allows feel-heard confirmation
    // Allow ACTIVE status for all users, and INVITED status for:
    // 1. The session creator, OR
    // 2. Users who have already joined (have stage progress) - defensive check for edge cases
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        const hasJoined = !!progress; // User has stage progress, meaning they've joined

        if (!isCreator && !hasJoined) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }

        // If user has joined but session status is still INVITED, update it to ACTIVE
        // This handles edge cases where status wasn't updated on invitation acceptance
        if (hasJoined && !isCreator) {
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: 'ACTIVE' },
          });
          logger.info(`[confirmFeelHeard] Updated session ${sessionId} status to ACTIVE (user has joined)`);
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Check user is in stage 1
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 1) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm feel-heard: you are in stage ${currentStage}, but stage 1 is required`,
        400
      );
      return;
    }

    // Generate turnId for this user action
    const turnId = `${sessionId}-${user.id}-feel-heard`;
    // Update request context so all downstream code can access this turnId
    updateContext({ turnId, sessionId, userId: user.id });

    // Build gates satisfied data (use names that match Stage1Gates interface)
    const gatesSatisfied = {
      feelHeardConfirmed: confirmed,
      feelHeardConfirmedAt: new Date().toISOString(),
      finalEmotionalReading: null, // Can be updated later with final barometer reading
      ...(feedback ? { feedback } : {}),
    } satisfies Prisma.InputJsonValue;

    const now = new Date();
    const confirmedAt = now.toISOString();

    // Update stage progress - mark Stage 1 as COMPLETED when confirmed
    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 1,
        },
      },
      data: {
        gatesSatisfied,
        status: confirmed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: confirmed ? now : null,
      },
    });

    // When confirmed, advance user to Stage 2 immediately
    // This ensures they get Stage 2 prompts with empathy statement capability
    let advancedToStage2 = false;
    if (confirmed) {
      // Check if Stage 2 record already exists (shouldn't, but be safe)
      const existingStage2 = await prisma.stageProgress.findUnique({
        where: {
          sessionId_userId_stage: {
            sessionId,
            userId: user.id,
            stage: 2,
          },
        },
      });

      if (!existingStage2) {
        await prisma.stageProgress.create({
          data: {
            sessionId,
            userId: user.id,
            stage: 2,
            status: 'IN_PROGRESS',
            startedAt: now,
            gatesSatisfied: {},
          },
        });
        advancedToStage2 = true;
        logger.info(`[confirmFeelHeard] Advanced user ${user.id} to Stage 2`);
      }
    }

    // Generate AI transition message when user confirms they feel heard
    let transitionMessage: {
      id: string;
      content: string;
      timestamp: string;
      stage: number;
    } | null = null;

    if (confirmed) {
      try {
        // Get partner name (using nickname) and status for the transition message
        const myMember = session.relationship.members.find(
          (m) => m.userId === user.id
        );
        const partnerMember = session.relationship.members.find(
          (m) => m.userId !== user.id
        );

        let partnerName: string | undefined;
        let partnerStatus: 'not_joined' | 'in_progress' | 'completed' = 'not_joined';

        if (partnerMember) {
          // Use nickname (what I call my partner) → firstName → name
          partnerName = myMember?.nickname ||
            partnerMember.user.firstName ||
            partnerMember.user.name ||
            undefined;

          // Check partner's stage progress to determine their status
          const partnerProgress = await prisma.stageProgress.findFirst({
            where: {
              sessionId,
              userId: partnerMember.userId,
            },
            orderBy: { stage: 'desc' },
          });

          if (partnerProgress) {
            partnerStatus = 'in_progress';
          }
        } else {
          // Partner hasn't joined yet - get name from invitation
          const invitation = await prisma.invitation.findFirst({
            where: { sessionId, invitedById: user.id },
            select: { name: true },
          });
          partnerName = myMember?.nickname || invitation?.name || undefined;
        }

        const transitionContent = scrubStage2RepairFraming(
          buildStage2TransitionFallback(partnerName, partnerStatus)
        );

        // Save the transition message to the database as Stage 2
        // This is the first message in the perspective-taking phase
        const aiMessage = await prisma.message.create({
          data: {
            sessionId,
            senderId: null,
            forUserId: user.id, // Track which user this AI response is for (data isolation)
            role: 'AI',
            content: transitionContent.trim(),
            stage: 2, // Stage 2 - perspective stretch begins
          },
        });

        // Embed session content for cross-session retrieval (non-blocking)
        // Per fact-ledger architecture, we embed at session level
        embedSessionContent(sessionId, user.id, turnId).catch((err: unknown) =>
          logger.warn('[confirmFeelHeard] Failed to embed session content:', err)
        );

        transitionMessage = {
          id: aiMessage.id,
          content: aiMessage.content,
          timestamp: aiMessage.timestamp.toISOString(),
          stage: 2, // Stage 2 transition message
        };

        logger.info(`[confirmFeelHeard] Generated transition message for session ${sessionId}`);

        // Audit log the transition message
        /* auditLog('RESPONSE', 'Stage transition message generated', {
          turnId,
          sessionId,
          userId: user.id,
          stage: 2,
          operation: 'stage1-transition',
          responseText: transitionContent,
          messageId: aiMessage.id,
        }); */
      } catch (error) {
        logger.error('[confirmFeelHeard] Failed to generate transition message:', error);
        // Continue without transition message - not a critical failure
      }
    }

    // Check if partner has also completed
    const partnerCompleted = await hasPartnerCompletedStage1(sessionId, user.id);
    const canAdvance = confirmed && partnerCompleted;

    // Notify partner of stage completion
    if (confirmed) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        await notifyPartner(sessionId, partnerId, 'partner.stage_completed', {
          stage: 1,
          completedBy: user.id,
        });
      }

      // Consolidate global facts when Stage 1 completes (fire-and-forget)
      // Per fact-ledger architecture, we merge session facts into user's global profile
      consolidateGlobalFacts(user.id, sessionId, turnId).catch((err: unknown) =>
        logger.warn('[confirmFeelHeard] Failed to consolidate global facts:', err)
      );
    }

    // If both partners are ready, publish advancement event
    if (canAdvance) {
      await publishSessionEvent(sessionId, 'partner.advanced', {
        fromStage: 1,
        toStage: 2,
      });
    }

    // NEW: Check if partner has an empathy attempt in HELD status
    // If so, trigger the asymmetric reconciler for that direction
    // (Partner = guesser, current user = subject whose Stage 1 is now complete)
    let reconcilerTriggered = false;
    let reconcilerResult: {
      empathyStatus: 'REVEALED' | 'AWAITING_SHARING';
      shareOffer: { suggestedContent: string; reason: string } | null;
    } | null = null;

    if (confirmed) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        // Check if partner has an empathy attempt in HELD status (waiting for us)
        const partnerEmpathyAttempt = await prisma.empathyAttempt.findFirst({
          where: {
            sessionId,
            sourceUserId: partnerId,
            status: 'HELD',
          },
        });

        if (partnerEmpathyAttempt) {
          logger.info(`[confirmFeelHeard] Partner ${partnerId} has HELD empathy - triggering reconciler (non-blocking)`);

          // Trigger reconciler in the background
          (async () => {
            try {
              logger.info(`[confirmFeelHeard] Calling runReconcilerForDirection for sessionId=${sessionId}, guesserId=${partnerId}, subjectId=${user.id}`);
              const result = await runReconcilerForDirection(sessionId, partnerId, user.id);

              logger.info(`[confirmFeelHeard] Reconciler completed: status=${result.empathyStatus}, hasSuggestion=${!!result.shareOffer}`);

              // If there's a share suggestion, notify the current user (subject)
              // Note: We DON'T exclude the user here because they ARE the intended recipient
              // Include full empathy status to avoid extra HTTP round-trip
              if (result.empathyStatus === 'AWAITING_SHARING' && result.shareOffer) {
                logger.info(`[confirmFeelHeard] Significant gaps found - notifying subject ${user.id} of share suggestion`);
                const { buildEmpathyExchangeStatus } = await import('../services/empathy-status');
                const empathyStatus = await buildEmpathyExchangeStatus(sessionId, user.id);
                await notifyPartner(sessionId, user.id, 'empathy.share_suggestion', {
                  // Include forUserId so mobile can filter - only the subject should see the modal
                  forUserId: user.id,
                  guesserName: session.relationship.members.find(m => m.userId === partnerId)
                    ? 'your partner'
                    : 'your partner',
                  suggestedContent: result.shareOffer.suggestedContent,
                  suggestedReason: (result.shareOffer as any).reason || (result.shareOffer as any).suggestedReason,
                  empathyStatus,
                  // Include triggeredByUserId for event tracing
                  triggeredByUserId: user.id,
                });
              }

              // If empathy is READY (no gaps), the guesser already got the alignment message.
              // The reveal notification will be sent when both directions are READY.
              if (result.empathyStatus === 'READY') {
                logger.info(`[confirmFeelHeard] No significant gaps - empathy marked READY, waiting for partner to complete Stage 2`);
              }
            } catch (error) {
              logger.error('[confirmFeelHeard] Reconciler background task failed:', error);
            }
          })();
          reconcilerTriggered = true;
        } else {
          logger.info(`[confirmFeelHeard] Partner ${partnerId} does not have HELD empathy - reconciler NOT triggered`);
        }
      }
    }

    successResponse(res, {
      confirmed,
      confirmedAt,
      canAdvance,
      partnerCompleted,
      transitionMessage,
      advancedToStage: advancedToStage2 ? 2 : null,
      reconcilerTriggered,
    });
  } catch (error) {
    logger.error('[confirmFeelHeard] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm feel-heard', 500);
  }
}

/**
 * Get conversation history for the current user in a session
 * GET /sessions/:id/messages
 */
export async function getConversationHistory(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  try {
    logger.info(`[getConversationHistory:${requestId}] ========== REQUEST START ==========`);
    const user = req.user;
    if (!user) {
      logger.info(`[getConversationHistory:${requestId}] ERROR: No user in request`);
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    logger.info(`[getConversationHistory:${requestId}] Session ID: ${sessionId}, User ID: ${user.id}`);

    // Validate query params
    const parseResult = getMessagesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { limit, before, after, order } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Build cursor conditions
    const cursorCondition: Record<string, unknown> = {};
    if (before) {
      cursorCondition.timestamp = { lt: new Date(before) };
    }
    if (after) {
      cursorCondition.timestamp = { gt: new Date(after) };
    }

    // Get messages - user's own messages (without specific recipient) + messages specifically for them
    // This ensures data isolation: messages with forUserId only show to that user
    logger.info(`[getConversationHistory:${requestId}] Fetching messages with limit=${limit}, before=${before || 'none'}, after=${after || 'none'}, order=${order}`);
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          // Messages user sent without a specific recipient (broadcast to all, e.g., USER messages)
          { senderId: user.id, forUserId: null },
          // Messages specifically for this user (AI responses, SHARED_CONTEXT, etc.)
          { forUserId: user.id },
        ],
        ...cursorCondition,
      },
      orderBy: { timestamp: order },
      take: limit + 1, // Fetch one extra to check for more
    });

    logger.info(`[getConversationHistory:${requestId}] ✅ Fetched ${messages.length} messages from database`);

    // Check for duplicate message IDs
    const messageIds = messages.map(m => m.id);
    const duplicateIds = messageIds.filter((id, idx) => messageIds.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      logger.warn(`[getConversationHistory:${requestId}] ⚠️  WARNING: Found ${duplicateIds.length} duplicate message ID(s) in query result!`);
      duplicateIds.forEach(id => {
        const duplicates = messages.filter(m => m.id === id);
        logger.warn(`[getConversationHistory:${requestId}]   Duplicate ID ${id}: appears ${duplicates.length} times`);
      });
    }

    // Check for duplicate content (same content, same role, within 1 second)
    const contentMap = new Map<string, typeof messages>();
    messages.forEach(m => {
      const key = `${m.role}:${m.content.substring(0, 100)}`;
      if (!contentMap.has(key)) {
        contentMap.set(key, []);
      }
      contentMap.get(key)!.push(m);
    });
    const duplicateContent = Array.from(contentMap.entries()).filter(([_, msgs]) => msgs.length > 1);
    if (duplicateContent.length > 0) {
      logger.warn(`[getConversationHistory:${requestId}] ⚠️  WARNING: Found ${duplicateContent.length} message(s) with duplicate content!`);
      duplicateContent.forEach(([key, msgs]) => {
        logger.warn(`[getConversationHistory:${requestId}]   Duplicate group (role=${key.split(':')[0]}): appears ${msgs.length} times`);
        msgs.forEach((msg, idx) => {
          logger.warn(`[getConversationHistory:${requestId}]     ${idx + 1}. ID=${msg.id}, timestamp=${msg.timestamp.toISOString()}`);
        });
      });
    }

    // Log recent message IDs
    const recentMessages = messages.slice(0, 5);
    logger.info(`[getConversationHistory:${requestId}] Recent 5 message IDs:`, recentMessages.map(m => `${m.role}:${m.id.substring(0, 8)}...`).join(', '));

    // Check if there are more messages
    const hasMore = messages.length > limit;
    let resultMessages = hasMore ? messages.slice(0, limit) : messages;

    logger.info(`[getConversationHistory:${requestId}] Returning ${resultMessages.length} messages (hasMore=${hasMore})`);

    // If fetched in descending order, reverse to return chronological order for display
    // This allows us to fetch the latest N messages but display them oldest-first
    if (order === 'desc') {
      resultMessages = resultMessages.reverse();
    }

    successResponse(res, {
      messages: resultMessages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        senderId: m.senderId,
        role: m.role,
        content: m.content,
        stage: m.stage,
        timestamp: m.timestamp.toISOString(),
        refiningNeedId: m.refiningNeedId ?? null,
      })),
      hasMore,
    });
  } catch (error) {
    logger.error('[getConversationHistory] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get messages', 500);
  }
}

/**
 * Get AI-generated initial message for a session/stage
 * POST /sessions/:id/messages/initial
 */
export async function getInitialMessage(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check if there are already messages in this session for this user (data isolation)
    const existingMessages = await prisma.message.findFirst({
      where: {
        sessionId,
        OR: [
          // Messages user sent without a specific recipient
          { senderId: user.id, forUserId: null },
          // Messages specifically for this user
          { forUserId: user.id },
        ],
      },
    });

    if (existingMessages) {
      // Already has messages, don't generate a new initial message
      errorResponse(res, 'VALIDATION_ERROR', 'Session already has messages', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
      },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;

    // Determine if this is the invitation phase
    const isInvitationPhase = session.status === 'CREATED';

    // Get user's first name
    const userName = user.firstName || user.name || 'there';

    // Find the session's invitation to determine inviter/invitee status
    const invitation = await prisma.invitation.findFirst({
      where: { sessionId },
      select: { name: true, invitedById: true },
    });

    // Determine if the current user is the invitee (NOT the person who sent the invitation)
    const isInvitee = invitation ? invitation.invitedById !== user.id : false;

    // Get partner name - for inviter it's from the invitation, for invitee it's from the inviter
    let partnerName: string | undefined;
    if (isInvitee) {
      // Invitee: partner is the inviter
      const inviter = await prisma.user.findUnique({
        where: { id: invitation?.invitedById },
        select: { firstName: true, name: true },
      });
      partnerName = inviter?.firstName || inviter?.name || undefined;
    } else {
      // Inviter: partner name is from the invitation
      partnerName = invitation?.name || undefined;

      // Older sessions created from an existing person may have a blank
      // invitation name. Recover the display name from the relationship so the
      // opening prompt does not ask who the user already selected.
      if (!partnerName) {
        const inviterMembership = await prisma.relationshipMember.findUnique({
          where: {
            relationshipId_userId: {
              relationshipId: session.relationshipId,
              userId: user.id,
            },
          },
          select: { nickname: true },
        });
        const partnerMember = await prisma.relationshipMember.findFirst({
          where: {
            relationshipId: session.relationshipId,
            userId: { not: user.id },
          },
          select: {
            user: {
              select: {
                firstName: true,
                name: true,
              },
            },
          },
        });

        partnerName =
          inviterMembership?.nickname ||
          partnerMember?.user.firstName ||
          partnerMember?.user.name ||
          undefined;
      }
    }

    // Check if this session originated from an Inner Thoughts session
    let innerThoughtsContext: { summary: string; themes: string[]; fullContext?: string } | undefined;
    if (!isInvitee && isInvitationPhase) {
      const originInnerThoughts = await prisma.innerWorkSession.findFirst({
        where: {
          linkedPartnerSessionId: sessionId,
          userId: user.id,
          linkedTrigger: 'suggestion_start',
        },
        select: {
          summary: true,
          theme: true,
          messages: {
            orderBy: { timestamp: 'asc' },
            select: { role: true, content: true }
          }
        },
      });

      if (originInnerThoughts) {
        // Build a richer context from the messages if available
        let fullContext = '';
        if (originInnerThoughts.messages.length > 0) {
          fullContext = originInnerThoughts.messages
            .map(m => `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`)
            .join('\n\n');
        }

        innerThoughtsContext = {
          summary: originInnerThoughts.summary || '',
          themes: originInnerThoughts.theme ? [originInnerThoughts.theme] : [],
          fullContext: fullContext || undefined
        };
      }
    }

    // Build the initial message prompt
    let prompt: string;
    if (!isInvitee && isInvitationPhase && innerThoughtsContext) {
      // Use the actual invitation crafting prompt with extra context
      // This allows the AI to propose an invitation in the first message
      prompt = buildStagePromptString(0, {
        userName,
        partnerName,
        turnCount: 1,
        emotionalIntensity: 5,
        contextBundle: {
          conversationContext: {
            recentTurns: [],
            turnCount: 0,
            sessionDurationMinutes: 0,
          },
          emotionalThread: {
            initialIntensity: null,
            currentIntensity: null,
            trend: 'unknown',
            notableShifts: [],
          },
          stageContext: {
            stage: 0,
            gatesSatisfied: {},
          },
          userName,
          partnerName,
          intent: {
            intent: 'stage_enforcement',
            depth: 'minimal',
            reason: 'Stage 0 - onboarding with minimal context',
            threshold: 0.60,
            maxCrossSession: 0,
            allowCrossSession: false,
            surfaceStyle: 'silent',
          },
          assembledAt: new Date().toISOString(),
        },
        innerThoughtsContext,
      }, { isInvitationPhase: true });
    } else {
      prompt = buildInitialMessagePrompt(
        currentStage,
        { userName, partnerName, isInvitee, topicFrame: session.topicFrame, innerThoughtsContext },
        isInvitationPhase
      );
    }

    // Generate turnId for this user action - the invitee accessing their session
    const turnId = `${sessionId}-${user.id}-welcome`;
    // Update request context so all downstream code can access this turnId
    updateContext({ turnId, sessionId, userId: user.id });

    // Get AI response
    let responseContent: string;
    try {
      // AWS Bedrock requires conversations to start with a user message
      const aiResponse = await getSonnetResponse({
        systemPrompt: prompt,
        messages: [{ role: 'user', content: 'Please generate an initial greeting.' }],
        maxTokens: 512,
        sessionId,
        turnId,
        operation: 'stage1-initial-message',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      });

      if (aiResponse) {
        // Parse the semantic tag response (micro-tag format)
        const parsed = parseMicroTagResponse(aiResponse);
        responseContent = parsed.response.trim() || getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
      } else {
        // Fallback if AI unavailable
        responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
      }
    } catch (error) {
      logger.error('[getInitialMessage] AI response error:', error);
      responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
    }

    // Save the AI message (trim whitespace that Claude sometimes adds).
    // This endpoint can be called twice during the Ready/compact transition;
    // make the final write idempotent so concurrent calls do not create twins.
    let aiMessage;
    try {
      aiMessage = await prisma.$transaction(async (tx) => {
        const existing = await tx.message.findFirst({
          where: {
            sessionId,
            forUserId: user.id,
          },
          orderBy: { timestamp: 'asc' },
        });

        if (existing) {
          return existing;
        }

        return tx.message.create({
          data: {
            sessionId,
            senderId: null,
            forUserId: user.id, // Track which user this AI response is for (data isolation)
            role: 'AI',
            content: responseContent.trim(),
            stage: currentStage,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        const existing = await prisma.message.findFirst({
          where: {
            sessionId,
            forUserId: user.id,
          },
          orderBy: { timestamp: 'asc' },
        });
        if (existing) {
          aiMessage = existing;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Embed session content for cross-session retrieval (non-blocking)
    // Per fact-ledger architecture, we embed at session level
    embedSessionContent(sessionId, user.id, turnId).catch((err: unknown) =>
      logger.warn('[getInitialMessage] Failed to embed session content:', err)
    );

    logger.info(`[getInitialMessage] Generated initial message for session ${sessionId}, stage ${currentStage}`);

    successResponse(res, {
      message: {
        id: aiMessage.id,
        sessionId: aiMessage.sessionId,
        senderId: aiMessage.senderId,
        role: aiMessage.role,
        content: aiMessage.content,
        stage: aiMessage.stage,
        timestamp: aiMessage.timestamp.toISOString(),
      },
    });
  } catch (error) {
    logger.error('[getInitialMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get initial message', 500);
  }
}

// ============================================================================
// Streaming Endpoint (SSE)
// ============================================================================

/**
 * Send SSE event to client.
 *
 * The event vocabulary and payload shapes are defined once in
 * `shared/src/contracts/stream.ts` (`StreamEvent`); both this emitter and the
 * mobile consumer compile against that contract.
 */
function sendSSE(res: Response, event: StreamEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Send a message with streaming AI response
 * POST /sessions/:id/messages/stream
 *
 * Uses Server-Sent Events (SSE) to stream the AI response in real-time.
 * Events:
 * - user_message: User message saved (includes ID)
 * - chunk: Text delta from AI
 * - text_complete: AI text finished streaming (sent before DB saves)
 * - complete: AI response complete (includes messageId and metadata)
 * - error: Error occurred (includes retryable flag)
 */
export async function sendMessageStream(req: Request, res: Response): Promise<void> {
  const requestId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Track if client disconnected
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    logger.info(`[sendMessageStream:${requestId}] Client disconnected`);
  });

  try {
    logger.info(`[sendMessageStream:${requestId}] ========== SSE STREAM REQUEST START ==========`);

    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = sendMessageRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: parseResult.error.issues });
      return;
    }

    const { content, refiningNeedId } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Check session allows messaging. RESOLVED remains open for private
    // Tending/listen-first conversation after Stage 4 closes.
    if (session.status !== 'ACTIVE') {
      if (session.status === 'CREATED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          res.status(400).json({ error: 'Session is not active' });
          return;
        }
      } else if (session.status !== 'INVITED' && session.status !== 'RESOLVED') {
        res.status(400).json({ error: 'Session is not active' });
        return;
      }
    }

    // Get user's current stage progress
    let progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: { in: ['IN_PROGRESS', 'GATE_PENDING'] },
      },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;

    let refiningNeedContext: { id: string; need: string; category?: string } | null = null;
    if (currentStage === 3 && refiningNeedId) {
      const vessel = await prisma.userVessel.findUnique({
        where: { userId_sessionId: { userId: user.id, sessionId } },
        select: { id: true },
      });
      const refiningNeed = vessel
        ? await prisma.identifiedNeed.findFirst({
            where: { id: refiningNeedId, vesselId: vessel.id },
            select: { id: true, need: true, category: true },
          })
        : null;
      if (!refiningNeed) {
        res.status(400).json({ error: 'Invalid refiningNeedId' });
        return;
      }
      refiningNeedContext = {
        id: refiningNeed.id,
        need: refiningNeed.need,
        category: refiningNeed.category,
      };
    }

    // =========================================================================
    // Save user message
    // =========================================================================
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: user.id,
        role: 'USER',
        content,
        stage: currentStage,
        refiningNeedId: refiningNeedContext?.id ?? null,
      },
    });
    await touchUserSessionActivity(sessionId, user.id, userMessage.timestamp);
    getShowActivityStatus(user.id)
      .then((showActivityStatus) => {
        if (!showActivityStatus) return;
        return publishSessionEvent(sessionId, 'partner.activity', {
          activeAt: userMessage.timestamp.toISOString(),
        }, user.id);
      })
      .catch((err) =>
        logger.warn(`[sendMessageStream:${requestId}] Failed to publish partner activity:`, err)
      );
    logger.info(`[sendMessageStream:${requestId}] User message created: ${userMessage.id}`);

    // Broadcast to Status Site
    brainService.broadcastMessage(userMessage);

    // =========================================================================
    // Set up SSE headers
    // =========================================================================
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send user_message event
    sendSSE(res, {
      event: 'user_message',
      data: {
        id: userMessage.id,
        content: userMessage.content,
        timestamp: userMessage.timestamp.toISOString(),
        refiningNeedId: userMessage.refiningNeedId ?? null,
      },
    });

    if (currentStage === 3 && isReadyForStage3RevealText(content)) {
      const gateResponse = await getStage3GateResponse(sessionId, user.id);
      if (gateResponse) {
        const aiMessage = await prisma.message.create({
          data: {
            sessionId,
            senderId: null,
            forUserId: user.id,
            role: 'AI',
            content: gateResponse,
            stage: 3,
          },
        });

        if (!clientDisconnected) {
          sendSSE(res, { event: 'chunk', data: { text: gateResponse } });
          sendSSE(res, { event: 'metadata', data: { metadata: {} } });
          sendSSE(res, { event: 'text_complete', data: { metadata: {} } });
          sendSSE(res, { event: 'complete', data: { messageId: aiMessage.id, metadata: {} } });
        }
        res.end();
        logger.info(`[sendMessageStream:${requestId}] Stage 3 ready text handled via gate response`);
        return;
      }
    }

    // =========================================================================
    // Get conversation history for context (summary-aware)
    // =========================================================================
    const existingSummary = await getSessionSummary(sessionId, user.id);
    const summaryBoundary = existingSummary?.summary.newestMessageAt;
    const historyLimit = summaryBoundary ? 30 : 20;

    const historyDesc = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id, forUserId: null },
          { forUserId: user.id },
        ],
        ...(summaryBoundary ? { timestamp: { gt: summaryBoundary } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: historyLimit,
    });
    const history = historyDesc.slice().reverse();

    // Count ALL user messages for this session (not just from the limited history window)
    // This prevents turn IDs from getting stuck when conversation exceeds 20 messages
    // Also count user messages in the CURRENT stage only — stage-specific guards
    // (e.g., feel-heard check, early-stage guidance) need stage-scoped counts so they
    // don't fire prematurely due to accumulated turns from earlier stages.
    const [userTurnCount, stageTurnCount] = await Promise.all([
      prisma.message.count({
        where: {
          sessionId,
          role: 'USER',
          senderId: user.id,
          forUserId: null,
        },
      }),
      prisma.message.count({
        where: {
          sessionId,
          role: 'USER',
          senderId: user.id,
          forUserId: null,
          stage: currentStage,
        },
      }),
    ]);
    const turnId = `${sessionId}-${user.id}-${userTurnCount}`;
    updateContext({ turnId, sessionId, userId: user.id });

    // Get partner name for context
    const partnerId = await getPartnerUserId(sessionId, user.id);
    let partnerName: string | undefined;
    if (partnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { name: true },
      });
      partnerName = partner?.name || undefined;
    } else if (session.status === 'CREATED' || session.status === 'INVITED') {
      // Partner hasn't joined yet - get name from invitation
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Build stage prompt with full context assembly (includes notable facts)
    const userName = user.name || 'there';
    const isInvitationPhase = session.status === 'CREATED';

    // Create intent for context assembly - use 'light' depth to load notable facts
    const streamingIntent: MemoryIntentResult = {
      intent: 'stage_enforcement',
      depth: 'light', // Changed from 'minimal' to ensure notable facts are included
      reason: 'Streaming response',
      threshold: 0.60,
      maxCrossSession: 0,
      allowCrossSession: false,
      surfaceStyle: 'silent',
    };

    // Assemble full context including notable facts from UserVessel
    // Also fetch latest emotional reading for intensity-dependent prompt behavior
    const [contextBundle, sharedContentHistory, milestoneContext, emotionalIntensity, capturedNeeds] = await Promise.all([
      assembleContextBundle(
        sessionId,
        user.id,
        currentStage,
        streamingIntent
      ),
      // Stage gate: no shared content should exist for Stages 0-1 (witnessing).
      // Defense-in-depth: even if the query has user isolation, skip entirely for early stages.
      currentStage >= 2
        ? getSharedContentContext(sessionId, user.id).catch((err: Error) => {
            logger.warn(`[sendMessageStream:${requestId}] Shared content context fetch failed:`, err);
            return null;
          })
        : Promise.resolve(null),
      getMilestoneContext(sessionId, user.id).catch((err: Error) => {
        logger.warn(`[sendMessageStream:${requestId}] Milestone context fetch failed:`, err);
        return null;
      }),
      (async () => {
        const vessel = await prisma.userVessel.findUnique({
          where: { userId_sessionId: { userId: user.id, sessionId } },
          select: { id: true },
        });
        if (vessel) {
          const latestReading = await prisma.emotionalReading.findFirst({
            where: { vesselId: vessel.id },
            orderBy: { timestamp: 'desc' },
            select: { intensity: true },
          });
          if (latestReading) return latestReading.intensity;
        }
        return 5; // Default if no reading
      })(),
      // Stage 3: fetch already-captured needs so the AI avoids duplicates
      currentStage === 3
        ? (async () => {
            const vessel = await prisma.userVessel.findUnique({
              where: { userId_sessionId: { userId: user.id, sessionId } },
              select: { id: true },
            });
            if (!vessel) return null;
            const needs = await prisma.identifiedNeed.findMany({
              where: { vesselId: vessel.id },
              orderBy: { createdAt: 'asc' },
              select: { id: true, need: true, confirmed: true },
            });
            return needs.length > 0 ? needs : null;
          })()
        : Promise.resolve(null),
    ]);

    logger.info(`[sendMessageStream:${requestId}] Context assembled: notableFacts=${contextBundle.notableFacts?.length ?? 0}, emotionalIntensity=${emotionalIntensity}`);

    // =========================================================================
    // Stage 2B routing: Check if user is in REFINING empathy status
    // If so, route to Stage 21 (Informed Empathy) prompt instead of Stage 2
    // =========================================================================
    let effectiveStage = currentStage;
    let reconcilerGapContext: {
      areaHint: string | null;
      guidanceType: string | null;
      promptSeed: string | null;
      iteration: number;
    } | undefined;
    let previousEmpathyContent: string | null = null;
    let stage2BSharedContext: string | null = null;
    let isRefiningEmpathy = false;
    let empathyDraftContent: string | null = null;

    if (currentStage === 2) {
      const refiningAttempt = await prisma.empathyAttempt.findFirst({
        where: {
          sessionId,
          sourceUserId: user.id,
          status: 'REFINING',
        },
        orderBy: { sharedAt: 'desc' },
      });

      if (refiningAttempt) {
        effectiveStage = 21; // Stage 2B: Informed Empathy
        previousEmpathyContent = refiningAttempt.content;
        isRefiningEmpathy = true;
        logger.info(`[sendMessageStream:${requestId}] Stage 2B routing: user has REFINING empathy, using stage 21`);

        // Fetch current empathy draft (may have been saved from a previous turn in this conversation)
        const currentEmpathyDraft = await prisma.empathyDraft.findUnique({
          where: { sessionId_userId: { sessionId, userId: user.id } },
          select: { content: true },
        });
        if (currentEmpathyDraft) {
          empathyDraftContent = currentEmpathyDraft.content;
          logger.info(`[sendMessageStream:${requestId}] Stage 2B: found existing empathy draft (${empathyDraftContent.length} chars)`);
        } else {
          // Use the previous empathy attempt content as starting draft
          empathyDraftContent = refiningAttempt.content;
          logger.info(`[sendMessageStream:${requestId}] Stage 2B: using previous empathy attempt as draft`);
        }

        // Fetch reconciler result for gap context
        const reconcilerResult = await prisma.reconcilerResult.findFirst({
          where: {
            sessionId,
            guesserId: user.id,
            supersededAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (reconcilerResult) {
          // Use abstract guidance fields only — never inject raw partner content
          // (missedFeelings, gapSummary, mostImportantGap) into the guesser's prompt
          reconcilerGapContext = {
            areaHint: reconcilerResult.areaHint,
            guidanceType: reconcilerResult.guidanceType,
            promptSeed: reconcilerResult.promptSeed,
            iteration: reconcilerResult.iteration,
          };
        }

        // Fetch shared context from partner
        const sharedContextResult = await getSharedContextForGuesser(sessionId, user.id);
        stage2BSharedContext = sharedContextResult.content;
      } else {
        // Regular Stage 2 — load empathy draft so AI can see/edit the current draft
        const currentEmpathyDraft = await prisma.empathyDraft.findUnique({
          where: { sessionId_userId: { sessionId, userId: user.id } },
          select: { content: true },
        });
        if (currentEmpathyDraft) {
          empathyDraftContent = currentEmpathyDraft.content;
          logger.info(`[sendMessageStream:${requestId}] Stage 2: found existing empathy draft (${empathyDraftContent.length} chars)`);
        }
      }
    }
    const stage4InventoryContext = currentStage === 4
      ? await getStage4InventoryPromptContext(sessionId, user.id)
      : null;

    const stage4WalkthroughContext = currentStage === 4
      ? await getStage4WalkthroughPromptContext(sessionId, user.id)
      : null;

    const stage4OpenNeeds = currentStage === 4
      ? await getStage4OpenNeedsForPrompt(sessionId, user.id)
      : null;

    const stage4ListenFirstMode = await isStage4ListenFirstMode(
      sessionId,
      user.id,
      session.status,
      history
    );
    const tendingConversationContext = session.status === 'RESOLVED'
      ? await getTendingConversationContextForPrompt(sessionId, user.id)
      : null;
    const tendingConversationPrompt = tendingConversationContext
      ? buildTendingConversationPrompt('whatHappened', {
          ...tendingConversationContext,
          userName,
          partnerName,
        })
      : null;

    const prompt = buildStagePrompt(effectiveStage, {
      userName,
      currentUserId: user.id,
      partnerUserId: partnerId,
      partnerName,
      turnCount: stageTurnCount,
      emotionalIntensity,
      contextBundle,
      sharedContentHistory,
      milestoneContext,
      reconcilerGapContext,
      previousEmpathyContent,
      sharedContextFromPartner: stage2BSharedContext || undefined,
      empathyDraft: empathyDraftContent || undefined,
      isRefiningEmpathy: isRefiningEmpathy || undefined,
      refiningNeed: refiningNeedContext,
      capturedNeeds,
      stage4InventoryContext,
      stage4WalkthroughContext,
      stage4OpenNeeds,
      stage4ListenFirstMode,
      tendingConversationContext,
      tendingConversationPrompt,
      topicFrame: session.topicFrameConfirmedAt ? session.topicFrame : undefined,
    }, { isInvitationPhase });

    // Tool calls are the primary structured-state channel. Legacy semantic tags
    // are still parsed below as a compatibility fallback and scrubbed defensively.

    // Format context bundle and inject into last user message (includes notable facts)
    const formattedContext = formatContextForPrompt(contextBundle, {
      sharedContentHistory,
      milestoneContext,
    });
    logger.info(`[sendMessageStream:${requestId}] Formatted context: ${formattedContext.length} chars`);

    // Filter out empty messages to prevent Bedrock ValidationException
    const validHistory = history.filter((m) => m.content && m.content.trim().length > 0);
    if (validHistory.length !== history.length) {
      logger.warn(`[sendMessageStream:${requestId}] Filtered out ${history.length - validHistory.length} empty message(s) from history`);
    }

    const summaryExists = Boolean(summaryBoundary);
    const { trimmed: trimmedHistory, truncated } = trimConversationHistory(
      validHistory.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      summaryExists ? CONTEXT_WINDOW.recentTurnsWithSummary : CONTEXT_WINDOW.recentTurnsWithoutSummary
    );

    if (truncated > 0) {
      logger.info(`[sendMessageStream:${requestId}] Trimmed ${truncated} old messages (summaryExists=${summaryExists})`);
    }

    // Build messages with context injected into the last user message
    const messagesWithContext = trimmedHistory.map((m, i) => {
      const isLastUserMessage = i === trimmedHistory.length - 1 && m.role === 'user';
      const content = isLastUserMessage && formattedContext.trim()
        ? `Context:\n${formattedContext}\n\nUser message: ${m.content}`
        : m.content;
      return {
        role: m.role,
        content,
      };
    });

    recordContextSizes(turnId, estimateContextSizes({
      pinned: `${prompt.staticBlock}\n\n${prompt.dynamicBlock}`,
      summary: formattedContext,
      recentMessages: trimmedHistory,
      rag: '',
    }));

    // =========================================================================
    // Stream AI response (with analysis block trap)
    // =========================================================================
    let accumulatedText = '';
    let metadata: SessionStateToolInput = {};
    let streamError: Error | null = null;

    // The three-phase hidden-tag trap (thinking trap → tag trap → normal
    // streaming with late-tag buffering) lives in StreamTagSanitizer; the
    // controller only routes deltas through it and emits what it returns.
    const sanitizer = new StreamTagSanitizer({
      info: (message) => logger.info(`[sendMessageStream:${requestId}] ${message}`),
      warn: (message) => logger.warn(`[sendMessageStream:${requestId}] ${message}`),
    });
    let isDispatchMessage = false; // Track if this is a dispatch response (skip processing)

    try {
      const stateCapturePrompt = {
        staticBlock: prompt.staticBlock,
        dynamicBlock: `${prompt.dynamicBlock}

STATE CAPTURE PASS:
Call update_session_state with any persisted state required by the latest user turn. Do not write conversational prose in this pass.`,
      };
      const stateCapture = await getModelCompletionWithTools('sonnet', {
        systemPrompt: stateCapturePrompt,
        messages: messagesWithContext,
        tools: getToolsForStage(currentStage),
        maxTokens: 1024,
        sessionId,
        turnId,
        operation: 'structured-state-capture',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      });
      const sessionStateTool = stateCapture?.toolInvocations.find((tool) => tool.name === SESSION_STATE_TOOL_NAME);
      if (sessionStateTool) {
        metadata = { ...metadata, ...parseSessionStateToolInput(sessionStateTool.input) };
        logger.info(`[sendMessageStream:${requestId}] [PRESTREAM TOOL ${sessionStateTool.name}]:`, {
          topicFrame: Boolean(metadata.topicFrame),
          proposedNeed: Boolean(metadata.proposedNeed),
          needAction: metadata.needAction?.type ?? null,
          stage4ProposalCount: metadata.stage4Proposals?.length ?? 0,
          stage4WalkthroughAction: metadata.stage4WalkthroughAction?.action ?? null,
          offerFeelHeardCheck: metadata.offerFeelHeardCheck,
          offerReadyToShare: metadata.offerReadyToShare,
        });
      } else if (stateCapture?.text) {
        const parsedStateFallback = parseMicroTagResponse(stateCapture.text);
        metadata.offerFeelHeardCheck = parsedStateFallback.offerFeelHeardCheck;
        metadata.offerReadyToShare = parsedStateFallback.offerReadyToShare;
        if (currentStage === 3 && parsedStateFallback.proposedNeed) metadata.proposedNeed = parsedStateFallback.proposedNeed;
        if (currentStage === 3 && parsedStateFallback.needAction) metadata.needAction = parsedStateFallback.needAction;
        if (currentStage === 3 && parsedStateFallback.proposedNeeds.length > 0) metadata.proposedNeeds = parsedStateFallback.proposedNeeds;
        if (currentStage === 4 && parsedStateFallback.stage4ProposalBlockPresent) metadata.stage4Proposals = parsedStateFallback.stage4Proposals;
        if (currentStage === 4 && parsedStateFallback.stage4WalkthroughAction) metadata.stage4WalkthroughAction = parsedStateFallback.stage4WalkthroughAction;
        if ((currentStage === 0 || isInvitationPhase) && parsedStateFallback.topicFrame) metadata.topicFrame = parsedStateFallback.topicFrame;
        if (currentStage === 2 && parsedStateFallback.draft) metadata.proposedEmpathyStatement = parsedStateFallback.draft;
        logger.warn(`[sendMessageStream:${requestId}] Structured state capture returned text without tool; parsed legacy fallback.`);
      }

      const visiblePrompt = {
        staticBlock: prompt.staticBlock,
        dynamicBlock: `${prompt.dynamicBlock}

VISIBLE RESPONSE PASS:
Persisted state has already been captured for this turn. The update_session_state tool is intentionally unavailable now. Ignore any instruction to call it in this pass.
Captured state summary for your private context: ${JSON.stringify({
  topicFrame: metadata.topicFrame,
  offerFeelHeardCheck: metadata.offerFeelHeardCheck,
  offerReadyToShare: metadata.offerReadyToShare,
  proposedEmpathyStatement: metadata.proposedEmpathyStatement ? '[captured]' : undefined,
  proposedNeed: metadata.proposedNeed,
  needAction: metadata.needAction,
  stage4ProposalCount: metadata.stage4Proposals?.length,
  stage4WalkthroughAction: metadata.stage4WalkthroughAction,
})}
Write only the user-facing conversational response. Do not include tool JSON, XML tags beyond the normal hidden <thinking> protocol, or state summaries.`,
      };
      const streamGenerator = getSonnetStreamingResponse({
        systemPrompt: visiblePrompt,
        messages: messagesWithContext,
        maxTokens: 1536,
        sessionId,
        turnId,
        operation: 'streaming-response',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
        // For E2E mock mode: response index is 0-based (userTurnCount is 1-based after save)
        mockResponseIndex: Math.max(0, userTurnCount - 1),
      });

      const streamStartTime = Date.now();
      let firstChunkTime: number | null = null;
      let lastChunkTime: number | null = null;
      let thinkingEndTime: number | null = null;

      /**
       * Helper to strip tags and send clean text to client
       * NOTE: Do NOT use .trim() on every chunk - it removes spaces between words when streaming
       * BUT we DO trimStart() on the FIRST chunk to remove leading newlines after </thinking>
       */
      const sendCleanText = (text: string) => {
        if (!text || clientDisconnected) return;

        // Strip ALL semantic tags as defense-in-depth (thinking trap should catch these,
        // but this prevents leaks if the trap fails due to stream errors or chunk splitting)
        let cleanText = text
          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')  // Complete thinking blocks
          .replace(/<thinking>[\s\S]*/gi, '')                // Unclosed thinking (strip to end)
          .replace(/<\/thinking>/gi, '')                     // Orphaned closing tag
          .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
          .replace(/<need>[\s\S]*?<\/need>/gi, '')
          .replace(/<need-action\b[^>]*>[\s\S]*?<\/need-action>/gi, '')
          .replace(/<need-action\b[^>]*\/>/gi, '')
          .replace(/<needs>[\s\S]*?<\/needs>/gi, '')
          .replace(/<stage4_proposals>[\s\S]*?<\/stage4_proposals>/gi, '')
          .replace(/<stage4_proposals>[\s\S]*/gi, '')
          .replace(/<\/stage4_proposals>/gi, '')
          .replace(/<stage4_walkthrough>[\s\S]*?<\/stage4_walkthrough>/gi, '')
          .replace(/<stage4_walkthrough>[\s\S]*/gi, '')
          .replace(/<\/stage4_walkthrough>/gi, '')
          .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '');

        // Trim LEADING whitespace only on the FIRST chunk (after </thinking> tag removal)
        // This removes newlines at the start without breaking word spacing in subsequent chunks
        if (!firstChunkTime && cleanText.length > 0) {
          cleanText = cleanText.trimStart();
        }

        const scrubbed = scrubVisibleAIText(cleanText, { preserveBoundaryWhitespace: true });
        cleanText = scrubbed.text;

        if (cleanText.length > 0) {
          if (!firstChunkTime) firstChunkTime = Date.now();
          accumulatedText += cleanText;
          sendSSE(res, { event: 'chunk', data: { text: cleanText } });
        }
      };

      for await (const event of streamGenerator) {
        if (event.type === 'text') {
          lastChunkTime = Date.now();
          const wasInsideThinking = sanitizer.insideThinking;
          sendCleanText(sanitizer.push(event.text));
          if (wasInsideThinking && !sanitizer.insideThinking && thinkingEndTime === null) {
            thinkingEndTime = Date.now();
            logger.info(`[sendMessageStream:${requestId}] [TIMING] Thinking phase complete at ${thinkingEndTime - streamStartTime}ms`);
          }
        }
        if (event.type === 'tool_use') {
          if (event.name === SESSION_STATE_TOOL_NAME) {
            const toolMetadata = parseSessionStateToolInput(event.input);
            metadata = { ...metadata, ...toolMetadata };
            logger.info(`[sendMessageStream:${requestId}] [TOOL ${event.name}]:`, {
              topicFrame: Boolean(toolMetadata.topicFrame),
              stage4ProposalCount: toolMetadata.stage4Proposals?.length ?? 0,
              stage4WalkthroughAction: toolMetadata.stage4WalkthroughAction?.action ?? null,
              proposedNeed: Boolean(toolMetadata.proposedNeed),
              needAction: toolMetadata.needAction?.type ?? null,
              offerFeelHeardCheck: toolMetadata.offerFeelHeardCheck,
              offerReadyToShare: toolMetadata.offerReadyToShare,
            });
          } else {
            logger.warn(`[sendMessageStream:${requestId}] Ignoring unknown tool call: ${event.name}`);
          }
          continue;
        }

        // Check for done event with error flag (generator catches errors internally
        // and yields a done event with an error string instead of throwing)
        if (event.type === 'done' && event.error) {
          throw new Error(event.error);
        }
      }

      // =========================================================================
      // SAFETY FLUSH: If the stream ends while still waiting for </thinking>,
      // keep that content hidden. It is more important to avoid leaking
      // internal reasoning/tool planning than to salvage malformed output.
      // =========================================================================
      // (Unterminated-thinking hiding vs. visible flush is decided inside the
      // sanitizer; a hidden buffer yields '' here and stays in captured.thinking.)
      sendCleanText(sanitizer.flush());

      const streamEndTime = Date.now();
      logger.info(`[sendMessageStream:${requestId}] [TIMING] Stream complete:`,
        `total=${streamEndTime - streamStartTime}ms`,
        `thinkingEnd=${thinkingEndTime ? thinkingEndTime - streamStartTime : 'none'}ms`,
        `firstVisibleChunk=${firstChunkTime ? firstChunkTime - streamStartTime : 'none'}ms`,
        `lastChunk=${lastChunkTime ? lastChunkTime - streamStartTime : 'none'}ms`);

      // =========================================================================
      // Parse accumulated response for metadata (semantic router format)
      // The thinking content has flags like FeelHeardCheck:Y, ReadyShare:Y
      // The accumulated text may contain <draft>...</draft> that needs stripping
      // =========================================================================
      const captured = sanitizer.captured;
      const needsBlock = captured.needs ? `<needs>${captured.needs}</needs>\n` : '';
      const needBlock = captured.need ? `<need>${captured.need}</need>\n` : '';
      const needActionBlock = captured.needAction ? `${captured.needAction}\n` : '';
      const stage4ProposalsBlock = captured.stage4Proposals ? `<stage4_proposals>${captured.stage4Proposals}</stage4_proposals>\n` : '';
      const stage4WalkthroughBlock = captured.stage4Walkthrough ? `<stage4_walkthrough>${captured.stage4Walkthrough}</stage4_walkthrough>\n` : '';
      const fullResponse = `<thinking>${captured.thinking}</thinking>\n${needBlock}${needActionBlock}${needsBlock}${stage4ProposalsBlock}${stage4WalkthroughBlock}${accumulatedText}`;
      const parsed = parseMicroTagResponse(fullResponse);

      // Extract metadata from parsed response
      if (metadata.offerFeelHeardCheck === undefined) {
        metadata.offerFeelHeardCheck = parsed.offerFeelHeardCheck;
      }
      if (metadata.offerReadyToShare === undefined) {
        metadata.offerReadyToShare = parsed.offerReadyToShare;
      }
      if (parsed.proposedStrategies.length > 0) {
        metadata.proposedStrategies = parsed.proposedStrategies;
      }
      if (currentStage === 4 && parsed.stage4ProposalBlockPresent && !metadata.stage4Proposals) {
        metadata.stage4Proposals = parsed.stage4Proposals;
      }
      if (currentStage === 4 && parsed.stage4WalkthroughAction && !metadata.stage4WalkthroughAction) {
        metadata.stage4WalkthroughAction = parsed.stage4WalkthroughAction;
      }
      if (currentStage === 3 && parsed.proposedNeeds.length > 0 && !metadata.proposedNeeds) {
        metadata.proposedNeeds = parsed.proposedNeeds;
      }
      if (currentStage === 3 && parsed.proposedNeed && !metadata.proposedNeed) {
        metadata.proposedNeed = parsed.proposedNeed;
      }
      if (currentStage === 3 && parsed.needAction && !metadata.needAction) {
        metadata.needAction = parsed.needAction;
      }
      if (currentStage === 3 && parsed.needParseError) {
        metadata.needParseError = parsed.needParseError;
      }

      // Use the draft captured during streaming (more reliable than re-parsing)
      const draft = captured.draft || parsed.draft;
      if (draft && currentStage === 2 && !metadata.proposedEmpathyStatement) {
        // Draft is used for empathy statement (stage 2).
        metadata.proposedEmpathyStatement = draft;
      } else if (draft && (currentStage === 0 || isInvitationPhase) && !metadata.topicFrame) {
        // Stage 0: <draft> contains the proposed topic frame.
        metadata.topicFrame = draft.trim();
      }

      logger.info(`[sendMessageStream:${requestId}] Parsed metadata:`, {
        offerFeelHeardCheck: metadata.offerFeelHeardCheck,
        offerReadyToShare: metadata.offerReadyToShare,
        hasDraft: !!parsed.draft,
        proposedNeedsCount: metadata.proposedNeeds?.length ?? 0,
        proposedNeed: !!metadata.proposedNeed,
        needAction: metadata.needAction?.type ?? null,
        needParseError: metadata.needParseError ?? null,
        stage4ProposalCount: metadata.stage4Proposals?.length ?? 0,
        dispatchTag: captured.dispatch || parsed.dispatchTag,
      });

      // Clean accumulated text (strip <draft> and <dispatch> tags if they leaked through)
      const scrubbedResponse = scrubVisibleAIText(parsed.response);
      accumulatedText = scrubbedResponse.text;
      if (
        currentStage === 4 &&
        metadata.stage4WalkthroughAction &&
        metadata.stage4WalkthroughAction.action !== 'NONE' &&
        isClarifyingStage4Response(accumulatedText)
      ) {
        logger.warn(`[sendMessageStream:${requestId}] Ignoring Stage 4 state capture because visible response asks for clarification`, {
          action: metadata.stage4WalkthroughAction.action,
          needId: metadata.stage4WalkthroughAction.needId ?? null,
          stage4ProposalCount: metadata.stage4Proposals?.length ?? 0,
        });
        metadata.stage4WalkthroughAction = {
          ...metadata.stage4WalkthroughAction,
          action: 'NONE',
          reason: 'visible_response_requested_clarification',
        };
        metadata.stage4Proposals = undefined;
      }

      // =========================================================================
      // DISPATCH HANDLING: If dispatch tag detected, get and stream dispatched response
      // Dispatch messages are system responses - skip classifier/embeddings
      // Use the dispatch tag captured during streaming (more reliable than re-parsing)
      // =========================================================================
      const dispatchTag = captured.dispatch || parsed.dispatchTag;
      if (dispatchTag) {
        logger.info(`[sendMessageStream:${requestId}] Dispatch detected: ${dispatchTag}`);
        isDispatchMessage = true;

        // Build dispatch context with conversation history and session state
        const dispatchContext: DispatchContext = {
          userMessage: content,
          conversationHistory: history.map((m) => ({
            role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
          userName,
          partnerName,
          sessionId,
          turnId,
          currentStage,
          invitationSent: session.status !== 'CREATED', // INVITED or ACTIVE means sent
          partnerJoined: session.status === 'ACTIVE',
        };

        const dispatchedResponse = await handleDispatch(dispatchTag, dispatchContext);

        if (dispatchedResponse !== null) {
          // Use ONLY the dispatch response - ignore any acknowledgment text the AI may have sent
          // (The prompt instructs AI to not send visible text, but in case it does, we ignore it)
          logger.info(`[sendMessageStream:${requestId}] Dispatch response only (ignoring any streamed acknowledgment)`);
          sendSSE(res, { event: 'chunk', data: { text: dispatchedResponse } });
          accumulatedText = dispatchedResponse;
        } else {
          // Unknown dispatch tag — fall through and use the AI's original streamed response
          logger.info(`[sendMessageStream:${requestId}] Unknown dispatch tag "${dispatchTag}" — using original AI response`);
          isDispatchMessage = false;
        }
      }

      // Guard: empty AI response after parsing + dispatch means the model emitted
      // no usable user-facing text, or the upstream stream failed without
      // producing text. Treat this as a failed turn so the frontend can show its
      // retry/error state instead of saving a misleading canned response.
      if (!accumulatedText.trim()) {
        logger.error(`[sendMessageStream:${requestId}] Empty AI response after tag stripping`, {
          dispatchTag: dispatchTag ?? null,
          scrubbedPlannerText: scrubbedResponse.scrubbed,
        });
        throw new Error('AI response was empty after tag stripping');
      }

      finalizeTurnMetrics(turnId);

    } catch (error) {
      logger.error(`[sendMessageStream:${requestId}] Stream error:`, error);
      streamError = error instanceof Error ? error : new Error(String(error));
    }

    // =========================================================================
    // Handle stream error: Delete user message, send Ably error, no DB save
    // User can retry fresh (avoids duplicate messages on retry)
    // =========================================================================
    if (streamError) {
      logger.error(`[sendMessageStream:${requestId}] Stream failed, cleaning up user message`);

      // Delete user message so retry creates fresh conversation turn
      await prisma.message.delete({ where: { id: userMessage.id } }).catch((deleteErr) => {
        logger.warn(`[sendMessageStream:${requestId}] Failed to delete user message on error:`, deleteErr);
      });

      // Publish error via Ably so frontend can update UI (mark message as failed)
      await publishMessageError(
        sessionId,
        user.id,
        userMessage.id, // ID for frontend to identify which optimistic message failed
        'Sorry, I had trouble generating a response. Please try again.',
        true // canRetry
      ).catch((ablyErr) => {
        logger.warn(`[sendMessageStream:${requestId}] Failed to publish error via Ably:`, ablyErr);
      });

      // Send SSE error event if client still connected
      if (!clientDisconnected) {
        sendSSE(res, {
          event: 'error',
          data: {
            message: 'An error occurred while generating the response.',
            retryable: true,
          },
        });
      }

      // End response and return early - do NOT save fallback AI message
      res.end();
      logger.info(`[sendMessageStream:${requestId}] ========== SSE STREAM ENDED (ERROR) ==========`);
      return;
    }

    if (currentStage === 3 && metadata.needParseError) {
      logger.warn(`[sendMessageStream:${requestId}] Ignoring invalid Stage 3 need tag: ${metadata.needParseError}`);
    }

    if (
      currentStage === 3 &&
      refiningNeedContext &&
      !metadata.proposedNeed &&
      !metadata.needAction &&
      (!metadata.proposedNeeds || metadata.proposedNeeds.length === 0)
    ) {
      try {
        const interpretedEdit = await interpretNeedEditRequest(sessionId, user.id, {
          targetNeedId: refiningNeedContext.id,
          request: [
            `The user is refining this need: "${refiningNeedContext.need}".`,
            `Their message was: "${content}".`,
            `The assistant response was: "${accumulatedText.trim()}".`,
            'If the assistant response contains a clearer wording for this same need, return an updateNeedText operation for the target need. If it does not contain a clear revision, ask for clarification.',
          ].join('\n'),
        });

        if (interpretedEdit.plan?.operations?.length) {
          const applied = await applyNeedEdits(sessionId, user.id, interpretedEdit.plan.operations);
          metadata.needsCaptured = true;
          logger.info(`[sendMessageStream:${requestId}] Applied ${applied.applied.length} fallback need refinement operation(s) for ${refiningNeedContext.id}`);

          for (const affected of applied.applied) {
            const updatedNeed = affected.needId
              ? applied.needs.find((need) => need.id === affected.needId)
              : undefined;
            const eventType = affected.operation === 'remove'
              ? 'need.deleted'
              : affected.operation === 'add'
                ? 'need.captured'
                : 'need.refined';
            await publishSessionEvent(sessionId, eventType, {
              forUserId: user.id,
              userId: user.id,
              need: updatedNeed,
              affectedNeed: affected,
            }).catch((err) =>
              logger.warn(`[sendMessageStream:${requestId}] Failed to publish ${eventType}:`, err)
            );
          }
        }
      } catch (error) {
        logger.warn(`[sendMessageStream:${requestId}] Fallback need refinement did not apply`, error);
      }
    }

    if (currentStage === 3 && metadata.proposedNeed) {
      const captured = await captureSingleNeedForUser(sessionId, user.id, metadata.proposedNeed);
      metadata.needsCaptured = true;
      logger.info(`[sendMessageStream:${requestId}] Captured single need ${captured.need.id} for user ${user.id}`);

      await publishSessionEvent(sessionId, 'need.captured', {
        forUserId: user.id,
        userId: user.id,
        need: captured.need,
        capturedAt: captured.capturedAt.toISOString(),
      }).catch((err) =>
        logger.warn(`[sendMessageStream:${requestId}] Failed to publish need.captured:`, err)
      );
    } else if (currentStage === 3 && metadata.needAction) {
      const applied = await applyNeedAction(sessionId, user.id, metadata.needAction);
      metadata.needsCaptured = applied.action === 'refine';
      const eventType = applied.action === 'refine'
        ? 'need.refined'
        : applied.action === 'delete'
          ? 'need.deleted'
          : 'need.locked';
      await publishSessionEvent(sessionId, eventType, {
        forUserId: user.id,
        userId: user.id,
        oldId: applied.oldNeed?.id,
        oldNeed: applied.oldNeed,
        newId: applied.action === 'refine' ? applied.need?.id : undefined,
        need: applied.need,
      }).catch((err) =>
        logger.warn(`[sendMessageStream:${requestId}] Failed to publish ${eventType}:`, err)
      );
    } else if (currentStage === 3 && metadata.proposedNeeds && metadata.proposedNeeds.length > 0) {
      const captured = await captureProposedNeedsForUser(sessionId, user.id, metadata.proposedNeeds);
      metadata.needsCaptured = captured.needs.length > 0;
      logger.info(`[sendMessageStream:${requestId}] Captured ${captured.needs.length} proposed needs for user ${user.id}`);

      await publishSessionEvent(sessionId, 'session.needs_extracted', {
        forUserId: user.id,
        userId: user.id,
        needsCount: captured.needs.length,
        capturedAt: captured.capturedAt.toISOString(),
      }).catch((err) =>
        logger.warn(`[sendMessageStream:${requestId}] Failed to publish needs_extracted:`, err)
      );
    }

    // =========================================================================
    // Signal that text streaming is complete (before DB saves for faster UX)
    // =========================================================================
    if (!clientDisconnected) {
      sendSSE(res, { event: 'metadata', data: { metadata } });
      sendSSE(res, { event: 'text_complete', data: { metadata } });
    }

    // =========================================================================
    // Save AI message (only if streaming succeeded)
    // Trim whitespace that Claude sometimes adds
    // =========================================================================
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: user.id,
        role: 'AI',
        content: accumulatedText.trim(),
        stage: effectiveStage, // Use effective stage (21 for Stage 2B) for analytics
        refiningNeedId: refiningNeedContext?.id ?? null,
      },
    });
    logger.info(`[sendMessageStream:${requestId}] AI message created: ${aiMessage.id}`);

    // Broadcast to Status Site
    brainService.broadcastMessage(aiMessage);

    // =========================================================================
    // Process metadata (persist to database)
    // =========================================================================
    if (currentStage === 1 && progress?.id && metadata.offerFeelHeardCheck) {
      const currentGates = (progress.gatesSatisfied as Record<string, unknown>) ?? {};
      await prisma.stageProgress.update({
        where: { id: progress.id },
        data: {
          gatesSatisfied: {
            ...currentGates,
            feelHeardCheckOffered: true,
          },
        },
      });
    }

    // Save topic frame (Stage 0 / invitation phase) - only if not already confirmed
    if ((currentStage === 0 || isInvitationPhase) && metadata.topicFrame) {
      try {
        const newTopicFrame = metadata.topicFrame.trim();
        if (newTopicFrame && !session.topicFrameConfirmedAt && newTopicFrame !== session.topicFrame) {
          await prisma.session.update({
            where: { id: sessionId },
            data: { topicFrame: newTopicFrame },
          });
          logger.info(`[sendMessageStream:${requestId}] Stage 0: Persisted topic frame "${newTopicFrame}"`);
          publishTopicFrameUpdated(sessionId, newTopicFrame, false).catch((err) =>
            logger.warn(`[sendMessageStream:${requestId}] Failed to publish topic_frame_updated:`, err)
          );
        }
      } catch (err) {
        logger.error(`[sendMessageStream:${requestId}] Failed to persist topic frame:`, err);
      }
    }

    // Save empathy draft (Stage 2 or Stage 2B)
    if ((effectiveStage === 2 || effectiveStage === 21) && metadata.offerReadyToShare && metadata.proposedEmpathyStatement) {
      await prisma.empathyDraft.upsert({
        where: {
          sessionId_userId: { sessionId, userId: user.id },
        },
        create: {
          sessionId,
          userId: user.id,
          content: metadata.proposedEmpathyStatement,
          readyToShare: false,
          version: 1,
        },
        update: {
          content: metadata.proposedEmpathyStatement,
          version: { increment: 1 },
        },
      });
    }

    // Stage 4 structured capture. ProposedStrategy micro-tags remain only as a
    // compatibility fallback feeding the same capture/apply path.
    if (currentStage === 4) {
      const captureResult = await captureStage4Turn({
        sessionId,
        userId: user.id,
        messageId: userMessage.id,
        userMessage: content,
        aiResponse: aiMessage.content,
        structuredProposals: metadata.stage4Proposals,
        compatibilityProposedStrategies: metadata.proposedStrategies,
        topicFrame: session.topicFrame || undefined,
      });
      const stage4CaptureMetadata: NonNullable<SessionStateToolInput['stage4Capture']> = {
        appliedOperationCount: captureResult.appliedOperationCount,
        skippedOperationCount: captureResult.skippedOperationCount,
        selectionCaptured: Boolean(captureResult.selection),
        closureSignalCaptured: Boolean(captureResult.closureSignal?.readyToClose),
        confidence: captureResult.confidence,
      };
      metadata.stage4Capture = stage4CaptureMetadata;

      if (captureResult.appliedOperationCount > 0 || captureResult.selection) {
        logger.info(`[sendMessageStream:${requestId}] Stage 4 capture applied`, {
          appliedOperationCount: captureResult.appliedOperationCount,
          skippedOperationCount: captureResult.skippedOperationCount,
          selectionCaptured: Boolean(captureResult.selection),
        });

        await publishSessionEvent(sessionId, 'session.strategies_updated', {
          stage: 4,
          updatedBy: user.id,
          appliedOperationCount: captureResult.appliedOperationCount,
          skippedOperationCount: captureResult.skippedOperationCount,
          selectionCaptured: Boolean(captureResult.selection),
        });
      }

      if (metadata.stage4WalkthroughAction) {
        const advanced = await applyStage4WalkthroughAction(
          sessionId,
          user.id,
          metadata.stage4WalkthroughAction
        );
        if (advanced) {
          await publishSessionEvent(sessionId, 'session.strategies_updated', {
            stage: 4,
            updatedBy: user.id,
            walkthroughUpdated: true,
            action: metadata.stage4WalkthroughAction.action,
            needId: metadata.stage4WalkthroughAction.needId ?? null,
          });
        }
      }

      const autoClosure = await applyStage4AutoClosureFromSignal({
        sessionId,
        userId: user.id,
        signal: captureResult.closureSignal,
      });
      if (autoClosure.closed) {
        stage4CaptureMetadata.autoClosed = true;
        logger.info(`[sendMessageStream:${requestId}] Stage 4 closed from conversation signal`, {
          reason: autoClosure.reason,
        });
      }
    }

    // =========================================================================
    // Send complete event (streamError case is handled above with early return)
    // =========================================================================
    if (!clientDisconnected) {
      sendSSE(res, {
        event: 'complete',
        data: {
          messageId: aiMessage.id,
          metadata,
        },
      });
    }

    // =========================================================================
    // Background tasks (non-blocking)
    // Skip for dispatch messages - they're system responses, not user conversation
    // =========================================================================
    if (isDispatchMessage) {
      logger.info(`[sendMessageStream:${requestId}] Skipping background tasks for dispatch message`);
    } else if (isMockLLMEnabled()) {
      logger.info(`[sendMessageStream:${requestId}] Skipping background tasks in mock LLM mode`);
    } else {
      // Summarize and embed session content for cross-session retrieval
      // Per fact-ledger architecture, we embed at session level after summary updates
      updateSessionSummary(sessionId, user.id, turnId)
        .then(() => embedSessionContent(sessionId, user.id, turnId))
        .catch((err: unknown) =>
          logger.warn(`[sendMessageStream:${requestId}] Failed to update summary/embedding:`, err)
        );

      // Run partner session classifier (fire-and-forget)
      // This extracts notable facts and detects memory intents
      logger.info(`[sendMessageStream:${requestId}] 🚀 Triggering background classification...`);
      (async () => {
        try {
          // Fetch existing facts for the classifier
          const userVessel = await prisma.userVessel.findUnique({
            where: { userId_sessionId: { userId: user.id, sessionId } },
            select: { notableFacts: true },
          });
          // Extract existing facts with IDs for diff-based updates
          // Legacy facts (without IDs) get UUIDs assigned via ensureFactIds
          const existingFactsWithIds: CategorizedFactWithId[] = (() => {
            if (!userVessel?.notableFacts) return [];
            const facts = userVessel.notableFacts as unknown;
            if (Array.isArray(facts)) {
              // Check if it's CategorizedFact[] or CategorizedFactWithId[] format
              if (facts.length > 0 && typeof facts[0] === 'object' && 'fact' in facts[0]) {
                // New format with category/fact (may or may not have IDs)
                return ensureFactIds(facts as CategorizedFactWithId[]);
              }
              // Old format: string[] - convert to CategorizedFactWithId
              return ensureFactIds(
                facts
                  .filter((f): f is string => typeof f === 'string')
                  .map((f) => ({ category: 'Unknown', fact: f }))
              );
            }
            return [];
          })();

          const result = await runPartnerSessionClassifier({
            userMessage: content,
            conversationHistory: history.slice(-5).map((m) => ({
              role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
              content: m.content,
            })),
            sessionId,
            userId: user.id,
            turnId,
            partnerName,
            existingFactsWithIds,
          });

          logger.info(`[sendMessageStream:${requestId}] ✅ Classification finished:`, {
            factsCount: result?.notableFacts?.length ?? 0,
            topicContext: result?.topicContext?.substring(0, 50),
          });
        } catch (err) {
          logger.error(`[sendMessageStream:${requestId}] ❌ Classification failed:`, err);
        }
      })();
    }

    // End response
    res.end();
    logger.info(`[sendMessageStream:${requestId}] ========== SSE STREAM COMPLETE ==========`);

  } catch (error) {
    logger.error(`[sendMessageStream:${requestId}] Error:`, error);

    // If headers already sent, try to send error event
    if (res.headersSent) {
      try {
        sendSSE(res, {
          event: 'error',
          data: {
            message: 'An unexpected error occurred.',
            retryable: true,
          },
        });
        res.end();
      } catch {
        // Ignore - client may have disconnected
      }
    } else {
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
}
