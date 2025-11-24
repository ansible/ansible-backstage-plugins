/// <reference types="cypress" />

/**
 * E2E support file with optimized login performance
 * Simplified to focus on core functionality
 */

// Import existing commands for compatibility
import './commands';

// Import existing utilities to maintain compatibility
import { Common } from '../e2e/utils/common';

/**
 * Global error handling
 */
Cypress.on('uncaught:exception', (err, runnable) => {
  // Don't fail on specific known issues
  if (
    err.message.includes('ResizeObserver loop limit exceeded') ||
    err.message.includes('Script error') ||
    err.message.includes('ChunkLoadError') ||
    err.message.includes('Loading chunk') ||
    err.message.includes('Request failed with 400') ||
    err.message.includes('Request failed with 4') ||
    err.message.includes('ResponseError')
  ) {
    return false;
  }

  // Let other errors fail the test
  return true;
});

// E2E Support file loaded successfully
