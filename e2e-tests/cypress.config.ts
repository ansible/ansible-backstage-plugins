import { defineConfig } from 'cypress';

module.exports = defineConfig({
  defaultCommandTimeout: 40000,
  execTimeout: 150000,
  pageLoadTimeout: 90000,
  requestTimeout: 15000,
  responseTimeout: 15000,
  animationDistanceThreshold: 20,
  chromeWebSecurity: false,
  viewportWidth: 1920,
  viewportHeight: 1080,
  video: true,
  screenshotOnRunFailure: true,
  e2e: {
    testIsolation: false,
    defaultCommandTimeout: 10000,
    baseUrl: 'http://localhost:3000', // changeme before running tests
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
  env: {
    AAP_USER_ID: 'admin', // changeme before running portal tests
    AAP_USER_PASS: 'Leviosa@', // changeme before running portal tests
    AAP_URL: 'default_url', // changeme before running portal tests
    GH_USER_ID: 'testrhdh', // changeme before running rhdh tests
    GH_USER_PASS: 'changeme', // changeme before running rhdh tests
    devspacesurl: 'changeme', //changeme before running rhdh tests
    automationcontroller: 'changeme', //changeme before running rhdh tests
    ahuburl: 'changeme', //changeme before running rhdh tests
    AUTHENTICATOR_SECRET: 'changeme', //changeme before running rhdh tests
  },
});
