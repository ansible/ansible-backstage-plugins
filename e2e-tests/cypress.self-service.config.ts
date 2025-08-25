import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.SELF_SERVICE_URL,
    specPattern: 'cypress/e2e/self-service/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    videosFolder: 'cypress/videos',
    screenshotsFolder: 'cypress/screenshots',
    downloadsFolder: 'cypress/downloads',
    fixturesFolder: 'cypress/fixtures',

    // Performance optimizations (like aap-ui)
    experimentalMemoryManagement: true,
    testIsolation: false,

    // Cross-origin configuration for AAP login redirect
    chromeWebSecurity: false,

    // Test configuration
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    pageLoadTimeout: 30000,

    env: {
      // Self-service specific environment variables
      SERVICE_TYPE: 'SELF_SERVICE',
      AAP_USER_ID: process.env.AAP_USER_ID || 'admin',
      AAP_USER_PASS: process.env.AAP_USER_PASS,
      AAP_URL: process.env.AAP_URL,
    },

    setupNodeEvents(on, config) {
      // Implement node event listeners here if needed
    },
  },
});
