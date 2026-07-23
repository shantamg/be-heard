/**
 * Two Browser Stage 2 Test
 *
 * Tests that both users can complete Stage 2 (PERSPECTIVE_STRETCH) by:
 * - Drafting empathy statements about partner's perspective
 * - Sharing empathy with partner (User A shares first, User B shares second)
 * - Reconciler analyzing shared empathy (no-gaps path via reconciler-no-gaps fixture)
 * - Both users seeing empathy revealed (status REVEALED)
 * - Both users validating partner empathy on Share tab
 * - Both users entering Stage 3 (chat continues)
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0+1 prerequisite (compact, feel-heard)
 * - User A drafts and shares empathy (user-a-full-journey fixture)
 * - User B drafts and shares empathy (reconciler-no-gaps fixture)
 * - Reconciler completes with no-gaps result
 * - Both users see empathy-shared indicator
 * - Both users can validate partner empathy (or behavior documented if UI absent)
 * - Both users enter Stage 3 (chat input remains visible)
 *
 * This test documents actual system behavior for the Stage 2 empathy sharing flow.
 *
 * IMPORTANT: Both users must complete empathy drafting BEFORE either shares.
 * When User A shares empathy, the backend generates a transition message that
 * gets delivered to User B via Ably. This extra AI message confuses the
 * waitForAnyAIResponse message counting, causing off-by-one errors.
 *
 * KNOWN ISSUES DOCUMENTED (from Stage 2 audit):
 * - Empathy panel visibility depends on stage cache (Pitfall 3)
 * - Validation modal depends on Ably event timing (Pitfall 5)
 * - Reconciler timing is variable (5-30s), polling handles this
 */

import { test, expect, devices } from '@playwright/test';
import { getE2EHeaders, TwoBrowserHarness } from '../helpers';
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

test.describe('Stage 2: Empathy Sharing and Reconciler', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A (user-a-full-journey) and User B (reconciler-no-gaps)
    // User A has NO reconciler operations, so User A MUST share empathy first
    // User B shares second, triggering reconciler with no-gaps fixture
    harness = new TwoBrowserHarness({
      userA: {
        email: 'stage2-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'stage2-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-no-gaps',
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

  test('both users share empathy, reconciler finds no gaps, both validate and enter Stage 3', async ({
    browser,
    request,
  }) => {
    test.setTimeout(900000); // 15 minutes - Stage 2 requires 13 AI interactions vs 8 in Stage 1

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
      'Thanks, I sent the invitation', // Response 2: post-invitation
      'This has been building for months, and I feel worn down by it',
      "I feel like I do most of the work and they don't notice or appreciate it", // Response 3: FeelHeardCheck: Y
    ];

    // Send remaining messages until feel-heard panel appears
    await sendAndWaitForPanel(
      harness.userAPage,
      userAStage1Messages,
      'feel-heard-yes',
      userAStage1Messages.length
    );

    // User A confirms feel-heard
    await confirmFeelHeard(harness.userAPage);

    // Screenshot User A post-feel-heard state
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-feel-heard.png' });

    // ==========================================
    // STAGE 1: USER B WITNESSING
    // ==========================================

    // User B sends messages matching reconciler-no-gaps fixture
    const userBStage1Messages = [
      'Things have been tense lately', // Response 0
      "I feel like we've just been miscommunicating", // Response 1
      "I want them to know I still care, even when I'm stressed", // Response 2
      'Exactly. I just want us to be on the same page again', // Response 3: FeelHeardCheck: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage1Messages, 'feel-heard-yes', 4);

    // User B confirms feel-heard
    await confirmFeelHeard(harness.userBPage);

    // Screenshot User B post-feel-heard state
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-feel-heard.png' });

    // ==========================================
    // STAGE 2: BOTH USERS DRAFT EMPATHY
    // ==========================================
    // IMPORTANT: Both users must complete empathy drafting BEFORE either shares.
    // When User A shares empathy, the backend generates a transition message
    // delivered to User B via Ably, which injects an extra AI message into
    // User B's chat and breaks waitForAnyAIResponse's message counting.

    // --- User A empathy draft ---
    // Response 4: Post-feel-heard transition
    // Response 5: ReadyShare: Y with empathy draft
    const userAStage2Messages = [
      'Yes, I feel heard now', // Response 4: post-feel-heard
      'I guess they might be stressed from work too', // Response 5: ReadyShare: Y, empathy draft
    ];

    await sendAndWaitForPanel(harness.userAPage, userAStage2Messages, 'empathy-review-button', 2);
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-empathy-draft.png' });

    // --- User B empathy draft ---
    // Response 4: Post-feel-heard
    // Response 5: Empathy building
    // Response 6: ReadyShare: Y with empathy draft
    const userBStage2Messages = [
      'Yes, I feel understood', // Response 4: post-feel-heard
      'I think they might be feeling frustrated too', // Response 5: empathy building
      'Maybe they feel like I pull away when stressed and they want to connect', // Response 6: ReadyShare: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBStage2Messages, 'empathy-review-button', 3);
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-empathy-draft.png' });

    // ==========================================
    // STAGE 2: BOTH USERS SHARE EMPATHY
    // ==========================================
    // User A shares first (has no reconciler operations).
    // User B shares second (triggers reconciler via reconciler-no-gaps fixture).

    // --- User A shares ---
    const empathyReviewButton = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButton).toBeVisible({ timeout: 5000 });
    await empathyReviewButton.click();

    const shareEmpathyButton = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButton).toBeVisible({ timeout: 5000 });
    await shareEmpathyButton.click();
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-empathy-shared.png' });

    // Wait for Ably event delivery (User A's share triggers transition message to User B)
    await harness.userAPage.waitForTimeout(3000);

    // --- User B shares (triggers reconciler) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.click();

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.click();
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-empathy-shared.png' });

    // ==========================================
    // WAIT FOR RECONCILER COMPLETION
    // ==========================================

    // Wait 2s for reconciler trigger, then poll with waitForReconcilerComplete
    await harness.userAPage.waitForTimeout(2000);

    const userAReconcilerComplete = await waitForReconcilerComplete(harness.userAPage, 60000);
    if (!userAReconcilerComplete) {
      // Take diagnostic screenshots if reconciler timeout
      await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-reconciler-timeout.png' });
      await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-reconciler-timeout.png' });
      throw new Error('Reconciler did not complete within 60s for User A');
    }

    // Also check User B sees empathy-shared indicator
    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-reconciler-timeout.png' });
      throw new Error('Reconciler did not complete within 60s for User B');
    }

    // Screenshot both users after reconciler completes
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-reconciler-complete.png' });
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-reconciler-complete.png' });

    // Validation now happens inline in chat rather than on the legacy Share tab.
    const userAValidateButton = harness.userAPage.getByTestId('partner-empathy-yes-button');
    const userBValidateButton = harness.userBPage.getByTestId('partner-empathy-yes-button');

    await expect(userAValidateButton).toBeVisible({ timeout: 10000 });
    const [userAValidationResponse] = await Promise.all([
      harness.userAPage.waitForResponse(
        response => response.url().includes(`/sessions/${harness.sessionId}/empathy/validate`)
          && response.request().method() === 'POST'
      ),
      userAValidateButton.click(),
    ]);
    expect(userAValidationResponse.ok()).toBe(true);

    await expect(userBValidateButton).toBeVisible({ timeout: 10000 });
    const [userBValidationResponse] = await Promise.all([
      harness.userBPage.waitForResponse(
        response => response.url().includes(`/sessions/${harness.sessionId}/empathy/validate`)
          && response.request().method() === 'POST'
      ),
      userBValidateButton.click(),
    ]);
    expect(userBValidationResponse.ok()).toBe(true);

    // Screenshot after validation attempts
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-validation.png' });
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-validation.png' });

    // ==========================================
    // VERIFY STAGE 3 ENTRY
    // ==========================================

    // The second validation triggers an asynchronous Stage 3 transition.
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    await expect.poll(async () => {
      const stateResponse = await request.get(
        `${apiBaseUrl}/api/sessions/${harness.sessionId}/state`,
        {
          headers: getE2EHeaders(
            harness.config.userA.email,
            harness.userAId,
            harness.config.userA.fixtureId
          ),
        }
      );
      if (!stateResponse.ok()) return -1;
      const stateData = await stateResponse.json();
      return stateData.data.session.currentStage;
    }, {
      timeout: 30000,
      message: 'session should advance to Stage 3 after both empathy validations',
    }).toBe(3);

    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 10000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 10000 });

    // Take final screenshots
    await harness.userAPage.screenshot({ path: 'test-results/stage2-user-a-final.png' });
    await harness.userBPage.screenshot({ path: 'test-results/stage2-user-b-final.png' });

    // ==========================================
    // Success: Both users completed Stage 2
    // ==========================================
    // - Both users completed Stage 0 (compact signing)
    // - Both users completed Stage 1 (feel-heard confirmation)
    // - Both users drafted empathy (AI generated draft statements)
    // - Both users shared empathy (User A first, User B second)
    // - Reconciler analyzed empathy and found no gaps (via reconciler-no-gaps fixture)
    // - Both users saw empathy revealed (empathy-shared indicator visible)
    // - Both users entered Stage 3 (chat input visible)
    //
    // NOTE: This test proves Stage 2 COMPLETION. Validation UI visibility
    // depends on Ably event timing (documented in audits as Pitfall 5).
    // Empathy panel visibility depends on stage cache updates (Pitfall 3).
  });
});
