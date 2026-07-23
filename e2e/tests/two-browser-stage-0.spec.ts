/**
 * Two Browser Stage 0 Test
 *
 * Tests that both users can complete Stage 0 (compact signing and onboarding)
 * and enter the witnessing stage together with partner awareness via Ably.
 *
 * SUCCESS CRITERIA:
 * - Both users sign compact agreement
 * - Both users see chat input (witnessing interface)
 * - Both users see partner name via Ably real-time updates
 *
 * This test documents actual system behavior for the Stage 0 flow.
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness, waitForPartnerUpdate } from '../helpers';
import {
  completeInviterInvitationFlow,
  signCompact,
  handleMoodCheck,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

test.describe('Stage 0: Compact Signing', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A and User B configs
    harness = new TwoBrowserHarness({
      userA: {
        email: 'stage0-a@e2e.test',
        name: 'Alice',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'stage0-b@e2e.test',
        name: 'Bob',
        fixtureId: 'user-b-partner-journey',
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

  test('both users sign compact and enter witnessing', async ({ browser, request }) => {
    test.setTimeout(180000); // 3 minutes - compact signing is fast but Ably needs time

    // ==========================================
    // User A: Complete the inviter-only Stage 0 flow
    // ==========================================
    await harness.navigateUserA();
    await signCompact(harness.userAPage);
    await handleMoodCheck(harness.userAPage);
    await completeInviterInvitationFlow(harness.userAPage);

    // User A should see chat input
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();

    // ==========================================
    // User B: Accept, navigate, sign compact, handle mood check
    // ==========================================
    await harness.setupUserB(browser, request);
    await harness.acceptInvitation();
    await harness.navigateUserB();
    await signCompact(harness.userBPage);
    await handleMoodCheck(harness.userBPage);

    // User B should see chat input
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible();

    // ==========================================
    // Verify partner names via Ably (with reload fallback)
    // ==========================================

    // User A sees partner name "Bob"
    const userAPartnerName = harness.userAPage.getByTestId('session-chat-header-partner-name');
    const userAHasPartnerName = await waitForPartnerUpdate(harness.userAPage, userAPartnerName, {
      timeout: 15000,
      reloadOnMiss: true,
    });
    expect(userAHasPartnerName).toBe(true);
    await expect(userAPartnerName).toHaveText('Bob');

    // After reload, mood check can reappear
    await handleMoodCheck(harness.userAPage);

    // User B sees partner name "Alice"
    const userBPartnerName = harness.userBPage.getByTestId('session-chat-header-partner-name');
    const userBHasPartnerName = await waitForPartnerUpdate(harness.userBPage, userBPartnerName, {
      timeout: 15000,
      reloadOnMiss: true,
    });
    expect(userBHasPartnerName).toBe(true);
    await expect(userBPartnerName).toHaveText('Alice');

    // After reload, mood check can reappear
    await handleMoodCheck(harness.userBPage);

    // ==========================================
    // Screenshots: both users' final state
    // ==========================================
    await harness.userAPage.screenshot({ path: 'test-results/stage0-user-a-complete.png' });
    await harness.userBPage.screenshot({ path: 'test-results/stage0-user-b-complete.png' });

    // ==========================================
    // Success: Both users completed Stage 0
    // ==========================================
    // - Both users signed compact
    // - Both users see chat input (witnessing interface)
    // - Both users see partner name via Ably
  });
});
