/**
 * Two Browser Harness for E2E Tests
 *
 * Manages two isolated browser contexts with per-user fixture IDs for testing
 * partner interactions via real Ably events.
 */

import { Browser, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { getE2EHeaders } from './auth';
import { cleanupE2EData } from './cleanup';
import { createUserContext, navigateToSession, handleMoodCheck } from './test-utils';

export interface TwoBrowserConfig {
  // fixtureId is optional: omit for real-AI runs (MOCK_LLM=false), provide for
  // mocked runs that match a backend test fixture.
  userA: { email: string; name: string; fixtureId?: string };
  userB: { email: string; name: string; fixtureId?: string };
  apiBaseUrl?: string;  // defaults to process.env.API_BASE_URL || 'http://localhost:3000'
  appBaseUrl?: string;  // defaults to process.env.APP_BASE_URL || 'http://localhost:8082'
}

/**
 * TwoBrowserHarness manages two isolated browser contexts (User A and User B)
 * with per-user fixture IDs for deterministic AI responses.
 *
 * @example
 * ```typescript
 * const harness = new TwoBrowserHarness({
 *   userA: { email: 'shantam@e2e.test', name: 'Shantam', fixtureId: 'fixture-a' },
 *   userB: { email: 'darryl@e2e.test', name: 'Darryl', fixtureId: 'fixture-b' },
 * });
 *
 * await harness.cleanup();
 * await harness.setupUserA(browser, request);
 * await harness.setupUserB(browser, request);
 * await harness.createSession();
 * await harness.acceptInvitation();
 * await harness.navigateUserA();
 * await harness.navigateUserB();
 * // ... test logic ...
 * await harness.teardown();
 * ```
 */
export class TwoBrowserHarness {
  public readonly config: TwoBrowserConfig;
  private readonly apiBaseUrl: string;
  private readonly appBaseUrl: string;
  private request?: APIRequestContext;

  // User A properties (set during setupUserA)
  public userAPage!: Page;
  public userAContext!: BrowserContext;
  public userAId!: string;

  // User B properties (set during setupUserB)
  public userBPage!: Page;
  public userBContext!: BrowserContext;
  public userBId!: string;

  // Session properties (set during createSession)
  public sessionId!: string;
  public invitationId!: string;

  constructor(config: TwoBrowserConfig) {
    this.config = config;
    this.apiBaseUrl = config.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
    this.appBaseUrl = config.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:8082';
  }

  /**
   * Clean up E2E test data from the database.
   * Call in `beforeEach` before setup.
   */
  async cleanup(): Promise<void> {
    await cleanupE2EData();
  }

  /**
   * Set up User A: seed user via API and create browser context.
   * Stores userAPage, userAContext, userAId as public properties.
   *
   * @param browser - Playwright Browser instance
   * @param request - Playwright APIRequestContext for making API calls
   */
  async setupUserA(browser: Browser, request: APIRequestContext): Promise<void> {
    this.request = request;

    // Seed User A via API
    const seedResponse = await request.post(`${this.apiBaseUrl}/api/e2e/seed`, {
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      data: { email: this.config.userA.email, name: this.config.userA.name },
    });

    if (!seedResponse.ok()) {
      throw new Error(`User A seed failed: ${seedResponse.status()} ${await seedResponse.text()}`);
    }

    const seedData = await seedResponse.json();
    this.userAId = seedData.id;

    // Create browser context for User A
    const { context, page } = await createUserContext(
      browser,
      this.config.userA.email,
      this.userAId,
      this.config.userA.fixtureId,
      { x: 0, y: 0 } // Position for headed mode
    );

    this.userAContext = context;
    this.userAPage = page;
  }

  /**
   * Set up User B: seed user via API and create browser context.
   * Stores userBPage, userBContext, userBId as public properties.
   *
   * @param browser - Playwright Browser instance
   * @param request - Playwright APIRequestContext for making API calls
   */
  async setupUserB(browser: Browser, request: APIRequestContext): Promise<void> {
    if (!this.request) {
      this.request = request;
    }

    // Seed User B via API
    const seedResponse = await request.post(`${this.apiBaseUrl}/api/e2e/seed`, {
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      data: { email: this.config.userB.email, name: this.config.userB.name },
    });

    if (!seedResponse.ok()) {
      throw new Error(`User B seed failed: ${seedResponse.status()} ${await seedResponse.text()}`);
    }

    const seedData = await seedResponse.json();
    this.userBId = seedData.id;

    // Create browser context for User B
    const { context, page } = await createUserContext(
      browser,
      this.config.userB.email,
      this.userBId,
      this.config.userB.fixtureId,
      { x: 450, y: 0 } // Position side-by-side for headed mode
    );

    this.userBContext = context;
    this.userBPage = page;
  }

  /**
   * Create a session as User A and invite User B.
   * Stores sessionId and invitationId as public properties.
   *
   * @returns The session ID
   */
  async createSession(): Promise<string> {
    if (!this.request) {
      throw new Error('setupUserA must be called before createSession');
    }

    const response = await this.request.post(`${this.apiBaseUrl}/api/sessions`, {
      headers: {
        ...getE2EHeaders(this.config.userA.email, this.userAId, this.config.userA.fixtureId),
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      data: {
        inviteName: this.config.userB.name,
      },
    });

    if (!response.ok()) {
      throw new Error(`Session creation failed: ${response.status()} ${await response.text()}`);
    }

    const responseData = await response.json();
    this.sessionId = responseData.data.session.id;
    this.invitationId = responseData.data.invitationId;

    return this.sessionId;
  }

  /**
   * Accept the invitation as User B.
   * Requires setupUserB and createSession to have been called first.
   */
  async acceptInvitation(): Promise<void> {
    if (!this.request) {
      throw new Error('setupUserB must be called before acceptInvitation');
    }
    if (!this.invitationId) {
      throw new Error('createSession must be called before acceptInvitation');
    }

    const response = await this.request.post(`${this.apiBaseUrl}/api/invitations/${this.invitationId}/accept`, {
      headers: {
        ...getE2EHeaders(this.config.userB.email, this.userBId, this.config.userB.fixtureId),
        'Content-Type': 'application/json',
        Connection: 'close',
      },
    });

    if (!response.ok()) {
      throw new Error(`Invitation acceptance failed: ${response.status()} ${await response.text()}`);
    }
  }

  /**
   * Navigate User A to the session page.
   */
  async navigateUserA(): Promise<void> {
    if (!this.userAPage || !this.sessionId) {
      throw new Error('setupUserA and createSession must be called before navigateUserA');
    }

    await navigateToSession(
      this.userAPage,
      this.appBaseUrl,
      this.sessionId,
      this.userAId,
      this.config.userA.email
    );
  }

  /**
   * Navigate User B to the session page.
   */
  async navigateUserB(): Promise<void> {
    if (!this.userBPage || !this.sessionId) {
      throw new Error('setupUserB and createSession must be called before navigateUserB');
    }

    await navigateToSession(
      this.userBPage,
      this.appBaseUrl,
      this.sessionId,
      this.userBId,
      this.config.userB.email
    );
  }

  /**
   * Close both browser contexts.
   * Safe to call even if contexts were never created.
   */
  async teardown(): Promise<void> {
    if (this.userAContext) {
      await this.userAContext.close();
    }
    if (this.userBContext) {
      await this.userBContext.close();
    }
  }
}

/**
 * Wait for a partner update to arrive via Ably, with optional reload fallback.
 *
 * Pattern:
 * 1. Check if locator is visible within timeout
 * 2. If not visible and reloadOnMiss is true:
 *    - Reload the page
 *    - Handle mood check if it appears
 *    - Check locator visibility again
 *
 * @param page - Playwright Page instance
 * @param locator - The locator to wait for
 * @param options - Configuration options
 * @returns true if locator became visible, false otherwise
 */
export async function waitForPartnerUpdate(
  page: Page,
  locator: import('@playwright/test').Locator,
  options?: {
    timeout?: number;      // default: 8000ms
    reloadOnMiss?: boolean; // default: true
  }
): Promise<boolean> {
  const timeout = options?.timeout ?? 8000;
  const reloadOnMiss = options?.reloadOnMiss ?? true;

  // First attempt: wait for locator to be visible
  const isVisible = await locator.isVisible({ timeout }).catch(() => false);

  if (isVisible) {
    return true;
  }

  // If not visible and reload is enabled, try again after reload
  if (reloadOnMiss) {
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Handle mood check that may appear after reload
    await handleMoodCheck(page);

    // Check visibility again with same timeout
    return await locator.isVisible({ timeout }).catch(() => false);
  }

  return false;
}
