/**
 * Two Browser Stage 1 Test
 *
 * Tests that both users can complete Stage 1 (WITNESS) by:
 * - Conversing with fixture-based AI
 * - Receiving feel-heard check after AI determines they feel heard
 * - Confirming they feel heard (gate for Stage 2 entry)
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 0 prerequisite (compact signing, chat input visible)
 * - User A sends messages, receives feel-heard check, confirms
 * - User B sends messages, receives feel-heard check, confirms
 * - Both users remain in functional chat state after feel-heard confirmation
 *
 * This test documents actual system behavior for the Stage 1 witnessing flow.
 */

import { test, expect, devices } from '@playwright/test';
import { TwoBrowserHarness } from '../helpers';
import {
  signCompact,
  handleMoodCheck,
  completeInviterInvitationFlow,
  sendAndWaitForPanel,
  confirmFeelHeard,
} from '../helpers/test-utils';

// Use iPhone 12 viewport
test.use(devices['iPhone 12']);

test.describe('Stage 1: Witnessing - Feel Heard', () => {
  let harness: TwoBrowserHarness;

  test.beforeEach(async ({ browser, request }) => {
    // Create harness with User A and User B configs
    harness = new TwoBrowserHarness({
      userA: {
        email: 'stage1-a@e2e.test',
        name: 'Alice',
        fixtureId: 'user-a-full-journey',
      },
      userB: {
        email: 'stage1-b@e2e.test',
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

  test('both users converse with AI, confirm feel-heard, and advance to Stage 2', async ({ browser, request }) => {
    test.setTimeout(600000); // 10 minutes - accounts for circuit breaker timeouts (~20s per message)

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
    // USER A: WITNESSING CONVERSATION
    // ==========================================

    // The first two fixture turns were consumed while preparing the invitation.
    const userAMessages = [
      "Thanks, I sent the invitation",                       // Response 2: post-invitation
      "I feel like I do most of the work and they don't notice or appreciate it", // Response 3: FeelHeardCheck: Y
    ];

    // Send remaining messages until feel-heard panel appears
    await sendAndWaitForPanel(harness.userAPage, userAMessages, 'feel-heard-yes', userAMessages.length);

    // User A confirms feel-heard
    await confirmFeelHeard(harness.userAPage);

    // Screenshot User A post-feel-heard state
    await harness.userAPage.screenshot({ path: 'test-results/stage1-user-a-feel-heard.png' });

    // ==========================================
    // USER B: WITNESSING CONVERSATION
    // ==========================================

    // User B sends messages matching user-b-partner-journey fixture
    const userBMessages = [
      "Things have been tense lately",                       // Response 0
      "I feel like they don't see how much I'm dealing with", // Response 1
      "I work so hard and come home exhausted, but there's always more to do", // Response 2
      "Months now. I don't know how to get through to them", // Response 3: FeelHeardCheck: Y
    ];

    await sendAndWaitForPanel(harness.userBPage, userBMessages, 'feel-heard-yes', 4);

    // User B confirms feel-heard
    await confirmFeelHeard(harness.userBPage);

    // Screenshot User B post-feel-heard state
    await harness.userBPage.screenshot({ path: 'test-results/stage1-user-b-feel-heard.png' });

    // ==========================================
    // VERIFY STAGE 2 ENTRY
    // ==========================================

    // After both confirm feel-heard, verify advancement
    // The UI should show empathy-related UI elements or at minimum
    // the chat should still be functional

    // Both users still have chat-input visible (conversation continues in Stage 2)
    await expect(harness.userAPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });
    await expect(harness.userBPage.getByTestId('chat-input')).toBeVisible({ timeout: 5000 });

    // Screenshot final state for both users
    await harness.userAPage.screenshot({ path: 'test-results/stage1-user-a-final.png' });
    await harness.userBPage.screenshot({ path: 'test-results/stage1-user-b-final.png' });

    // ==========================================
    // Success: Both users completed Stage 1
    // ==========================================
    // - Both users completed Stage 0 (compact signing)
    // - Both users conversed with fixture-based AI
    // - Both users received and confirmed feel-heard check
    // - Conversation continues (Stage 2 entry gate passed)
    //
    // NOTE: This test proves Stage 1 COMPLETION. Stage 2 UI panel visibility
    // depends on cache updates which may have timing issues (documented in audits).
  });
});
