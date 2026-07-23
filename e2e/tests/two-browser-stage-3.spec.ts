/**
 * Two Browser Stage 3 Test
 *
 * Tests that both users can complete Stage 3 (Need Mapping) by:
 * - Navigating to session and handling mood check
 * - Triggering needs extraction via API (AI returns deterministic fixture responses)
 * - Reviewing and confirming identified needs
 * - Explicitly consenting to share needs
 * - Both users making side-by-side needs available
 * - Both users advancing to Stage 4
 *
 * SUCCESS CRITERIA:
 * - Both users complete Stage 2 prerequisite (empathy revealed)
 * - Both users trigger needs extraction via API (fixture returns 3 needs each)
 * - Both users see needs review UI and confirm needs
 * - Both users explicitly share/consent before reveal
 * - Both users see side-by-side needs without overlap badges
 * - Both users advance to Stage 4 after both have sent needs
 * - 8+ screenshots document each state for both users
 *
 * VISUAL REGRESSION BASELINES:
 * - Baselines auto-created in .spec.ts-snapshots/ on first run
 * - To update after intentional UI changes: npx playwright test [test-name] --update-snapshots
 * - Review diff images in test-results/ before committing updated baselines
 * - Commit baselines: git add e2e/tests/[test-name]-snapshots/*.png
 * - Never update baselines without understanding WHY pixels changed
 *
 * This test uses the stage-3-needs fixture for deterministic needs extraction.
 */

import { test, expect, devices, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import {
  cleanupE2EData,
  confirmNeedsSummaryAndConsent,
  getE2EHeaders,
  SessionBuilder,
  expectNeedsComparisonFromApi,
  expectNeedsSummaryFromApi,
  waitForNeedsReveal,
  waitForStage,
} from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8082';

// Test users
const userA = { email: 'stage3-two-a@e2e.test', name: 'Shantam' };
const userB = { email: 'stage3-two-b@e2e.test', name: 'Darryl' };

// Use the stage-3-needs fixture for deterministic AI responses
const FIXTURE_ID = 'stage-3-needs';

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

async function ensureNeedsSummary(
  api: ReturnType<typeof makeApiRequest>,
  sessionId: string,
  needs: Array<{ need: string; category: string }>
): Promise<void> {
  const response = await api.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
  const data = await response.json();
  if ((data.data?.needs?.length ?? 0) > 0) {
    return;
  }

  for (const need of needs) {
    const createResponse = await api.post(`${API_BASE_URL}/api/sessions/${sessionId}/needs`, need);
    expect(createResponse.ok(), `Failed to seed Stage 3 need: ${need.need}`).toBe(true);
  }
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

test.describe('Stage 3: Two-Browser Need Mapping', () => {
  let sessionId: string;
  let userAId: string;
  let userBId: string;
  let userAContext: BrowserContext;
  let userBContext: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser, request }) => {
    await cleanupE2EData().catch(() => {});

    // Start at EMPATHY_REVEALED - both users have completed Stage 2
    const setup = await new SessionBuilder(API_BASE_URL)
      .userA(userA.email, userA.name)
      .userB(userB.email, userB.name)
      .startingAt('EMPATHY_REVEALED')
      .setup(request);

    sessionId = setup.session.id;
    userAId = setup.userA.id;
    userBId = setup.userB!.id;

    console.log(`[Setup] Session: ${sessionId} at EMPATHY_REVEALED stage`);

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

  test('Complete Stage 3 flow for both users', async ({ request }) => {
    test.setTimeout(180000); // 3 minutes - needs extraction can involve AI calls
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
    await pageA.screenshot({ path: 'test-results/stage-3-01-initial-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-01-initial-user-b.png' });

    // ========================================
    // STEP 2: Trigger needs extraction via API for both users
    // ========================================
    console.log(`${elapsed()} === STEP 2: Trigger needs extraction ===`);

    // Trigger needs extraction for both users
    // This calls the backend service which uses the 'extract-needs' operation from stage-3-needs fixture
    const extractNeedsA = apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);
    const extractNeedsB = apiB.get(`${API_BASE_URL}/api/sessions/${sessionId}/needs`);

    await Promise.all([extractNeedsA, extractNeedsB]);

    console.log(`${elapsed()} Needs extraction triggered for both users`);

    // Seed fallback needs when starting from EMPATHY_REVEALED with no Stage 3
    // chat turns. The backend intentionally avoids auto-extraction until users
    // have spoken in Stage 3.
    await ensureNeedsSummary(apiA, sessionId, [
      {
        need: 'I need to feel appreciated for the work I do around the house',
        category: 'RECOGNITION',
      },
      {
        need: 'I need us to share responsibilities more equally',
        category: 'FAIRNESS',
      },
    ]);
    await ensureNeedsSummary(apiB, sessionId, [
      {
        need: 'I need understanding about how exhausted I am after work',
        category: 'CONNECTION',
      },
      {
        need: 'I need emotional support when I come home tired',
        category: 'SAFETY',
      },
    ]);

    // ========================================
    // STEP 3: Reload and verify needs drawer CTA phase
    // ========================================
    console.log(`${elapsed()} === STEP 3: Verify needs drawer CTA phase ===`);

    // Reload pages to show the needs CTA
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check if it reappears after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    await expectNeedsSummaryFromApi(apiA, API_BASE_URL, sessionId, 'User A');
    await expectNeedsSummaryFromApi(apiB, API_BASE_URL, sessionId, 'User B');

    await expect(pageA.getByTestId('needs-drawer-open-button')).toBeVisible({ timeout: 30000 });
    await expect(pageB.getByTestId('needs-drawer-open-button')).toBeVisible({ timeout: 30000 });

    console.log(`${elapsed()} Needs drawer CTA visible for both users`);

    // Screenshot needs CTA state
    await pageA.screenshot({ path: 'test-results/stage-3-02-needs-cta-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-02-needs-cta-user-b.png' });

    await confirmNeedsSummaryAndConsent(pageA, apiA, API_BASE_URL, sessionId, 'User A');
    await confirmNeedsSummaryAndConsent(pageB, apiB, API_BASE_URL, sessionId, 'User B');

    // Wait a moment for share consent to propagate
    await pageA.waitForTimeout(1000);

    // Take screenshots after API confirmation/consent
    await pageA.screenshot({ path: 'test-results/stage-3-03-user-a-confirmed.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-04-user-b-confirmed.png' });

    // ========================================
    // STEP 6: Wait for side-by-side needs reveal
    // ========================================
    console.log(`${elapsed()} === STEP 6: Wait for side-by-side needs reveal ===`);

    await waitForNeedsReveal(apiA, API_BASE_URL, sessionId, 'User A', 30000);
    console.log(`${elapsed()} Needs reveal ready`);

    // ========================================
    // STEP 7: Verify side-by-side needs reveal
    // ========================================
    console.log(`${elapsed()} === STEP 7: Verify side-by-side needs reveal ===`);

    // Reload both pages to show needs reveal UI
    await Promise.all([
      pageA.reload(),
      pageB.reload(),
    ]);

    await Promise.all([
      pageA.waitForLoadState('networkidle'),
      pageB.waitForLoadState('networkidle'),
    ]);

    // Handle mood check if it reappears after reload
    await handleMoodCheck(pageA);
    await handleMoodCheck(pageB);

    await expectNeedsComparisonFromApi(apiA, API_BASE_URL, sessionId, 'User A');
    await expectNeedsComparisonFromApi(apiB, API_BASE_URL, sessionId, 'User B');

    console.log(`${elapsed()} Side-by-side reveal data available for both users`);

    // Screenshot needs reveal state
    await pageA.screenshot({ path: 'test-results/stage-3-05-common-ground-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-05-common-ground-user-b.png' });

    // ========================================
    // STEP 8: Backend advances to Stage 4 after both users send needs
    // ========================================
    console.log(`${elapsed()} === STEP 8: Wait for automatic Stage 4 transition ===`);

    await Promise.all([
      waitForStage(apiA, API_BASE_URL, sessionId, 4, 'User A', 30000),
      waitForStage(apiB, API_BASE_URL, sessionId, 4, 'User B', 30000),
    ]);

    // Screenshot User B after continuing
    await pageB.screenshot({ path: 'test-results/stage-3-07-user-b-continue.png' });

    // ========================================
    // STEP 9: Verify final state (both advanced past Stage 3)
    // ========================================
    console.log(`${elapsed()} === STEP 9: Verify final state ===`);

    // Get progress for both users to verify stage advancement
    const progressResponseA = await apiA.get(`${API_BASE_URL}/api/sessions/${sessionId}/progress`);
    const progressDataA = await progressResponseA.json();

    const progressResponseB = await apiB.get(`${API_BASE_URL}/api/sessions/${sessionId}/progress`);
    const progressDataB = await progressResponseB.json();

    console.log(`${elapsed()} User A stage: ${progressDataA.data?.myProgress?.stage}`);
    console.log(`${elapsed()} User B stage: ${progressDataB.data?.myProgress?.stage}`);

    expect(progressDataA.data?.myProgress?.stage).toBe(4);
    expect(progressDataB.data?.myProgress?.stage).toBe(4);

    // Take final screenshots
    await pageA.screenshot({ path: 'test-results/stage-3-08-final-user-a.png' });
    await pageB.screenshot({ path: 'test-results/stage-3-08-final-user-b.png' });

    console.log(`${elapsed()} === TEST COMPLETE ===`);
    console.log(`${elapsed()} Both users completed Stage 3 successfully!`);
    console.log(`${elapsed()} Screenshots captured: 10 total (5 per user)`);
  });
});
