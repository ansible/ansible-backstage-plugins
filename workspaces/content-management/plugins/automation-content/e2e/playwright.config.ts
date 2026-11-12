import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.EE_DISCOVERY_BASE_URL;
if (!baseURL) {
  throw new Error(
    'Set EE_DISCOVERY_BASE_URL to the isolated source or packed host.',
  );
}

export default defineConfig({
  testDir: '.',
  testMatch: 'ee-discovery.spec.ts',
  outputDir:
    process.env.EE_DISCOVERY_RESULTS_DIR ??
    join(tmpdir(), 'automation-content-ee-playwright'),
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: process.env.EE_DISCOVERY_STORAGE_STATE,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        colorScheme: 'light',
      },
    },
    {
      name: 'tablet-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 820, height: 1180 },
        colorScheme: 'dark',
      },
    },
  ],
});
