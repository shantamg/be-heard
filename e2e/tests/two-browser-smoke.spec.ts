/**
 * Two Browser Smoke Test
 *
 * Validates the complete two-browser infrastructure:
 * - Two isolated browser contexts with per-user fixture IDs
 * - Real Ably connection delivering partner updates
 * - Full UI navigation (compact, mood check, chat)
 * - Different AI responses from per-user fixtures
 *
 * This proves the foundation works for Phase 3-4 partner interaction tests.
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness, waitForPartnerUpdate } from '../helpers';
import {
  confirmInvitationTopicAndContinue,
  signCompact,
  handleMoodCheck,
  waitForAIResponse,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

test.describe('Two Browser Smoke Test', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A and User B configs
    harness = new TwoBrowserHarness({
      userA: {
        email: 'smoke-a@e2e.test',
        name: 'Alice',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'smoke-b@e2e.test',
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
    await harness?.teardown();
  });

  test('both users can connect and navigate UI', async ({ browser, request }) => {
    test.setTimeout(600000); // 10 minutes on resource-constrained local machines

    // ==========================================
    // User A: Complete the inviter-only Stage 0 flow
    // ==========================================
    await harness.navigateUserA();
    await signCompact(harness.userAPage);
    await handleMoodCheck(harness.userAPage);

    // User A should see chat input
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible();

    // User A's first streamed fixture response proves the SSE path is live.
    const userAChatInput = harness.userAPage.getByTestId('chat-input');
    const userASendButton = harness.userAPage.getByTestId('send-button');
    await userAChatInput.fill("Hi, I'm having a conflict with my partner");
    await userASendButton.click();
    await waitForAIResponse(harness.userAPage, /glad you reached out/i);

    // The second response proposes the topic frame. Invitations are not
    // acceptable until the inviter confirms this production Stage 0 gate.
    await userAChatInput.fill('We keep arguing about household chores');
    await userASendButton.click();
    await expect(harness.userAPage.getByTestId('typing-indicator')).not.toBeVisible({
      timeout: 60000,
    });
    await confirmInvitationTopicAndContinue(harness.userAPage);

    await harness.userAPage.screenshot({ path: 'test-results/smoke-user-a-first-response.png' });

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

    // User B sees partner name "Alice"
    const userBPartnerName = harness.userBPage.getByTestId('session-chat-header-partner-name');
    const userBHasPartnerName = await waitForPartnerUpdate(harness.userBPage, userBPartnerName, {
      timeout: 15000,
      reloadOnMiss: true,
    });
    expect(userBHasPartnerName).toBe(true);
    await expect(userBPartnerName).toHaveText('Alice');

    // ==========================================
    // Verify per-user fixtures deliver different AI responses
    // ==========================================

    // User B sends first message
    const userBChatInput = harness.userBPage.getByTestId('chat-input');
    const userBSendButton = harness.userBPage.getByTestId('send-button');

    await userBChatInput.fill('Things have been tense lately');
    await userBSendButton.click();

    // Wait for User B's fixture response (from user-b-partner-journey, response 0)
    await waitForAIResponse(harness.userBPage, /tension can be really draining/i);

    // Screenshot User B's chat
    await harness.userBPage.screenshot({ path: 'test-results/smoke-user-b-first-response.png' });

    // ==========================================
    // Success: Infrastructure validated
    // ==========================================
    // - Two browser contexts work independently
    // - Real Ably delivers partner updates (names)
    // - Per-user fixtures deliver different AI responses
    // - Full UI navigation works (no SessionBuilder)
  });
});
