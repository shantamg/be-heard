/**
 * Scroll anchoring for the transcript.
 *
 * The rule the whole controller exists to protect: a reader who has scrolled up
 * stays where they are. Streaming text, a growing typewriter, a keyboard
 * opening, and a re-layout must never yank them to the bottom. Only two things
 * move the viewport on their own — the first render of a session, and a
 * genuinely new item arriving — and both are decided from timestamps, not from
 * how often the list re-rendered.
 *
 * This is deliberately a plain object rather than a hook. Scroll anchoring is
 * per-frame, imperative bookkeeping about a native view; putting it in React
 * state would both re-render on every scroll event and lose the ordering that
 * makes anchoring correct. It holds no server-derived data.
 */

/** Distance from the bottom, in px, within which the reader counts as "at the bottom". */
export const NEAR_BOTTOM_THRESHOLD_PX = 80;

export interface ScrollMetrics {
  offset: number;
  contentHeight: number;
  layoutHeight: number;
}

/** The subset of a React Native scroll event this controller reads. */
export interface ScrollEventMetrics {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}

export type ScrollTarget =
  /** Metrics are known: scroll to this exact offset. */
  | { kind: 'offset'; offset: number }
  /** Metrics are not measured yet; fall back to the list's own scroll-to-end. */
  | { kind: 'end' };

export type ContentSizeResolution =
  /** Prepended history grew the content; hold the reader's anchor by this offset. */
  | { kind: 'restore-history'; offset: number }
  /** The reader was at the bottom; follow the new content. */
  | { kind: 'stick-to-bottom' }
  /** Do nothing. */
  | { kind: 'none' };

export type NewestItemResolution =
  /** First measured item for this session: jump to the bottom without animating. */
  | 'initial-jump'
  /** A genuinely newer item arrived: follow it. */
  | 'follow-new-item'
  /** Same newest item as last time (history load, re-render): hold position. */
  | 'none';

export interface StickToBottomController {
  getMetrics(): Readonly<ScrollMetrics>;
  /** Whether the viewport should follow content growth right now. */
  isAnchored(): boolean;
  /** Assert the anchor, e.g. just before a deliberate scroll to the bottom. */
  anchor(): void;
  observeScroll(event: ScrollEventMetrics): void;
  observeLayoutHeight(height: number): void;
  /** Where a scroll-to-bottom should land given the metrics measured so far. */
  resolveScrollTarget(): ScrollTarget;
  markInitialBottomScrollComplete(): void;
  markUserDragged(): void;
  /** History paging is only allowed after the first bottom scroll and a real drag. */
  canLoadMoreHistory(): boolean;
  isLoadingHistory(): boolean;
  beginHistoryLoad(): void;
  /** Give up on an in-flight history load that produced no new content. */
  abortHistoryLoad(): void;
  observeContentSize(height: number): ContentSizeResolution;
  observeNewestItemTimestamp(timestamp: number): NewestItemResolution;
  /** Forget per-session scroll history when the transcript is swapped out. */
  resetForSession(): void;
}

export function createStickToBottomController(): StickToBottomController {
  const metrics: ScrollMetrics = { offset: 0, contentHeight: 0, layoutHeight: 0 };

  let isNearBottom = true;
  let shouldStickToBottom = true;
  let initialBottomScrollComplete = false;
  let userHasDraggedTranscript = false;
  let loadingHistory = false;
  let historyLoadSnapshot: { contentHeight: number; scrollOffset: number } | null = null;
  let newestItemTimestamp = 0;

  const isAnchored = () => isNearBottom || shouldStickToBottom;

  return {
    getMetrics: () => metrics,

    isAnchored,

    anchor: () => {
      shouldStickToBottom = true;
    },

    observeScroll: ({ contentOffset, contentSize, layoutMeasurement }) => {
      const distanceFromBottom = Math.max(
        0,
        contentSize.height - layoutMeasurement.height - contentOffset.y,
      );

      metrics.offset = contentOffset.y;
      metrics.contentHeight = contentSize.height;
      metrics.layoutHeight = layoutMeasurement.height;

      // A scroll away from the bottom is the reader taking control; it drops the
      // anchor until they come back.
      isNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
      shouldStickToBottom = isNearBottom;
    },

    observeLayoutHeight: (height) => {
      metrics.layoutHeight = height;
    },

    resolveScrollTarget: () => {
      if (metrics.contentHeight > 0 && metrics.layoutHeight > 0) {
        return {
          kind: 'offset',
          offset: Math.max(0, metrics.contentHeight - metrics.layoutHeight),
        };
      }
      return { kind: 'end' };
    },

    markInitialBottomScrollComplete: () => {
      initialBottomScrollComplete = true;
    },

    markUserDragged: () => {
      userHasDraggedTranscript = true;
    },

    canLoadMoreHistory: () => initialBottomScrollComplete && userHasDraggedTranscript,

    isLoadingHistory: () => loadingHistory,

    beginHistoryLoad: () => {
      loadingHistory = true;
      historyLoadSnapshot = {
        contentHeight: metrics.contentHeight,
        scrollOffset: metrics.offset,
      };
    },

    abortHistoryLoad: () => {
      loadingHistory = false;
      historyLoadSnapshot = null;
    },

    observeContentSize: (height) => {
      metrics.contentHeight = height;

      if (!loadingHistory || !historyLoadSnapshot) {
        return isAnchored() ? { kind: 'stick-to-bottom' } : { kind: 'none' };
      }

      // Content grew because history was prepended above the viewport. Push the
      // offset down by exactly what was added so nothing appears to move.
      if (historyLoadSnapshot.contentHeight > 0 && height > historyLoadSnapshot.contentHeight) {
        const delta = height - historyLoadSnapshot.contentHeight;
        const offset = historyLoadSnapshot.scrollOffset + delta;

        historyLoadSnapshot = null;
        loadingHistory = false;

        return { kind: 'restore-history', offset };
      }

      return { kind: 'none' };
    },

    observeNewestItemTimestamp: (timestamp) => {
      const previous = newestItemTimestamp;
      newestItemTimestamp = timestamp;

      if (previous === 0) return 'initial-jump';
      // An equal timestamp means the newest item did not change — a history page
      // landed, or the list simply re-rendered. Hold position.
      if (timestamp > previous) return 'follow-new-item';
      return 'none';
    },

    resetForSession: () => {
      initialBottomScrollComplete = false;
      userHasDraggedTranscript = false;
    },
  };
}
