import { messageKeys, notificationKeys, sessionKeys, stageKeys } from '../hooks/queryKeys';

export function getPersistedMessageRefreshQueryKeys(sessionId: string) {
  return [
    messageKeys.infinite(sessionId),
    messageKeys.list(sessionId),
    sessionKeys.state(sessionId),
  ];
}

export function getStage2RealtimeInvalidationQueryKeys(sessionId: string) {
  return [
    stageKeys.empathyStatus(sessionId),
    stageKeys.partnerEmpathy(sessionId),
    stageKeys.empathyDraft(sessionId),
    stageKeys.progress(sessionId),
    ...getPersistedMessageRefreshQueryKeys(sessionId),
    stageKeys.pendingActions(sessionId),
    notificationKeys.badgeCount(),
  ];
}

export function getStage3RealtimeInvalidationQueryKeys(sessionId: string) {
  return [
    stageKeys.needs(sessionId),
    stageKeys.needsComparison(sessionId),
    stageKeys.progress(sessionId),
    ...getPersistedMessageRefreshQueryKeys(sessionId),
    stageKeys.pendingActions(sessionId),
    notificationKeys.badgeCount(),
  ];
}

export function getStage4RealtimeInvalidationQueryKeys(sessionId: string) {
  return [
    stageKeys.stage4(sessionId),
    stageKeys.strategies(sessionId),
    stageKeys.strategiesReveal(sessionId),
    stageKeys.agreements(sessionId),
    stageKeys.progress(sessionId),
    ...getPersistedMessageRefreshQueryKeys(sessionId),
    stageKeys.pendingActions(sessionId),
    notificationKeys.badgeCount(),
  ];
}
