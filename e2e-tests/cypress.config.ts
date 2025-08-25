import { baseConfig } from './cypress.base.config';
import { defineConfig } from 'cypress';

// Default configuration - uses self-service as default
export default defineConfig({
  ...baseConfig,
  e2e: {
    ...baseConfig.e2e,
    baseUrl: process.env.BASE_URL,
  },
  env: {
    // Default environment - can be overridden by specific configs
    SERVICE_TYPE: process.env.SERVICE_TYPE || 'SELF_SERVICE',
    AAP_USER_ID: process.env.AAP_USER_ID || 'admin',
    AAP_USER_PASS: process.env.AAP_USER_PASS,
    AAP_URL: process.env.AAP_URL,
    GH_USER_ID: process.env.GH_USER_ID,
    GH_USER_PASS: process.env.GH_USER_PASS,
    DEVSPACES_URL: process.env.DEVSPACES_URL,
    AUTOMATION_CONTROLLER: process.env.AUTOMATION_CONTROLLER,
    AHUB_URL: process.env.AHUB_URL,
    AUTHENTICATOR_SECRET: process.env.AUTHENTICATOR_SECRET,
  },
});
