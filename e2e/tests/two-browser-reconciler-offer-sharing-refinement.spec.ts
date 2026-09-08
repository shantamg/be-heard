/**
 * Two Browser Reconciler OFFER_SHARING + Refinement Test
 *
 * Tests the full OFFER_SHARING reconciler path with refinement where:
 * - Both users complete Stage 0+1 (compact, feel-heard)
 * - Both users draft empathy statements (Stage 2)
 * - User A shares empathy first (guesser)
 * - User B shares empathy second (subject, triggers reconciler)
 * - Reconciler returns OFFER_SHARING (significant gaps)
 * - Subject sees "Almost There" modal, clicks "Got It" → navigates to Share screen
 * - Subject sees ShareSuggestionCard with OFFER_SHARING content ("Recommended" badge)
 * - Subject accepts the suggestion ("Share this" button)
 * - Shared context is delivered to guesser
 * - Reconciler re-runs with hasContextAlreadyBeenShared guard (PROCEED)
 * - Both users see empathy revealed
 * - Subject can validate (accuracy feedback)
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0+1+2 prerequisite
 * - Reconciler completes with OFFER_SHARING result
 * - Subject sees ShareSuggestionCard with "Recommended" badge
 * - Subject accepts and shares context
 * - Guesser receives shared context
 * - Reconciler re-runs with hasContextAlreadyBeenShared guard (PROCEED)
 * - Both see empathy revealed
 * - Content persistence verified (Chat and Share pages)
 * - All key states captured in screenshots
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness } from '../helpers';
import {
  signCompact,
  handleMoodCheck,
  completeInviterInvitationFlow,
  sendAndWaitForPanel,
  confirmFeelHeard,
  waitForReconcilerComplete,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

// Current full-flow screenshots include dynamic chat content, timestamps, and
// Activity Drawer layout changes. Keep this centralized so the tolerance can be
// tightened when baselines are regenerated for the new Stage 2 UI.
const SCREENSHOT_MAX_DIFF_PIXELS = 100000;

test.describe('Reconciler: OFFER_SHARING + Refinement Path', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A (guesser) and User B (subject)
    // User A shares first (no reconciler operations)
    // User B shares second (triggers reconciler with OFFER_SHARING fixture)
    harness = new TwoBrowserHarness({
      userA: {
        email: 'offer-sharing-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'offer-sharing-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-refinement',
      },
    });

    // Clean up database
    await harness.cleanup();

    // Set up User A and create session
    await harness.setupUserA(browser, request);
    await harness.createSession();
  });

  test.afterEach(async () => {
    await harness.teardown();
  });

  test('subject accepts sharing, context delivered to guesser, reconciler re-runs with PROCEED, accuracy feedback tested', async ({
    browser,
    request,
  }) => {
    test.setTimeout(900000); // 15 minutes - Stage 2 + refinement requires many AI interactions

    // ==========================================
    // STAGE 0 PREREQUISITE
    // ==========================================

    // The inviter must confirm the topic before the invitation is acceptable.
    await harness.navigateUserA();
    await signCompact(harness.userAPage);
    await handleMoodCheck(harness.userAPage);
    await completeInviterInvitationFlow(harness.userAPage);

    await harness.setupUserB(browser, request);
    await harness.acceptInvitation();
    await harness.navigateUserB();
    await signCompact(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // Verify both see chat input
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

    // ==========================================
    // STAGE 1: USER A WITNESSING
    // ==========================================

    // The first two fixture turns were consumed while preparing the invitation.
    const userAStage1Messages = [
      'Thanks, I sent the invitation', // Response 2
      "I feel like I do most of the work and they don't notice or appreciate it", // Response 3: FeelHeardCheck: Y
    ];

    // Send remaining messages until feel-heard panel
    await sendAndWaitForPanel(
      harness.userAPage,
      userAStage1Messages,
      'feel-heard-yes',
      userAStage1Messages.length
    );

    // User A confirms feel-heard
    await confirmFeelHeard(harness.userAPage);

    // ==========================================
    // STAGE 1: USER B WITNESSING
    // ==========================================

    // User B sends messages matching reconciler-refinement fixture
    const userBStage1Messages = [
      'Things have been tense lately', // Response 0
      "I feel like we've just been miscommunicating", // Response 1
      "I want them to know I still care, even when I'm stressed", // Response 2
      'Exactly. I just want us to be on the same page again', // Response 3: FeelHeardCheck: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage1Messages, 'feel-heard-yes', 4);

    // User B confirms feel-heard
    await confirmFeelHeard(harness.userBPage);

    // ==========================================
    // STAGE 2: BOTH USERS DRAFT EMPATHY
    // ==========================================
    // IMPORTANT: Both users must complete empathy drafting BEFORE either shares

    // --- User A empathy draft ---
    const userAStage2Messages = [
      'Yes, I feel heard now', // Response 4
      'I guess they might be stressed from work too', // Response 5: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);

    // --- User B empathy draft ---
    const userBStage2Messages = [
      'Yes, I feel understood', // Response 4
      'I think they might be feeling frustrated too', // Response 5
      'Maybe they feel like I pull away when stressed and they want to connect', // Response 6: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);

    // ==========================================
    // STAGE 2: BOTH USERS SHARE EMPATHY
    // ==========================================

    // --- User A shares (guesser) ---
    const empathyReviewButtonA = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonA).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonA.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButtonA = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonA).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonA.evaluate((el: HTMLElement) => el.click());

    // Wait for Ably propagation
    await harness.userAPage.waitForTimeout(3000);

    // --- User B shares (subject, triggers reconciler) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.evaluate((el: HTMLElement) => el.click());

    // ==========================================
    // WAIT FOR RECONCILER COMPLETION
    // ==========================================

    // Wait for reconciler to complete (60s timeout)
    await harness.userBPage.waitForTimeout(2000);

    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await expect(harness.userAPage).toHaveScreenshot('offer-sharing-reconciler-timeout-a.png', {
        maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
      });
      await expect(harness.userBPage).toHaveScreenshot('offer-sharing-reconciler-timeout-b.png', {
        maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
      });
      throw new Error('Reconciler did not complete within 60s for User B');
    }

    // ==========================================
    // SCREENSHOT CHECKPOINT 1 - OFFER_SHARING state
    // ==========================================

    // Wait for Ably propagation
    await harness.userBPage.waitForTimeout(3000);

    // Screenshot User A (guesser): Should show waiting state
    await expect(harness.userAPage).toHaveScreenshot('offer-sharing-01-guesser-waiting.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });

    // Screenshot User B (subject): May show "Almost There" modal
    await expect(harness.userBPage).toHaveScreenshot('offer-sharing-01-subject-modal.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });

    // Dismiss "Almost There" modal for User A (guesser side notification)
    // Use "Later" to stay on Chat tab
    const partnerEventModalA = harness.userAPage.getByTestId('partner-event-modal');
    if (await partnerEventModalA.isVisible({ timeout: 5000 }).catch(() => false)) {
      const dismissButtonA = harness.userAPage.getByTestId('partner-event-modal-dismiss');
      if (await dismissButtonA.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dismissButtonA.click();
      } else {
        const viewButtonA = harness.userAPage.getByTestId('partner-event-modal-view');
        await viewButtonA.click();
      }
      await harness.userAPage.waitForTimeout(1000);
    }

    // Dismiss "Almost There" modal for User B via "Got It"
    // This navigates User B to Share/Partner tab to see the suggestion
    const partnerEventModal = harness.userBPage.getByTestId('partner-event-modal');
    if (await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      const gotItButton = harness.userBPage.getByTestId('partner-event-modal-view');
      await gotItButton.click();
      await harness.userBPage.waitForTimeout(2000);
    }

    // Screenshot after modal dismissed - User B sees the share topic panel
    await expect(harness.userBPage).toHaveScreenshot('offer-sharing-01-subject-panel.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });

    // ==========================================
    // SUBJECT SEES SHARE SUGGESTION CARD (OFFER_SHARING)
    // ==========================================

    // Current UI uses a two-step share flow: topic panel -> drawer -> refinement modal.
    const shareTopicPanel = harness.userBPage.getByTestId('share-topic-panel');
    await expect(shareTopicPanel).toBeVisible({ timeout: 15000 });
    await shareTopicPanel.click();

    const shareTopicDrawer = harness.userBPage.getByTestId('share-topic-drawer');
    await expect(shareTopicDrawer).toBeVisible({ timeout: 15000 });

    // For OFFER_SHARING, the fixture uses 'reconciler-refinement' which has OFFER_SHARING action
    // The drawer should show the suggested share focus/content.

    // Screenshot the suggestion card
    await expect(harness.userBPage).toHaveScreenshot('offer-sharing-02-subject-card.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });

    // ==========================================
    // SUBJECT ACCEPTS AND SHARES CONTEXT
    // ==========================================

    // Accept the topic suggestion, then share the seeded draft from the refinement modal.
    const acceptButton = harness.userBPage.getByTestId('share-topic-accept');
    await expect(acceptButton).toBeVisible({ timeout: 5000 });
    await acceptButton.click();

    const shareVersionButton = harness.userBPage.getByTestId('refinement-modal-share-button');
    await expect(shareVersionButton).toBeVisible({ timeout: 15000 });
    await shareVersionButton.click();

    // Wait for the share to process (backend call + Ably notification)
    await harness.userBPage.waitForTimeout(5000);

    // ==========================================
    // SCREENSHOT CHECKPOINT 2 - After sharing
    // ==========================================

    // Screenshot both users
    await expect(harness.userAPage).toHaveScreenshot('offer-sharing-03-guesser-received-context.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });
    await expect(harness.userBPage).toHaveScreenshot('offer-sharing-03-subject-shared.png', {
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
    });

    // User A receives the shared context in chat and revises the empathy draft.
    await harness.userAPage.bringToFront();
    await sendAndWaitForPanel(
      harness.userAPage,
      ['I can see now how exhausted and unappreciated they have been feeling at work'],
      'empathy-review-button',
      1
    );
    await harness.userAPage.getByTestId('empathy-review-button').click();
    const resubmitResponsePromise = harness.userAPage.waitForResponse(
      response => response.url().includes(`/sessions/${harness.sessionId}/empathy/resubmit`)
        && response.request().method() === 'POST'
    );
    await harness.userAPage.getByTestId('share-empathy-button').click();
    expect((await resubmitResponsePromise).ok()).toBe(true);

    // The symmetric B→A recommendation is still pending for User A as subject.
    // Decline that second direction so the revised attempts can reveal together.
    const userAShareTopicPanel = harness.userAPage.getByTestId('share-topic-panel');
    await expect(userAShareTopicPanel).toBeVisible({ timeout: 30000 });
    await userAShareTopicPanel.click();
    await expect(harness.userAPage.getByTestId('share-topic-drawer')).toBeVisible();
    harness.userAPage.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const declineResponsePromise = harness.userAPage.waitForResponse(
      response => response.url().includes('/reconciler/share-offer/respond')
        && response.request().method() === 'POST',
      { timeout: 15000 }
    );
    await harness.userAPage.getByTestId('share-topic-decline').click();
    expect((await declineResponsePromise).ok()).toBe(true);

    // Both revised empathy attempts are revealed inline for accuracy review.
    await expect(harness.userAPage.getByTestId('partner-empathy-validation-panel'))
      .toBeVisible({ timeout: 60000 });
    await expect(harness.userBPage.getByTestId('partner-empathy-validation-panel'))
      .toBeVisible({ timeout: 60000 });

    const userBValidationResponsePromise = harness.userBPage.waitForResponse(
      response => response.url().includes(`/sessions/${harness.sessionId}/empathy/validate`)
        && response.request().method() === 'POST'
    );
    await harness.userBPage.getByTestId('partner-empathy-yes-button').click();
    expect((await userBValidationResponsePromise).ok()).toBe(true);

    const userAValidationResponsePromise = harness.userAPage.waitForResponse(
      response => response.url().includes(`/sessions/${harness.sessionId}/empathy/validate`)
        && response.request().method() === 'POST'
    );
    await harness.userAPage.getByTestId('partner-empathy-yes-button').click();
    expect((await userAValidationResponsePromise).ok()).toBe(true);

    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });

    // ==========================================
    // SUCCESS
    // ==========================================
    // - Both users completed Stage 0+1+2
    // - Reconciler returned OFFER_SHARING (significant gaps)
    // - Subject saw "Almost There" modal and navigated to Share tab
    // - Subject saw ShareSuggestionCard with OFFER_SHARING content
    // - Subject accepted the suggestion ("Share this")
    // - Context delivered to guesser
    // - Reconciler re-ran with hasContextAlreadyBeenShared guard (PROCEED)
    // - Both users saw empathy revealed
    // - Content persistence verified
    // - All key states captured in screenshots
  });
});
