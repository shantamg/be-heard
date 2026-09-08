/**
 * Session realtime wire fixtures.
 *
 * One payload per MATERIALLY DISTINCT PAYLOAD SHAPE, transcribed from the
 * publishers in `backend/src` as they exist today — not idealised shapes. Call
 * sites that emit the same key set are consolidated into a single fixture (the
 * four `partner.stage_completed` fixtures cover five publisher contexts, the four
 * `session.resolved` variants cover six), because it is the divergence between
 * shapes, not the number of call sites, that the contract has to tolerate.
 *
 * These drive `contracts/__tests__/realtime.contract.test.ts`.
 *
 * SCOPE, honestly stated: these fixtures are TRANSCRIBED, not captured, so they
 * do not automatically track the publishers. A publisher that changes a payload
 * in a way the contract still accepts — say dropping an optional field, or
 * changing a string's contents — will not fail these tests.
 *
 * The mechanical guarantee lives elsewhere: the backend typechecks its publish
 * call sites against `SessionEventPublishData<E>`, derived from the same shapes,
 * so adding an UNDECLARED key or changing a declared field's TYPE fails the
 * build — for keys that are statically visible at the call site, which a value
 * laundered through an explicit annotation is not (see the module docblock in
 * `../contracts/realtime`).
 *
 * What these fixtures add on top is runtime proof that the recorded real-world
 * variants — including the awkward ones (a Date where a string is expected, an
 * ISO-string timestamp override, nullable content) — actually validate rather
 * than being dropped at the consumer boundary.
 *
 * Events documented below as having no publisher carry a synthetic envelope-only
 * fixture, purely so the registry stays exhaustive.
 *
 * Payloads are shown POST-ENVELOPE: `publishSessionEvent` stamps `timestamp` and
 * `excludeUserId` before spreading caller data and `sessionId` after it, so every
 * fixture carries them the way the wire does.
 */

import type { SessionEventType, UserEventType } from '../dto/realtime';

const SESSION_ID = 'sess_fixture_1';
const USER_A = 'user_alpha';
const USER_B = 'user_beta';
const NOW = 1750000000000;

/** Placeholder for an embedded `EmpathyExchangeStatusResponse`. */
const EMPATHY_STATUS = {
  myAttempt: null,
  partnerAttempt: null,
  partnerCompletedStage1: true,
  analyzing: false,
  awaitingSharing: false,
  hasNewSharedContext: false,
  hasUnviewedSharedContext: false,
  sharedContext: null,
  refinementHint: null,
  readyForStage3: false,
  messageCountSinceSharedContext: 0,
  sharedContentDeliveryStatus: null,
  mySharedContext: null,
  mySharedAt: null,
  myReconcilerResult: null,
  partnerHasSubmittedEmpathy: false,
  partnerEmpathyHeldStatus: null,
  partnerEmpathySubmittedAt: null,
};

const IDENTIFIED_NEED = {
  id: 'need_1',
  need: 'Recognition',
  category: 'CONNECTION',
  description: 'To have my effort acknowledged',
  evidence: ['I worked all weekend on it'],
  confirmed: false,
  aiConfidence: 0.82,
  createdAt: '2026-05-30T12:00:00.000Z',
};

const MESSAGE_DTO = {
  id: 'msg_1',
  sessionId: SESSION_ID,
  senderId: null,
  role: 'AI',
  content: 'That sounds really hard.',
  stage: 1,
  timestamp: '2026-05-30T12:00:00.000Z',
};

const envelope = (extra?: { excludeUserId?: string }) => ({
  sessionId: SESSION_ID,
  timestamp: NOW,
  ...(extra?.excludeUserId ? { excludeUserId: extra.excludeUserId } : {}),
});

/**
 * Keyed by event name; each entry is a list of real published variants.
 * Every `SessionEventType` must appear — the contract test asserts it.
 */
export const sessionEventFixtures: Record<SessionEventType, Array<Record<string, unknown>>> = {
  // --- Partner actions ------------------------------------------------------
  'partner.signed_compact': [
    // controllers/stage0.ts (notifyPartner)
    {
      ...envelope(),
      signedBy: USER_A,
      signedAt: '2026-05-30T12:00:00.000Z',
      triggeredByUserId: USER_A,
    },
  ],

  'partner.stage_completed': [
    // controllers/messages.ts — Stage 1 completion ping
    { ...envelope(), stage: 1, completedBy: USER_A },
    // controllers/stage2.ts — validation result, excludes the actor
    {
      ...envelope({ excludeUserId: USER_A }),
      stage: 2,
      validated: true,
      completedBy: USER_A,
      empathyStatus: EMPATHY_STATUS,
      triggeredByUserId: USER_A,
    },
    // controllers/stage2.ts — Stage 2 -> 3 transition with an addressed message
    {
      ...envelope(),
      forUserId: USER_B,
      previousStage: 2,
      currentStage: 3,
      userId: USER_A,
      triggeredByUserId: USER_A,
      message: {
        id: 'msg_transition',
        content: 'You have both completed Stage 2.',
        timestamp: '2026-05-30T12:00:00.000Z',
        forUserId: USER_B,
      },
    },
    // controllers/stage3.ts — Stage 3 -> 4 transition, also carries `stage`
    {
      ...envelope(),
      forUserId: USER_B,
      previousStage: 3,
      currentStage: 4,
      stage: 3,
      userId: USER_A,
      triggeredByUserId: USER_A,
      message: {
        id: 'msg_transition_2',
        content: 'Moving to Stage 4.',
        timestamp: '2026-05-30T12:00:00.000Z',
        forUserId: USER_B,
      },
    },
  ],

  'partner.advanced': [
    // controllers/messages.ts
    { ...envelope(), fromStage: 1, toStage: 2 },
    // controllers/sessions.ts
    {
      ...envelope(),
      toStage: 3,
      advancedAt: '2026-05-30T12:00:00.000Z',
      triggeredByUserId: USER_A,
    },
  ],

  'partner.empathy_shared': [
    // controllers/stage2.ts
    { ...envelope(), stage: 2, sharedBy: USER_A, empathyStatus: EMPATHY_STATUS },
  ],

  // No current backend publisher — envelope-only shape.
  'partner.additional_context_shared': [{ ...envelope() }],
  'partner.empathy_revealed': [{ ...envelope() }],

  'partner.session_viewed': [
    // controllers/sessions.ts, excludes the viewer
    {
      ...envelope({ excludeUserId: USER_A }),
      viewedAt: '2026-05-30T12:00:00.000Z',
      activeAt: '2026-05-30T12:00:00.000Z',
      presenceVisible: true,
      empathyStatuses: { [USER_A]: EMPATHY_STATUS, [USER_B]: EMPATHY_STATUS },
    },
    // nullable variant — neither timestamp set yet
    {
      ...envelope({ excludeUserId: USER_A }),
      viewedAt: null,
      activeAt: null,
      presenceVisible: false,
      empathyStatuses: {},
    },
  ],

  'partner.share_tab_viewed': [
    {
      ...envelope({ excludeUserId: USER_A }),
      viewedAt: '2026-05-30T12:00:00.000Z',
      activeAt: null,
      presenceVisible: true,
      empathyStatuses: { [USER_B]: EMPATHY_STATUS },
    },
  ],

  'partner.activity': [
    // controllers/messages.ts, excludes the actor
    { ...envelope({ excludeUserId: USER_A }), activeAt: '2026-05-30T12:00:00.000Z' },
  ],

  'partner.skipped_refinement': [
    // controllers/stage2.ts
    { ...envelope(), willingToAccept: true },
  ],

  // --- Empathy reconciler ---------------------------------------------------
  'empathy.share_suggestion': [
    // controllers/messages.ts — the widest variant
    {
      ...envelope(),
      forUserId: USER_B,
      guesserName: 'your partner',
      suggestedContent: 'Tell them about the deadline.',
      suggestedReason: 'They guessed the frustration but missed the cause.',
      empathyStatus: EMPATHY_STATUS,
      triggeredByUserId: USER_A,
    },
    // controllers/stage2.ts — no suggested content
    {
      ...envelope(),
      forUserId: USER_B,
      guesserName: 'your partner',
      empathyStatus: EMPATHY_STATUS,
      triggeredByUserId: USER_A,
    },
  ],

  'empathy.revealed': [
    // services/reconciler/state.ts — empathyStatus may be undefined (index access)
    {
      ...envelope(),
      direction: 'outgoing',
      guesserUserId: USER_A,
      forUserId: USER_B,
      empathyStatus: EMPATHY_STATUS,
    },
    { ...envelope(), direction: 'outgoing', guesserUserId: USER_A, forUserId: USER_B },
  ],

  'empathy.refining': [
    // controllers/stage2.ts
    {
      ...envelope(),
      guesserId: USER_A,
      forUserId: USER_A,
      empathyStatus: EMPATHY_STATUS,
      hasNewContext: true,
    },
  ],

  'empathy.context_shared': [
    // controllers/reconciler.ts — content optional at one site
    {
      ...envelope({ excludeUserId: USER_A }),
      stage: 2,
      sharedBy: USER_A,
      content: 'The deadline moved up two weeks.',
      forUserId: USER_B,
      empathyStatus: EMPATHY_STATUS,
      triggeredByUserId: USER_A,
    },
    {
      ...envelope({ excludeUserId: USER_A }),
      stage: 2,
      sharedBy: USER_A,
      forUserId: USER_B,
      empathyStatus: EMPATHY_STATUS,
      triggeredByUserId: USER_A,
    },
  ],

  'empathy.status_updated': [
    // controllers/stage2.ts — broadcast variant, no recipient
    {
      ...envelope(),
      stage: 2,
      statuses: { [USER_A]: 'SUBMITTED', [USER_B]: null },
      empathyStatuses: { [USER_A]: EMPATHY_STATUS, [USER_B]: EMPATHY_STATUS },
    },
    // controllers/stage2.ts — validation result, addressed
    {
      ...envelope({ excludeUserId: USER_A }),
      status: 'VALIDATED',
      forUserId: USER_B,
      empathyStatus: EMPATHY_STATUS,
      validatedBy: USER_A,
      feedbackShared: true,
      validationFeedback: 'You got the frustration exactly right.',
      triggeredByUserId: USER_A,
    },
    // services/reconciler/state.ts — re-passes sessionId/timestamp, `message` is a STRING
    {
      sessionId: SESSION_ID,
      timestamp: NOW,
      status: 'AWAITING_SHARING',
      forUserId: USER_B,
      empathyStatus: EMPATHY_STATUS,
      subjectName: 'Alex',
      message: 'Waiting for your partner to share more context.',
    },
  ],

  'empathy.resubmitted': [
    // services/realtime.ts publishEmpathyResubmitted
    { ...envelope(), forUserId: USER_B, guesserUserId: USER_A },
  ],

  // --- Stage 3: need mapping ------------------------------------------------
  'session.needs_extracted': [
    // services/stream-turn-actions.ts
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      needsCount: 3,
      capturedAt: '2026-05-30T12:00:00.000Z',
    },
  ],

  'need.captured': [
    // services/stream-turn-actions.ts — direct capture
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      need: IDENTIFIED_NEED,
      capturedAt: '2026-05-30T12:00:00.000Z',
    },
    // services/stream-turn-actions.ts — need-edit path, `need` may be undefined
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      affectedNeed: { operation: 'add', after: { text: 'Recognition' } },
    },
  ],

  'need.refined': [
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      need: IDENTIFIED_NEED,
      affectedNeed: { needId: 'need_1', operation: 'text_change' },
    },
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      oldId: 'need_0',
      oldNeed: IDENTIFIED_NEED,
      newId: 'need_1',
      need: IDENTIFIED_NEED,
    },
  ],

  'need.locked': [
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      oldId: 'need_1',
      oldNeed: IDENTIFIED_NEED,
      need: IDENTIFIED_NEED,
    },
  ],

  'need.deleted': [
    // controllers/stage3.ts
    { ...envelope(), forUserId: USER_A, userId: USER_A, oldId: 'need_1', need: IDENTIFIED_NEED },
    // services/stream-turn-actions.ts — need-edit removal path
    {
      ...envelope(),
      forUserId: USER_A,
      userId: USER_A,
      affectedNeed: { needId: 'need_1', operation: 'remove' },
    },
  ],

  'partner.needs_confirmed': [{ ...envelope(), stage: 3, confirmedBy: USER_A }],
  'partner.needs_shared': [{ ...envelope(), stage: 3, sharedBy: USER_A, needsRevealReady: true }],
  'partner.needs_validated': [
    {
      ...envelope(),
      stage: 3,
      validatedBy: USER_A,
      validated: true,
      allValidatedByBoth: false,
    },
  ],
  'session.needs_reveal_ready': [{ ...envelope(), stage: 3, needsRevealReady: true }],

  // Legacy aliases — no current publisher.
  'session.common_ground_ready': [{ ...envelope() }],
  'partner.common_ground_confirmed': [{ ...envelope() }],

  // --- Stage 4: strategic repair -------------------------------------------
  'session.strategies_updated': [
    // controllers/stage4-subchat.ts
    { ...envelope(), stage: 4, submittedBy: USER_A, change: 'stage4_subchat_resolved' },
    // controllers/stage4.ts
    { ...envelope(), stage: 4, submittedBy: USER_A, change: 'stage4_selection_submitted' },
    // services/stream-turn-actions.ts — capture summary
    {
      ...envelope(),
      stage: 4,
      updatedBy: USER_A,
      appliedOperationCount: 2,
      skippedOperationCount: 0,
      selectionCaptured: true,
    },
    // services/stream-turn-actions.ts — walkthrough, needId nullable
    {
      ...envelope(),
      stage: 4,
      updatedBy: USER_A,
      walkthroughUpdated: true,
      action: 'COVERED',
      needId: null,
    },
  ],

  'partner.ranking_submitted': [{ ...envelope(), stage: 4, submittedBy: USER_A }],
  'partner.ready_to_rank': [{ ...envelope(), stage: 4, readyBy: USER_A }],

  'partner.consent_granted': [
    { ...envelope(), contentType: 'EMPATHY_STATEMENT', consentedAt: '2026-05-30T12:00:00.000Z' },
  ],
  'partner.consent_revoked': [
    { ...envelope(), contentType: 'EMPATHY_STATEMENT', revokedAt: '2026-05-30T12:00:00.000Z' },
  ],

  // --- Agreements -----------------------------------------------------------
  'agreement.proposed': [{ ...envelope(), agreementId: 'agr_1', proposedBy: USER_A }],
  'agreement.confirmed': [
    {
      ...envelope(),
      agreementId: 'agr_1',
      confirmedBy: USER_A,
      confirmed: true,
      bothConfirmed: false,
    },
  ],

  // --- Session lifecycle ----------------------------------------------------
  'session.joined': [
    // controllers/invitations.ts — userName is nullable
    { ...envelope(), joinedBy: USER_B, userId: USER_B, userName: 'Beta' },
    { ...envelope(), joinedBy: USER_B, userId: USER_B, userName: null },
  ],
  'session.paused': [
    { ...envelope(), pausedBy: USER_A, pausedAt: '2026-05-30T12:00:00.000Z' },
    { ...envelope(), pausedBy: USER_A, reason: 'Taking a break' },
  ],
  'session.resumed': [{ ...envelope(), resumedBy: USER_A, resumedAt: '2026-05-30T12:00:00.000Z' }],
  'session.resolved': [
    // controllers/sessions.ts
    { ...envelope(), resolvedBy: USER_A, resolvedAt: '2026-05-30T12:00:00.000Z' },
    // controllers/stage4.ts — notifyPartner variant
    { ...envelope(), closedBy: USER_A, kind: 'SHARED_AGREEMENT', agreementIds: ['agr_1'] },
    // controllers/stage4.ts — broadcast variant
    { ...envelope(), closureKind: 'NO_SHARED_AGREEMENT', agreementIds: [] },
    // controllers/stage4.ts — agreement confirmation nudge
    { ...envelope(), agreementId: 'agr_1' },
  ],
  'session.abandoned': [
    // services/account-deletion.ts
    { ...envelope(), reason: 'partner_deleted_account', partnerName: 'Alex' },
  ],
  'session.topic_frame_updated': [
    // services/realtime.ts publishTopicFrameUpdated — no excludeUserId key at all
    {
      sessionId: SESSION_ID,
      timestamp: NOW,
      topicFrame: 'Feeling unheard about weekend plans',
      confirmed: false,
    },
  ],

  // --- Invitations ----------------------------------------------------------
  'invitation.declined': [
    { ...envelope(), reason: 'Not ready yet' },
    // reason is optional on the request body
    { ...envelope() },
  ],
  'invitation.confirmed': [
    // controllers/sessions.ts — NOTE: timestamp is an ISO STRING here, overriding
    // the numeric envelope value. This is the only event where that happens.
    {
      sessionId: SESSION_ID,
      timestamp: '2026-05-30T12:00:00.000Z',
      confirmedBy: USER_B,
      triggeredByUserId: USER_B,
    },
  ],

  // --- Presence / typing / stage sync --------------------------------------
  'presence.online': [{ ...envelope(), userId: USER_A, name: 'Alex', status: 'ONLINE' }],
  'presence.offline': [{ ...envelope(), userId: USER_A, status: 'OFFLINE' }],
  'presence.away': [{ ...envelope(), userId: USER_A, status: 'AWAY' }],

  'typing.start': [{ ...envelope({ excludeUserId: USER_A }), userId: USER_A, isTyping: true }],
  'typing.stop': [{ ...envelope({ excludeUserId: USER_A }), userId: USER_A, isTyping: false }],

  'stage.progress': [
    // controllers/stage2.ts
    { ...envelope(), previousStage: 2, stage: 3, userId: USER_A, triggeredByUserId: USER_A },
    // services/realtime.ts publishStageProgress
    {
      ...envelope({ excludeUserId: USER_A }),
      userId: USER_A,
      stage: 3,
      status: 'in_progress',
    },
  ],
  'stage.waiting': [
    {
      ...envelope({ excludeUserId: USER_A }),
      userId: USER_A,
      stage: 2,
      status: 'gate_pending',
    },
  ],

  // --- Memory ---------------------------------------------------------------
  'memory.suggested': [
    {
      ...envelope(),
      suggestion: {
        id: 'mem_1',
        suggestedContent: 'Alex values advance notice about schedule changes.',
        category: 'PREFERENCE',
        confidence: 0.7,
        evidence: ['I wish you had told me sooner'],
      },
    },
  ],

  // --- Fire-and-forget message events ---------------------------------------
  'message.ai_response': [
    // services/realtime.ts publishMessageAIResponse — no metadata
    { ...envelope(), forUserId: USER_A, message: MESSAGE_DTO },
    // with the full metadata spread, including the undeclared `expectingMore`
    {
      ...envelope(),
      forUserId: USER_A,
      message: MESSAGE_DTO,
      offerFeelHeardCheck: true,
      offerReadyToShare: false,
      proposedEmpathyStatement: 'You felt dismissed when plans changed.',
      expectingMore: false,
    },
    { ...envelope(), forUserId: USER_A, message: MESSAGE_DTO, proposedEmpathyStatement: null },
  ],

  'message.error': [
    {
      ...envelope(),
      forUserId: USER_A,
      userMessageId: 'msg_user_1',
      error: 'Something went wrong. Please try again.',
      canRetry: true,
    },
  ],

  // --- Context assembly -----------------------------------------------------
  'context.updated': [{ ...envelope(), userId: USER_A, assembledAt: '2026-05-30T12:00:00.000Z' }],

  // --- Notifications --------------------------------------------------------
  'notification.pending_action': [
    // services/realtime.ts publishPendingAction — reconciler family
    { ...envelope(), forUserId: USER_B, actionType: 'share_offer', actionId: 'offer_1' },
    // services/tending.service.ts — entry shared
    {
      ...envelope({ excludeUserId: USER_A }),
      kind: 'tending_entry_shared',
      tendingEntryId: 'te_1',
      ownerUserId: USER_A,
    },
    // services/tending.service.ts — check-in submitted, newSessionId may be undefined
    {
      ...envelope({ excludeUserId: USER_A }),
      kind: 'tending_checkin_submitted',
      continueChoice: 'CONTINUE',
      nextAction: 'SCHEDULE',
      submittedBy: USER_A,
    },
    // services/tending.service.ts — reminder due, note nullable
    {
      ...envelope(),
      kind: 'tending_reminder_due',
      reminderId: 'rem_1',
      tendingEntryId: 'te_1',
      scope: 'SHARED',
      note: null,
      userId: USER_A,
    },
    // services/tending.service.ts — coordination timed out
    {
      ...envelope(),
      kind: 'tending_coordination_timed_out',
      coordinationCycleId: 'cc_1',
      submittedUserIds: [USER_A],
      missingUserIds: [USER_B],
    },
    // services/tending.service.ts — coordination resolved, nextScheduledFor nullable
    {
      ...envelope(),
      kind: 'tending_coordination_resolved',
      coordinationCycleId: 'cc_1',
      resultSummary: 'Both partners confirmed.',
      nextScheduledFor: null,
    },
  ],
};

/** User-channel fixtures, keyed by `UserEventType`. */
export const userEventFixtures: Record<UserEventType, Array<Record<string, unknown>>> = {
  'session.updated': [
    // services/realtime.ts notifySessionMembers — bare
    { sessionId: SESSION_ID, timestamp: NOW },
    // services/tending.service.ts
    {
      sessionId: SESSION_ID,
      timestamp: NOW,
      kind: 'tending_checkin_opened',
      tendingEntryId: 'te_1',
      scope: 'SHARED',
    },
    {
      sessionId: SESSION_ID,
      timestamp: NOW,
      kind: 'tending_reminder_due',
      reminderId: 'rem_1',
      tendingEntryId: 'te_1',
      scope: 'PRIVATE',
      note: null,
      userId: USER_A,
    },
  ],
  'session.new_message': [{ sessionId: SESSION_ID, timestamp: NOW }],
  'memory.suggested': [
    {
      sessionId: SESSION_ID,
      timestamp: NOW,
      suggestion: { id: 'mem_1', suggestedContent: 'x', category: 'PREFERENCE', confidence: 0.5 },
    },
  ],
};

/**
 * Envelope-level payloads that MUST be rejected by the consumer boundary.
 *
 * Not the complete rejection surface: a known event whose DECLARED field carries
 * the wrong type is also dropped (covered separately in the contract test). What
 * matters is that no payload a publisher actually emits falls into either
 * category.
 */
export const invalidSessionEventPayloads: Array<{ label: string; payload: unknown }> = [
  { label: 'null payload', payload: null },
  { label: 'undefined payload', payload: undefined },
  { label: 'string payload', payload: 'not-an-object' },
  { label: 'array payload', payload: [] },
  { label: 'missing sessionId', payload: { timestamp: NOW, userId: USER_A } },
  { label: 'non-string sessionId', payload: { sessionId: 42, timestamp: NOW } },
];
