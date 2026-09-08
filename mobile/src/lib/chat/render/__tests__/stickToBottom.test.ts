import {
  createStickToBottomController,
  NEAR_BOTTOM_THRESHOLD_PX,
  StickToBottomController,
} from '../stickToBottom';

const LAYOUT_HEIGHT = 600;
const CONTENT_HEIGHT = 2000;

/** Emit a scroll event that leaves the reader `distanceFromBottom` px from the end. */
function scrollTo(controller: StickToBottomController, distanceFromBottom: number): void {
  controller.observeScroll({
    contentOffset: { y: CONTENT_HEIGHT - LAYOUT_HEIGHT - distanceFromBottom },
    contentSize: { height: CONTENT_HEIGHT },
    layoutMeasurement: { height: LAYOUT_HEIGHT },
  });
}

describe('createStickToBottomController', () => {
  let controller: StickToBottomController;

  beforeEach(() => {
    controller = createStickToBottomController();
  });

  it('starts anchored so a freshly opened transcript lands at the bottom', () => {
    expect(controller.isAnchored()).toBe(true);
  });

  describe('anchoring follows the reader', () => {
    it('stays anchored while the reader sits within the near-bottom threshold', () => {
      scrollTo(controller, NEAR_BOTTOM_THRESHOLD_PX - 1);
      expect(controller.isAnchored()).toBe(true);
    });

    it('drops the anchor as soon as the reader scrolls past the threshold', () => {
      scrollTo(controller, NEAR_BOTTOM_THRESHOLD_PX);
      expect(controller.isAnchored()).toBe(false);
    });

    it('drops the anchor when the reader scrolls well up the transcript', () => {
      scrollTo(controller, 900);
      expect(controller.isAnchored()).toBe(false);
    });

    it('re-anchors when the reader scrolls back down', () => {
      scrollTo(controller, 900);
      scrollTo(controller, 0);
      expect(controller.isAnchored()).toBe(true);
    });

    it('clamps an over-scroll past the end to still count as the bottom', () => {
      scrollTo(controller, -200);
      expect(controller.isAnchored()).toBe(true);
    });

    it('re-anchors on an explicit anchor() call', () => {
      scrollTo(controller, 900);
      controller.anchor();
      expect(controller.isAnchored()).toBe(true);
    });
  });

  describe('a scrolled-up reader is not pulled to the bottom', () => {
    beforeEach(() => {
      scrollTo(controller, 900);
    });

    it('does not follow content growth from streaming text', () => {
      // Streamed characters grow the content without changing the newest item.
      expect(controller.observeContentSize(CONTENT_HEIGHT + 40)).toEqual({ kind: 'none' });
      expect(controller.observeContentSize(CONTENT_HEIGHT + 80)).toEqual({ kind: 'none' });
      expect(controller.observeContentSize(CONTENT_HEIGHT + 400)).toEqual({ kind: 'none' });
    });

    it('does not follow a re-layout', () => {
      controller.observeLayoutHeight(400);
      expect(controller.isAnchored()).toBe(false);
    });

    it('reports the same newest item as no movement', () => {
      controller.observeNewestItemTimestamp(1000);
      expect(controller.observeNewestItemTimestamp(1000)).toBe('none');
    });
  });

  describe('a reader at the bottom follows new content', () => {
    beforeEach(() => {
      scrollTo(controller, 0);
    });

    it('sticks to the bottom as content grows', () => {
      expect(controller.observeContentSize(CONTENT_HEIGHT + 40)).toEqual({
        kind: 'stick-to-bottom',
      });
    });
  });

  describe('observeNewestItemTimestamp', () => {
    it('jumps on the first measured item', () => {
      expect(controller.observeNewestItemTimestamp(1000)).toBe('initial-jump');
    });

    it('follows a genuinely newer item', () => {
      controller.observeNewestItemTimestamp(1000);
      expect(controller.observeNewestItemTimestamp(2000)).toBe('follow-new-item');
    });

    it('holds position when a history page arrives below the watermark', () => {
      controller.observeNewestItemTimestamp(2000);
      expect(controller.observeNewestItemTimestamp(1000)).toBe('none');
    });

    it('holds position on a re-render with no new item', () => {
      controller.observeNewestItemTimestamp(2000);
      expect(controller.observeNewestItemTimestamp(2000)).toBe('none');
      expect(controller.observeNewestItemTimestamp(2000)).toBe('none');
    });

    it('treats a first item with timestamp zero as still uninitialised', () => {
      // An undated newest item reports 0, which cannot be told apart from "not
      // measured yet"; both jump to the bottom, which is the safe direction.
      expect(controller.observeNewestItemTimestamp(0)).toBe('initial-jump');
      expect(controller.observeNewestItemTimestamp(0)).toBe('initial-jump');
    });
  });

  describe('resolveScrollTarget', () => {
    it('falls back to scroll-to-end before anything is measured', () => {
      expect(controller.resolveScrollTarget()).toEqual({ kind: 'end' });
    });

    it('falls back to scroll-to-end when only the content height is known', () => {
      controller.observeContentSize(CONTENT_HEIGHT);
      expect(controller.resolveScrollTarget()).toEqual({ kind: 'end' });
    });

    it('targets the exact maximum offset once both dimensions are known', () => {
      scrollTo(controller, 0);
      expect(controller.resolveScrollTarget()).toEqual({
        kind: 'offset',
        offset: CONTENT_HEIGHT - LAYOUT_HEIGHT,
      });
    });

    it('never targets a negative offset when content is shorter than the viewport', () => {
      controller.observeScroll({
        contentOffset: { y: 0 },
        contentSize: { height: 100 },
        layoutMeasurement: { height: 600 },
      });
      expect(controller.resolveScrollTarget()).toEqual({ kind: 'offset', offset: 0 });
    });
  });

  describe('history paging', () => {
    it('is refused before the first bottom scroll', () => {
      controller.markUserDragged();
      expect(controller.canLoadMoreHistory()).toBe(false);
    });

    it('is refused until the reader has actually dragged', () => {
      controller.markInitialBottomScrollComplete();
      expect(controller.canLoadMoreHistory()).toBe(false);
    });

    it('is allowed once both have happened', () => {
      controller.markInitialBottomScrollComplete();
      controller.markUserDragged();
      expect(controller.canLoadMoreHistory()).toBe(true);
    });

    it('restores the anchor by exactly the height that was prepended', () => {
      scrollTo(controller, 900);
      const offsetBefore = controller.getMetrics().offset;
      controller.beginHistoryLoad();

      const resolution = controller.observeContentSize(CONTENT_HEIGHT + 750);

      expect(resolution).toEqual({ kind: 'restore-history', offset: offsetBefore + 750 });
      expect(controller.isLoadingHistory()).toBe(false);
    });

    it('waits while the page is still in flight and content has not grown', () => {
      scrollTo(controller, 900);
      controller.beginHistoryLoad();

      expect(controller.observeContentSize(CONTENT_HEIGHT)).toEqual({ kind: 'none' });
      expect(controller.isLoadingHistory()).toBe(true);
    });

    it('does not restore twice for one page', () => {
      scrollTo(controller, 900);
      controller.beginHistoryLoad();
      controller.observeContentSize(CONTENT_HEIGHT + 750);

      expect(controller.observeContentSize(CONTENT_HEIGHT + 900)).toEqual({ kind: 'none' });
    });

    it('clears state when an empty page is abandoned', () => {
      scrollTo(controller, 900);
      controller.beginHistoryLoad();
      controller.abortHistoryLoad();

      expect(controller.isLoadingHistory()).toBe(false);
      expect(controller.observeContentSize(CONTENT_HEIGHT + 750)).toEqual({ kind: 'none' });
    });

    it('keeps the reader anchored to the bottom if they were there when paging began', () => {
      scrollTo(controller, 0);
      controller.beginHistoryLoad();

      // Snapshot content height was recorded at the bottom; growth restores
      // relative to the recorded offset rather than jumping.
      expect(controller.observeContentSize(CONTENT_HEIGHT + 750)).toEqual({
        kind: 'restore-history',
        offset: CONTENT_HEIGHT - LAYOUT_HEIGHT + 750,
      });
    });
  });

  describe('resetForSession', () => {
    it('re-arms the history-paging guards', () => {
      controller.markInitialBottomScrollComplete();
      controller.markUserDragged();
      controller.resetForSession();

      expect(controller.canLoadMoreHistory()).toBe(false);
    });
  });

  describe('metrics', () => {
    it('records offset, content height, and layout height from a scroll', () => {
      scrollTo(controller, 100);

      expect(controller.getMetrics()).toEqual({
        offset: CONTENT_HEIGHT - LAYOUT_HEIGHT - 100,
        contentHeight: CONTENT_HEIGHT,
        layoutHeight: LAYOUT_HEIGHT,
      });
    });

    it('records the layout height from a layout pass', () => {
      controller.observeLayoutHeight(480);
      expect(controller.getMetrics().layoutHeight).toBe(480);
    });

    it('records the content height from a content-size change', () => {
      controller.observeContentSize(1234);
      expect(controller.getMetrics().contentHeight).toBe(1234);
    });
  });
});
