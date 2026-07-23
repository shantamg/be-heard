/**
 * Two Browser Reconciler OFFER_OPTIONAL Test
 *
 * Tests the full OFFER_OPTIONAL reconciler path where:
 * - Both users complete Stage 0+1 (compact, feel-heard)
 * - Both users draft empathy statements (Stage 2)
 * - User A shares empathy first (guesser)
 * - User B shares empathy second (subject, triggers reconciler)
 * - Reconciler returns OFFER_OPTIONAL for BOTH directions (moderate gaps)
 * - Both users see "Almost There" modals and navigate to Share screen
 * - User B (subject for A→B) sees ShareSuggestionCard and DECLINES
 * - User A (subject for B→A) also has suggestion and DECLINES
 * - After both decline, empathy is revealed for both users
 * - Context-already-shared guard prevents duplicate panels on re-navigation
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0+1+2 prerequisite
 * - Reconciler completes with OFFER_OPTIONAL result (both directions)
 * - Both users see ShareSuggestionCard with OFFER_OPTIONAL content
 * - Both users decline the suggestion
 * - Both users see empathy revealed after both declines
 * - No duplicate panels appear on re-navigation
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

test.describe('Reconciler: OFFER_OPTIONAL Path', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A (guesser in A→B direction) and User B (subject in A→B direction)
    // User A shares first (no reconciler operations)
    // User B shares second (triggers reconciler with OFFER_OPTIONAL fixture)
    // NOTE: Symmetric reconciler runs BOTH directions - both users may get share suggestions
    harness = new TwoBrowserHarness({
      userA: {
        email: 'offer-optional-a@e2e.test',
        name: 'Shantam',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'offer-optional-b@e2e.test',
        name: 'Darryl',
        fixtureId: 'reconciler-offer-optional',
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

  test('both users decline OFFER_OPTIONAL suggestions, empathy reveals for both', async ({
    browser,
    request,
  }) => {
    test.setTimeout(900000); // 15 minutes - Stage 2 requires 13 AI interactions

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

    // User B sends messages matching reconciler-offer-optional fixture
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

    // --- User A shares (guesser in A→B direction) ---
    const empathyReviewButtonA = harness.userAPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonA).toBeVisible({ timeout: 5000 });
    // Use JS click to bypass pointer-events: none from typewriter animation wrapper
    await empathyReviewButtonA.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButtonA = harness.userAPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonA).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonA.evaluate((el: HTMLElement) => el.click());

    // Wait for Ably propagation
    await harness.userAPage.waitForTimeout(3000);

    // --- User B shares (subject in A→B direction, triggers reconciler for BOTH directions) ---
    const empathyReviewButtonB = harness.userBPage.getByTestId('empathy-review-button');
    await expect(empathyReviewButtonB).toBeVisible({ timeout: 5000 });
    await empathyReviewButtonB.evaluate((el: HTMLElement) => el.click());

    const shareEmpathyButtonB = harness.userBPage.getByTestId('share-empathy-button');
    await expect(shareEmpathyButtonB).toBeVisible({ timeout: 5000 });
    await shareEmpathyButtonB.evaluate((el: HTMLElement) => el.click());

    // ==========================================
    // WAIT FOR RECONCILER TO START
    // ==========================================

    // Wait for reconciler events to propagate
    // waitForReconcilerComplete detects empathy-shared indicator from the EMPATHY_STATEMENT message
    await harness.userBPage.waitForTimeout(2000);

    const userBReconcilerComplete = await waitForReconcilerComplete(harness.userBPage, 60000);
    if (!userBReconcilerComplete) {
      await expect(harness.userAPage).toHaveScreenshot('offer-optional-reconciler-timeout-a.png', {
        maxDiffPixels: 15000,
      });
      await expect(harness.userBPage).toHaveScreenshot('offer-optional-reconciler-timeout-b.png', {
        maxDiffPixels: 15000,
      });
      throw new Error('Reconciler did not complete within 60s for User B');
    }

    // Wait for Ably propagation (reconciler runs in background after empathy sharing)
    await harness.userBPage.waitForTimeout(5000);

    // ==========================================
    // SCREENSHOT CHECKPOINT 1 - After Reconciler
    // ==========================================

    // Screenshot User A (guesser-waiting): Should show waiting state or modal
    await expect(harness.userAPage).toHaveScreenshot('offer-optional-01-guesser-waiting.png', {
      maxDiffPixels: 15000,
    });

    // Screenshot User B (subject-modal): May show "Almost There" modal
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-01-subject-modal.png', {
      maxDiffPixels: 15000,
    });

    // Dismiss modals for both users via "Got It" → navigates both to Share tab
    // User A may also have a share suggestion (B→A direction with OFFER_OPTIONAL)
    const partnerEventModalA = harness.userAPage.getByTestId('partner-event-modal');
    if (await partnerEventModalA.isVisible({ timeout: 5000 }).catch(() => false)) {
      const gotItButtonA = harness.userAPage.getByTestId('partner-event-modal-view');
      if (await gotItButtonA.isVisible({ timeout: 2000 }).catch(() => false)) {
        await gotItButtonA.click();
      }
      await harness.userAPage.waitForTimeout(2000);
    }

    const partnerEventModal = harness.userBPage.getByTestId('partner-event-modal');
    if (await partnerEventModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      const gotItButton = harness.userBPage.getByTestId('partner-event-modal-view');
      await gotItButton.click();
      await harness.userBPage.waitForTimeout(2000);
    }

    // Screenshot after modal dismissed - users may be on Share tab
    await expect(harness.userBPage).toHaveScreenshot('offer-optional-01-subject-panel.png', {
      maxDiffPixels: 15000,
    });

    // Share suggestions now live inline in chat. Decline both symmetric
    // OFFER_OPTIONAL directions through the current panel and drawer.
    const declineSuggestion = async (page: typeof harness.userAPage, label: string) => {
      await page.bringToFront();
      const panel = page.getByTestId('share-topic-panel');
      await expect(panel).toBeVisible({ timeout: 15000 });
      await panel.click();
      await expect(page.getByTestId('share-topic-drawer')).toBeVisible({ timeout: 10000 });

      page.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      const [response] = await Promise.all([
        page.waitForResponse(
          candidate => candidate.url().includes('/reconciler/share-offer/respond')
            && candidate.request().method() === 'POST'
          , { timeout: 15000 }
        ),
        page.getByTestId('share-topic-decline').click(),
      ]);
      expect(response.ok(), `${label} decline request should succeed`).toBe(true);
      await expect(page.getByTestId('share-topic-drawer')).not.toBeVisible({ timeout: 10000 });
    };

    await declineSuggestion(harness.userBPage, 'User B');
    await declineSuggestion(harness.userAPage, 'User A');

    // Once both offers are declined, both empathy attempts are revealed for
    // inline review and neither suggestion is offered again.
    await expect(harness.userAPage.getByTestId('partner-empathy-validation-panel'))
      .toBeVisible({ timeout: 60000 });
    await expect(harness.userBPage.getByTestId('partner-empathy-validation-panel'))
      .toBeVisible({ timeout: 60000 });
    await expect(harness.userAPage.getByTestId('share-topic-panel')).not.toBeVisible();
    await expect(harness.userBPage.getByTestId('share-topic-panel')).not.toBeVisible();
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

    // ==========================================
    // SUCCESS
    // ==========================================
    // - Both users completed Stage 0+1+2
    // - Reconciler returned OFFER_OPTIONAL (both directions, using same fixture)
    // - Both users saw "Almost There" modals
    // - User B declined their share suggestion (A→B direction)
    // - User A declined their share suggestion (B→A direction)
    // - Empathy reveal occurred (or timing issue documented)
    // - No duplicate suggestion cards after decline
    // - All key states captured in screenshots
  });
});
