/**
 * Two Browser Circuit Breaker Fixture Test
 *
 * Verifies that the reconciler-circuit-breaker fixture enters the first
 * OFFER_SHARING refinement loop over the live browser/backend/realtime path.
 * The three-loop breaker threshold itself remains unit/manual coverage.
 *
 * Flow:
 * - Both users complete Stage 0+1 (compact, feel-heard)
 * - Both users draft empathy statements (Stage 2)
 * - User A shares empathy first (guesser)
 * - User B shares empathy second (subject, triggers 1st reconciler attempt)
 * - Reconciler returns OFFER_SHARING
 * - Subject sees the sharing panel
 * - Both browser perspectives capture the AWAITING_SHARING state
 *
 * SUCCESS CRITERIA:
 * - First reconciliation attempt completes
 * - OFFER_SHARING panel appears for the subject
 * - Screenshots document refinement-loop entry
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
  navigateBackToChat,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

test.describe('Circuit Breaker Fixture: First OFFER_SHARING Loop', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A (guesser) and User B (subject)
    // User B uses circuit-breaker fixture which ALWAYS returns OFFER_SHARING
    harness = new TwoBrowserHarness({
      userA: {
        email: 'circuit-breaker-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'circuit-breaker-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-circuit-breaker',
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

  test('fixture enters AWAITING_SHARING and renders the subject sharing panel', async ({
    browser,
    request,
  }) => {
    test.setTimeout(900000); // 15 minutes - multiple refinement loops + circuit breaker

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

    // User B sends messages matching reconciler-circuit-breaker fixture
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
    // STAGE 2: USER A SHARES EMPATHY (GUESSER)
    // ==========================================

    const empathyReviewButtonA = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonA).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonA.click();

    const shareEmpathyButtonA = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonA).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonA.click();

    // Wait for Ably propagation
    await harness.userAPage.waitForTimeout(3000);

    // ==========================================
    // STAGE 2: USER B SHARES EMPATHY (SUBJECT)
    // ==========================================
    // This triggers the FIRST reconciler attempt (attempt 1)

    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.click();

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.click();

    // ==========================================
    // WAIT FOR FIRST RECONCILER ATTEMPT
    // ==========================================

    await harness.userBPage.waitForTimeout(2000);

    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await expect(harness.userAPage).toHaveScreenshot('circuit-breaker-reconciler-timeout-a.png', {
        maxDiffPixels: 100,
      });
      await expect(harness.userBPage).toHaveScreenshot('circuit-breaker-reconciler-timeout-b.png', {
        maxDiffPixels: 100,
      });
      throw new Error('Reconciler attempt 1 did not complete within 60s for User B');
    }

    console.log('[Test] Reconciler attempt 1 complete - fixture should return OFFER_SHARING');

    // Wait for Ably propagation
    await harness.userBPage.waitForTimeout(3000);

    // ==========================================
    // SCREENSHOT: REFINEMENT LOOP STATE
    // ==========================================

    // Dismiss "Almost There" modal if it appears
    const partnerEventModal = harness.userBPage.getByTestId('partner-event-modal');
    if (await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      const gotItButton = harness.userBPage.getByTestId('partner-event-modal-view');
      await gotItButton.click();
      await harness.userBPage.waitForTimeout(1000);
    }

    // Screenshot during refinement loop (User B should see ShareTopicPanel)
    await harness.userBPage.screenshot({
      path: 'test-results/circuit-breaker-01-refinement-loop.png',
    });

    // ==========================================
    // VERIFY FIXTURE WORKED: OFFER_SHARING DETECTED
    // ==========================================
    // The circuit breaker requires driving 3 full refinement loops manually (subject
    // accepts ShareTopicPanel, shares context, guesser refines, repeat 3 times). This
    // exceeds reasonable E2E test scope. The circuit breaker logic was thoroughly unit
    // tested in Plan 09-01.
    //
    // This test verifies:
    // 1. The circuit-breaker fixture correctly triggers OFFER_SHARING
    // 2. The ShareTopicPanel appears for the subject
    // 3. Screenshots document the AWAITING_SHARING state
    //
    // Manual testing or future interactive E2E tests can verify the full 3-loop scenario.

    console.log('[Test] ✓ Reconciler returned OFFER_SHARING (verified via ShareTopicPanel visibility)');
    console.log('[Test] Circuit breaker fixture works - would force loops until 4th attempt');
    console.log('[Test] Full 3-loop refinement flow deferred to manual testing (complexity exceeds E2E scope)');

    // Navigate to User A and User B chat
    await navigateBackToChat(harness.userAPage);
    await handleMoodCheck(harness.userAPage);

    await navigateBackToChat(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // Screenshot both perspectives showing AWAITING_SHARING state
    await harness.userAPage.screenshot({
      path: 'test-results/circuit-breaker-02-guesser-waiting.png',
    });
    await harness.userBPage.screenshot({
      path: 'test-results/circuit-breaker-02-subject-panel.png',
    });

    // Verify User B sees ShareTopicPanel (proves OFFER_SHARING worked)
    const shareTopicPanel = harness.userBPage.getByTestId('share-topic-panel');
    await expect(shareTopicPanel).toBeVisible({ timeout: 10000 });

    console.log('[Test] ✓ User B sees ShareTopicPanel (OFFER_SHARING confirmed)');

    // ==========================================
    // SUCCESS
    // ==========================================
    // - Both users completed Stage 0+1+2
    // - Reconciler returned OFFER_SHARING (verified via ShareTopicPanel)
    // - Circuit breaker fixture proven to work (always returns OFFER_SHARING)
    // - ShareTopicPanel visible for subject (AWAITING_SHARING state)
    // - Screenshots captured documenting the refinement loop initiation
    // - Full 3-loop circuit breaker triggering deferred to manual testing
  });
});
