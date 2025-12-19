import { defineConfig } from 'cypress';

/**
 * Base Cypress configuration with optimizations inspired by aap-ui project
 * Shared settings for better performance and consistency
 */
export const baseConfig = defineConfig({
  // Global timeouts and performance settings
  defaultCommandTimeout: 40000,
  execTimeout: 150000,
  pageLoadTimeout: 90000,
  requestTimeout: 15000,
  responseTimeout: 15000,
  animationDistanceThreshold: 20,

  // Security and viewport settings
  chromeWebSecurity: false,
  viewportWidth: 1920,
  viewportHeight: 1080,

  // Video and screenshot settings
  video: true,
  screenshotOnRunFailure: true,

  // Reporter configuration for CI integration
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: 'reporter-config.json',
  },

  // Retry configuration
  retries: {
    // Retries when running in CI (cypress run)
    runMode: 2,
    // Retries when running interactively (cypress open)
    openMode: 0,
  },

  // E2E specific configuration
  e2e: {
    // Performance optimizations (like aap-ui)
    experimentalMemoryManagement: true,
    testIsolation: false,

    // Default command timeout for e2e tests
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 30000,

    // File paths
    supportFile: 'cypress/support/e2e.ts',
    videosFolder: 'cypress/videos',
    screenshotsFolder: 'cypress/screenshots',
    downloadsFolder: 'cypress/downloads',
    fixturesFolder: 'cypress/fixtures',

    setupNodeEvents(on, config) {
      // Implement node event listeners here if needed
      return config;
    },
  },
});
