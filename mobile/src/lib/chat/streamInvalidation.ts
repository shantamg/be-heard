/**
 * Stream invalidation policy.
 *
 * Which query keys a streaming turn must invalidate depends only on the stage
 * and on why the turn ended. That decision was previously inlined at four call
 * sites in `useStreamingMessage`, which made the differences between them hard
 * to see and easy to drift apart. It lives here as pure key derivation so the
 * differences are stated once and pinned by tests.
 *
 * These functions return keys; they do not touch the query client. The caller
 * invalidates. That is what makes the policy testable without a React tree.
 */

import { Stage } from '@meet-without-fear/shared';
import type { QueryKey } from '@tanstack/react-query';
import { messageKeys, sessionKeys, stageKeys } from '../../hooks/queryKeys';

/**
 * Stage-specific keys shared by both recovery paths.
 *
 * Stage 4 is deliberately parameterised rather than always included: the soft
 * (15s) path excludes it while the hard (90s) path includes it. See
 * `softTimeoutInvalidationKeys` for why that asymmetry is preserved.
 */
function stageRecoveryKeys(
  sessionId: string,
  stage: Stage | undefined,
  { includeStage4 }: { includeStage4: boolean }
): QueryKey[] {
  if (stage === Stage.PERSPECTIVE_STRETCH) {
    return [stageKeys.empathyStatus(sessionId)];
  }
  if (stage === Stage.NEED_MAPPING) {
    return [stageKeys.progress(sessionId)];
  }
  if (stage === Stage.STRATEGIC_REPAIR && includeStage4) {
    return [
      stageKeys.stage4(sessionId),
      stageKeys.strategies(sessionId),
      stageKeys.agreements(sessionId),
      stageKeys.progress(sessionId),
    ];
  }
  return [];
}

/**
 * Keys to invalidate after a turn streams to completion successfully.
 *
 * Note the NEED_MAPPING branch repeats `sessionKeys.state`. That duplicate is
 * carried over from the original inline code; invalidating the same key twice
 * is idempotent, so it is preserved rather than tidied away, keeping this a
 * pure extraction.
 */
export function successInvalidationKeys(
  sessionId: string,
  stage?: Stage
): QueryKey[] {
  const keys: QueryKey[] = [
    messageKeys.list(sessionId),
    messageKeys.infinite(sessionId),
    sessionKeys.state(sessionId),
  ];

  if (stage === Stage.PERSPECTIVE_STRETCH) {
    keys.push(stageKeys.empathyStatus(sessionId));
  }
  if (stage === Stage.NEED_MAPPING) {
    keys.push(stageKeys.progress(sessionId), sessionKeys.state(sessionId));
  }
  if (stage === Stage.STRATEGIC_REPAIR) {
    keys.push(
      stageKeys.stage4(sessionId),
      stageKeys.strategies(sessionId),
      stageKeys.agreements(sessionId),
      stageKeys.progress(sessionId)
    );
  }

  return keys;
}

/**
 * Keys to invalidate at the 15s soft recovery point, while the stream is still
 * open and may yet deliver its response.
 *
 * This intentionally omits the Stage 4 structured keys that the hard-timeout
 * path invalidates. The behaviour predates this extraction and is preserved
 * verbatim; whether it is correct is a separate question from whether this
 * refactor changed it. Stage 4 proposals and agreements are still being
 * written server-side at this point, so refetching them mid-turn would show
 * the user a half-built structure — plausible as intent, but unverified.
 */
export function softTimeoutInvalidationKeys(
  sessionId: string,
  stage?: Stage
): QueryKey[] {
  return [
    sessionKeys.state(sessionId),
    ...stageRecoveryKeys(sessionId, stage, { includeStage4: false }),
  ];
}

/**
 * Keys to invalidate at the 90s hard timeout, after the stream has been closed
 * and the client is falling back to server truth.
 */
export function hardTimeoutInvalidationKeys(
  sessionId: string,
  stage?: Stage
): QueryKey[] {
  return [
    sessionKeys.state(sessionId),
    ...stageRecoveryKeys(sessionId, stage, { includeStage4: true }),
  ];
}

/**
 * Keys to invalidate when the streamed text is final but persistence has not
 * yet been confirmed. Stage 3 escalates to the full success set because its
 * structured needs card is written server-side during the turn.
 */
export function textCompleteInvalidationKeys(
  sessionId: string,
  stage?: Stage
): QueryKey[] {
  if (stage === Stage.PERSPECTIVE_STRETCH) {
    return [stageKeys.empathyStatus(sessionId)];
  }
  if (stage === Stage.NEED_MAPPING) {
    return successInvalidationKeys(sessionId, stage);
  }
  return [];
}
