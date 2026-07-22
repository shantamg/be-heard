import { messageKeys, notificationKeys, sessionKeys, stageKeys } from '../../hooks/queryKeys';
import {
  getPersistedMessageRefreshQueryKeys,
  getStage2RealtimeInvalidationQueryKeys,
  getStage3RealtimeInvalidationQueryKeys,
  getStage4RealtimeInvalidationQueryKeys,
} from '../realtimeInvalidation';

describe('realtime invalidation key sets', () => {
  const sessionId = 'session-1';

  it('covers all persisted message refresh caches used by the active session screen', () => {
    expect(getPersistedMessageRefreshQueryKeys(sessionId)).toEqual([
      messageKeys.infinite(sessionId),
      messageKeys.list(sessionId),
      sessionKeys.state(sessionId),
    ]);
  });

  it('covers Stage 2 dependent state and message caches', () => {
    expect(getStage2RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.empathyStatus(sessionId),
      stageKeys.partnerEmpathy(sessionId),
      stageKeys.empathyDraft(sessionId),
      stageKeys.progress(sessionId),
      messageKeys.infinite(sessionId),
      messageKeys.list(sessionId),
      sessionKeys.state(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });

  it('covers Stage 3 needs reveal, progress, session, and message caches', () => {
    expect(getStage3RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.needs(sessionId),
      stageKeys.needsComparison(sessionId),
      stageKeys.progress(sessionId),
      messageKeys.infinite(sessionId),
      messageKeys.list(sessionId),
      sessionKeys.state(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });

  it('covers redesigned Stage 4, legacy strategy, agreement, progress, session, and message caches', () => {
    expect(getStage4RealtimeInvalidationQueryKeys(sessionId)).toEqual([
      stageKeys.stage4(sessionId),
      stageKeys.strategies(sessionId),
      stageKeys.strategiesReveal(sessionId),
      stageKeys.agreements(sessionId),
      stageKeys.progress(sessionId),
      messageKeys.infinite(sessionId),
      messageKeys.list(sessionId),
      sessionKeys.state(sessionId),
      stageKeys.pendingActions(sessionId),
      notificationKeys.badgeCount(),
    ]);
  });
});
