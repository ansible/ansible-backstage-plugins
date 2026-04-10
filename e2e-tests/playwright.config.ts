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
  globalTimeout: process.env.CI ? 10 * 60 * 1000 : undefined, // 10 min total on CI

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

  // Reporters - similar to Cypress multi-reporters setup
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results/results.xml' }],
    ['json', { outputFile: 'playwright-results/results.json' }],
    ['list'], // Console output
  ],

  use: {
    // Base URL from environment variable
    baseURL: process.env.BASE_URL || 'http://localhost:7071',

    // Trace on failure - better than Cypress video
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'off' : 'retain-on-failure',

    // Viewport (matching Cypress config)
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

    // Ignore HTTPS errors (matching Cypress chromeWebSecurity: false)
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

  // Output directories
  outputDir: 'playwright-results/test-artifacts',
});
