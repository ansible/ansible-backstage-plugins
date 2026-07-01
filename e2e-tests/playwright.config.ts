import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Playwright configuration for ansible-backstage-plugins E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './playwright/tests',

  // Serial execution within worker to maintain shared browser context
  fullyParallel: false,
  workers: 1, // Single worker to share browser context across all tests

  // Retry configuration
  retries: process.env.CI ? 1 : 0,

  // Global timeout prevents runaway CI builds
  globalTimeout: process.env.PLAYWRIGHT_GLOBAL_TIMEOUT
    ? parseInt(process.env.PLAYWRIGHT_GLOBAL_TIMEOUT)
    : process.env.CI
    ? 20 * 60 * 1000
    : undefined,

  // Timeouts (configurable via environment variables for CI)
  // Recommended CI values: PLAYWRIGHT_TEST_TIMEOUT=90000 (90s)
  timeout: process.env.PLAYWRIGHT_TEST_TIMEOUT
    ? parseInt(process.env.PLAYWRIGHT_TEST_TIMEOUT)
    : 60 * 1000, // Default: 60s per test
  expect: {
    // Recommended CI value: PLAYWRIGHT_EXPECT_TIMEOUT=10000 (10s)
    timeout: process.env.PLAYWRIGHT_EXPECT_TIMEOUT
      ? parseInt(process.env.PLAYWRIGHT_EXPECT_TIMEOUT)
      : 10000, // Default: 10s for assertions
  },

  // Reporters
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results/results.xml' }],
    ['json', { outputFile: 'playwright-results/results.json' }],
    ['list'], // Console output
  ],

  use: {
    // Base URL from environment variable
    baseURL: process.env.BASE_URL || 'http://localhost:7071',

    // Trace on failure
    trace: 'retain-on-failure', // Always capture trace on failure for debugging
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'off' : 'retain-on-failure',

    // Viewport
    viewport: { width: 1920, height: 1080 },

    // Action timeout (default for click, fill, etc.) - configurable for CI
    actionTimeout: process.env.PLAYWRIGHT_ACTION_TIMEOUT
      ? parseInt(process.env.PLAYWRIGHT_ACTION_TIMEOUT)
      : 30000, // 30s — must be high enough for OpenShift OAuth Sign In

    // Navigation timeout - configurable for CI
    // Recommended CI value: PLAYWRIGHT_NAVIGATION_TIMEOUT=30000 (30s)
    navigationTimeout: process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT
      ? parseInt(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT)
      : 30000,

    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,
  },

  // Test projects - using shared browser context for session persistence
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome', // Use system-installed Chrome, skip Playwright Chromium download
      },
    },
  ],

  // Global setup — create non-admin test user in AAP via API
  globalSetup: process.env.AAP_NONADMIN_USER_ID
    ? require.resolve('./playwright/global-setup')
    : undefined,

  // Global teardown — clean up non-admin test user
  globalTeardown: process.env.AAP_NONADMIN_USER_ID
    ? require.resolve('./playwright/global-teardown')
    : undefined,

  // Output directories
  outputDir: 'playwright-results/test-artifacts',
});
