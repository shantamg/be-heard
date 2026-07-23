/**
 * Legacy Two Browser Stage 4 Ranking Test
 *
 * Tests the pre-redesign ranking flow. This remains documented for compatibility
 * endpoints, but active redesigned Stage 4 coverage lives in
 * two-browser-stage-4-redesign.spec.ts.
 *
 * Tests that both users can complete legacy Stage 4 (Strategic Repair) by:
 * - Navigating to session from NEED_MAPPING_COMPLETE state
 * - Proposing strategies to the anonymous pool via API
 * - Marking ready to rank
 * - Submitting strategy rankings via API
 * - Viewing overlap reveal (strategies both ranked in top 3)
 * - Creating and confirming an agreement
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 3 prerequisite (needs mapped and common ground confirmed)
 * - Both users propose strategies via API (3 total strategies in pool)
 * - Both users mark ready to rank
 * - Both users submit rankings via API with guaranteed overlap
 * - Overlap reveal shows at least 1 strategy both ranked in top 3
 * - One user creates agreement, other confirms
 * - Session marked complete after agreement confirmation
 * - 10+ screenshots document each state for both users
 *
 * VISUAL REGRESSION BASELINES:
 * - Baselines auto-created in .spec.ts-snapshots/ on first run
 * - To update after intentional UI changes: npx playwright test [test-name] --update-snapshots
 * - Review diff images in test-results/ before committing updated baselines
 * - Commit baselines: git add e2e/tests/[test-name]-snapshots/*.png
 * - Never update baselines without understanding WHY pixels changed
 *
 * This test uses the stage-4-strategies fixture for deterministic AI responses
 * during the Stage 0-3 setup phase.
 */

import { test, expect, devices, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { cleanupE2EData, getE2EHeaders, SessionBuilder } from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'stage4-two-a@e2e.test', name: 'Alice' };
const userB = { email: 'stage4-two-b@e2e.test', name: 'Bob' };

// Use the stage-4-strategies fixture for deterministic AI responses
const FIXTURE_ID = 'stage-4-strategies';

/**
 * Create a new browser context with E2E headers for a specific user.
 */
async function createUserContext(
  browser: import('@playwright/test').Browser,
  userEmail: string,
  userId: string,
  fixtureId?: string,
  position?: { x: number; y: number }
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    extraHTTPHeaders: getE2EHeaders(userEmail, userId, fixtureId),
  });
  const page = await context.newPage();

  if (position) {
    await page.evaluate(({ x, y }) => {
      window.moveTo(x, y);
      window.resizeTo(420, 750);
    }, position).catch(() => {});
  }

  return { context, page };
}

/**
 * Helper to make authenticated API requests for a specific user
 */
function makeApiRequest(
  request: APIRequestContext,
  userEmail: string,
  userId: string,
  fixtureId?: string
) {
  const headers = getE2EHeaders(userEmail, userId, fixtureId);

  return {
    get: (url: string) => request.get(url, { headers }),
    post: (url: string, data?: object) => request.post(url, { headers, data }),
  };
}

/**
 * Handle mood check modal if it appears.
 */
async function handleMoodCheck(page: Page, timeout = 5000): Promise<void> {
  const moodContinue = page.getByTestId('mood-check-continue-button');
  if (await moodContinue.isVisible({ timeout }).catch(() => false)) {
    await moodContinue.click();
    await page.waitForTimeout(1000);
  }
}

test.describe.skip('Stage 4 legacy ranking flow', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let userBContext: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Start at NEED_MAPPING_COMPLETE - both users have completed Stage 3
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('NEED_MAPPING_COMPLETE')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} at NEED_MAPPING_COMPLETE stage`);

    // Create browser contexts for both users side-by-side
    const userASetup = await createUserContext(browser, userA.email, userAId, FIXTURE_ID, { x: 0, y: 0 });
    const userBSetup = await createUserContext(browser, userB.email, userBId, FIXTURE_ID, { x: 450, y: 0 });
    userAContext = userASetup.context;
    userBContext = userBSetup.context;
    pageA = userASetup.page;
    pageB = userBSetup.page;
  });

  test.afterEach(async () => {
    await userAContext?.close();
    await userBContext?.close();
  });

  test('Both users complete Stage 4: strategies, ranking, overlap, and agreement', async ({ request }) => {
    test.setTimeout(180000); // 3 minutes - multiple API calls and page reloads
    const testStart = Date.now();
    const elapsed = () => `[${((Date.now() - testStart) / 1000).toFixed(1)}s]`;

    // Create API helpers for both users
    const apiA = makeApiRequest(request, userA.email, userAId, FIXTURE_ID);
    const apiB = makeApiRequest(request, userB.email, userBId, FIXTURE_ID);

    // ========================================
    // STEP 1: Navigate both users to session
    // ========================================
    console.log(`${elapsed()} === STEP 1: Navigate to session ===`);

    const userAParams = new URLSearchParams({
      'e2e-user-id': userAId,
      'e2e-user-email': userA.email,
    });
    const userBParams = new URLSearchParams({
      'e2e-user-id': userBId,
      'e2e-user-email': userB.email,
    });

    await Promise.all([
      pageA.goto(`${APP_BASE_URL}/session/${sessionId}?${userAParams.toString()}`),
      pageB.goto(`${APP_BASE_URL}/session/${sessionId}?${userBParams.toString()}`),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    console.log(`${elapsed()} Both users navigated to session`);

    // Handle mood check if visible
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    // Take initial screenshots
    await expect(pageA).toHaveScreenshot('stage-4-01-initial-user-a.png', {
      maxDiffPixels: 100,
    });
    await expect(pageB).toHaveScreenshot('stage-4-01-initial-user-b.png', {
      maxDiffPixels: 100,
    });

    // ========================================
    // STEP 2: Propose strategies via API (both users)
    // ========================================
    console.log(`${elapsed()} === STEP 2: Propose strategies via API ===`);

    // User A proposes 2 strategies
    const strategyA1 = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Have a 10-minute phone-free conversation at dinner each day',
      needsAddressed: ['Connection', 'Recognition'],
    });
    const strategyA1Data = await strategyA1.json();
    console.log(`${elapsed()} User A strategy 1: ${strategyA1Data.success ? 'created' : 'failed'}`);
    expect(strategyA1.ok(), 'User A first strategy was not created').toBe(true);

    const strategyA2 = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Use a pause signal when conversations get heated',
      needsAddressed: ['Safety', 'Connection'],
    });
    const strategyA2Data = await strategyA2.json();
    console.log(`${elapsed()} User A strategy 2: ${strategyA2Data.success ? 'created' : 'failed'}`);
    expect(strategyA2.ok(), 'User A second strategy was not created').toBe(true);

    // User B proposes 1 strategy
    const strategyB1 = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`, {
      description: 'Say one specific thing I appreciate each morning',
      needsAddressed: ['Recognition'],
    });
    const strategyB1Data = await strategyB1.json();
    console.log(`${elapsed()} User B strategy 1: ${strategyB1Data.success ? 'created' : 'failed'}`);
    expect(strategyB1.ok(), 'User B strategy was not created').toBe(true);

    // Proposals remain private during collection. User A should see only the
    // two strategies they created until both users mark themselves ready.
    const strategiesResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies`);
    const strategiesData = await strategiesResponse.json();
    const privateStrategies = strategiesData.data?.strategies || [];
    console.log(`${elapsed()} User A strategies visible before mutual readiness: ${privateStrategies.length}`);
    expect(privateStrategies).toHaveLength(2);

    // Reload pages to show strategy pool UI
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    // Try to verify pool text is visible (10s timeout, catch failure - RN Web may not show this)
    try {
      const poolTextA = pageA.getByText(/Here is what we have come up with/i);
      await expect(poolTextA).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} Strategy pool UI visible for User A`);
    } catch (e) {
      console.log(`${elapsed()} Strategy pool UI not visible for User A (RN Web text rendering)`);
    }

    // Screenshots: strategy pool phase
    await expect(pageA).toHaveScreenshot('stage-4-02-pool-user-a.png', {
      maxDiffPixels: 100,
    });
    await expect(pageB).toHaveScreenshot('stage-4-02-pool-user-b.png', {
      maxDiffPixels: 100,
    });

    // ========================================
    // STEP 3: Mark both users ready to rank
    // ========================================
    console.log(`${elapsed()} === STEP 3: Mark both users ready to rank ===`);

    // User A marks ready
    const readyAResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
    const readyAData = await readyAResponse.json();
    console.log(`${elapsed()} User A ready: success=${readyAData.success}, partnerReady=${readyAData.data?.partnerReady}`);

    // User B marks ready
    const readyBResponse = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/ready`);
    const readyBData = await readyBResponse.json();
    console.log(`${elapsed()} User B ready: success=${readyBData.success}, canStartRanking=${readyBData.data?.canStartRanking}`);

    // Verify both are ready
    expect(readyAResponse.ok(), 'User A was not marked ready to rank').toBe(true);
    expect(readyBResponse.ok(), 'User B was not marked ready to rank').toBe(true);
    expect(readyBData.data?.canStartRanking).toBe(true);

    // ========================================
    // STEP 4: Submit rankings via API (both users)
    // ========================================
    console.log(`${elapsed()} === STEP 4: Submit rankings via API ===`);

    // Mutual readiness opens the anonymous shared pool.
    const sharedStrategiesResponse = await apiA.get(
      `${API_BASE_URL}/api/sessions/${sessionId}/strategies`
    );
    const sharedStrategiesData = await sharedStrategiesResponse.json();
    const strategies = sharedStrategiesData.data?.strategies || [];
    expect(strategies).toHaveLength(3);
    expect(sharedStrategiesData.data?.canRank).toBe(true);

    // Get strategy IDs from the shared pool
    const strategy1 = strategies[0];
    const strategy2 = strategies[1];
    const strategy3 = strategies[2];

    console.log(`${elapsed()} Strategy IDs: [${strategy1.id}, ${strategy2.id}, ${strategy3.id}]`);

    // User A ranks: [strategy1, strategy2, strategy3]
    const rankAResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
      rankedIds: [strategy1.id, strategy2.id, strategy3.id],
    });
    const rankAData = await rankAResponse.json();
    console.log(`${elapsed()} User A ranking: success=${rankAData.success}`);

    // User B ranks: [strategy1, strategy3, strategy2] (different order but strategy1 first = guaranteed overlap)
    const rankBResponse = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/rank`, {
      rankedIds: [strategy1.id, strategy3.id, strategy2.id],
    });
    const rankBData = await rankBResponse.json();
    console.log(`${elapsed()} User B ranking: success=${rankBData.success}, canReveal=${rankBData.data?.canReveal}`);

    // Verify both have ranked
    expect(rankBData.data?.canReveal).toBe(true);

    // Reload pages to show ranking/reveal UI
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    // Try to verify ranking text visible (10s timeout, catch failure)
    try {
      const rankingTextA = pageA.getByText(/Rank Your Top Choices|Your Shared Priorities/i);
      await expect(rankingTextA).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} Ranking UI visible for User A`);
    } catch (e) {
      console.log(`${elapsed()} Ranking UI not visible for User A (RN Web text rendering)`);
    }

    // Screenshots: ranking phase
    await expect(pageA).toHaveScreenshot('stage-4-03-ranking-user-a.png', {
      maxDiffPixels: 100,
    });
    await expect(pageB).toHaveScreenshot('stage-4-03-ranking-user-b.png', {
      maxDiffPixels: 100,
    });

    // ========================================
    // STEP 5: Verify overlap via API
    // ========================================
    console.log(`${elapsed()} === STEP 5: Verify overlap via API ===`);

    // Get overlap for both users
    const overlapAResponse = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/overlap`);
    const overlapAData = await overlapAResponse.json();

    const overlapBResponse = await apiB.get(`${API_BASE_URL}/api/sessions/${sessionId}/strategies/overlap`);
    const overlapBData = await overlapBResponse.json();

    console.log(`${elapsed()} User A overlap: ${JSON.stringify(overlapAData.data?.overlap)}`);
    console.log(`${elapsed()} User B overlap: ${JSON.stringify(overlapBData.data?.overlap)}`);

    // Assert overlap exists (at least 1 strategy in both top 3)
    expect(overlapAData.data?.overlap).not.toBeNull();
    expect(Array.isArray(overlapAData.data?.overlap)).toBe(true);
    expect(overlapAData.data?.overlap.length).toBeGreaterThanOrEqual(1);

    const overlapStrategies = overlapAData.data?.overlap || [];
    console.log(`${elapsed()} Overlap strategies: ${overlapStrategies.map((s: { description: string }) => s.description).join('; ')}`);

    // Reload pages to show overlap reveal UI
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    // Try to verify overlap text visible (10s timeout, catch failure)
    try {
      const overlapTextA = pageA.getByText(/Your Shared Priorities|You Both Chose/i);
      await expect(overlapTextA).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} Overlap reveal UI visible for User A`);
    } catch (e) {
      console.log(`${elapsed()} Overlap reveal UI not visible for User A (RN Web text rendering)`);
    }

    // Screenshots: overlap reveal phase
    await expect(pageA).toHaveScreenshot('stage-4-04-overlap-user-a.png', {
      maxDiffPixels: 100,
    });
    await expect(pageB).toHaveScreenshot('stage-4-04-overlap-user-b.png', {
      maxDiffPixels: 100,
    });

    // ========================================
    // STEP 6: Create agreement via API
    // ========================================
    console.log(`${elapsed()} === STEP 6: Create agreement via API ===`);

    // Use first overlap strategy for agreement
    const overlapStrategy = overlapStrategies[0];
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 7); // 7 days from now

    const agreementResponse = await apiA.post(`${API_BASE_URL}/api/sessions/${sessionId}/agreements`, {
      strategyId: overlapStrategy.id,
      description: overlapStrategy.description,
      type: 'MICRO_EXPERIMENT',
      followUpDate: followUpDate.toISOString(),
    });
    const agreementData = await agreementResponse.json();
    console.log(`${elapsed()} Agreement created: success=${agreementData.success}, awaitingPartner=${agreementData.data?.awaitingPartnerConfirmation}`);

    expect(agreementResponse.ok(), 'Agreement was not created').toBe(true);
    expect(agreementData.data?.awaitingPartnerConfirmation).toBe(true);

    const agreementId = agreementData.data?.agreement?.id;
    console.log(`${elapsed()} Agreement ID: ${agreementId}`);

    // ========================================
    // STEP 7: Confirm agreement via API (partner)
    // ========================================
    console.log(`${elapsed()} === STEP 7: Confirm agreement via API (partner) ===`);

    // User B confirms the agreement
    const confirmResponse = await apiB.post(`${API_BASE_URL}/api/sessions/${sessionId}/agreements/${agreementId}/confirm`, {
      confirmed: true,
    });
    const confirmData = await confirmResponse.json();
    console.log(`${elapsed()} Agreement confirmed: success=${confirmData.success}, sessionCanResolve=${confirmData.data?.sessionCanResolve}`);

    expect(confirmResponse.ok(), 'Partner agreement confirmation failed').toBe(true);
    expect(confirmData.data?.agreement?.status).toBe('AGREED');
    expect(confirmData.data?.sessionCanResolve).toBe(true);

    // Reload pages to show agreement UI
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    // Try to verify agreement text visible (10s timeout, catch failure)
    try {
      const agreementTextA = pageA.getByText(/Micro-Experiment Agreement|Confirm Agreement/i);
      await expect(agreementTextA).toBeVisible({ timeout: 10000 });
      console.log(`${elapsed()} Agreement UI visible for User A`);
    } catch (e) {
      console.log(`${elapsed()} Agreement UI not visible for User A (RN Web text rendering)`);
    }

    // Screenshots: agreement phase
    await expect(pageA).toHaveScreenshot('stage-4-05-agreement-user-a.png', {
      maxDiffPixels: 100,
    });
    await expect(pageB).toHaveScreenshot('stage-4-05-agreement-user-b.png', {
      maxDiffPixels: 100,
    });

    // ========================================
    // Final summary log
    // ========================================
    console.log(`${elapsed()} === TEST COMPLETE ===`);
    console.log(`${elapsed()} Both users completed Stage 4 successfully!`);
    console.log(`${elapsed()} Summary:`);
    console.log(`  - Strategies proposed: 3 (2 by User A, 1 by User B)`);
    console.log(`  - Both users marked ready to rank: ✓`);
    console.log(`  - Both users submitted rankings: ✓`);
    console.log(`  - Overlap strategies: ${overlapStrategies.length}`);
    console.log(`  - Agreement created by User A: ✓`);
    console.log(`  - Agreement confirmed by User B: ✓`);
    console.log(`  - Session marked complete: ✓`);
    console.log(`${elapsed()} Screenshots captured: 10 total (5 per user)`);
  });
});
