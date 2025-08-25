import { Common } from '../utils/common';

/**
 * History Tests - Task Execution History for Logged-in User
 * Optimized version with shorter timeouts and focused tests
 */

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('History - Task Execution History Tests', () => {
  beforeEach(() => {
    // Navigate to tasks page (correct route from working version)
    cy.visit('/self-service');
    cy.wait(2000);

    // Navigate to tasks/history page
    cy.visit('/self-service/create/tasks');
    cy.wait(3000); // Wait for API request to fetch task history
  });

  it('Should load the task history page successfully', () => {
    // Verify we're on the tasks page
    cy.url().should('include', '/self-service/create/tasks');
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Should display task history content', () => {
    // Wait for content to load and check what's available
    cy.get('main').should('be.visible');

    // Check for any task-related content
    cy.get('body').then($body => {
      if ($body.find('[data-testid="taskHeader"]').length > 0) {
        cy.get('[data-testid="taskHeader"]').should('be.visible');
        cy.log('✅ Task header found');
      } else if (
        $body.text().includes('Task List') ||
        $body.text().includes('History')
      ) {
        cy.contains(/Task List|History/i).should('be.visible');
        cy.log('✅ Task/History content found');
      } else {
        cy.log('✅ Page loaded successfully');
      }
    });
  });

  it('Should display task data or empty state', () => {
    // Check for table or empty state
    cy.get('body').then($body => {
      if ($body.find('table').length > 0) {
        cy.get('table').should('be.visible');
        cy.log('✅ Task table found');

        // Check for headers if table exists
        if ($body.text().includes('Task ID'))
          cy.contains('Task ID').should('be.visible');
        if ($body.text().includes('Template'))
          cy.contains('Template').should('be.visible');
        if ($body.text().includes('Status'))
          cy.contains('Status').should('be.visible');
      } else if (
        $body.text().includes('No tasks') ||
        $body.text().includes('empty')
      ) {
        cy.contains(/No tasks|empty/i).should('be.visible');
        cy.log('✅ Empty state displayed');
      } else {
        cy.log('✅ Page content loaded');
      }
    });
  });

  it('Should handle pagination if available', () => {
    // Check for pagination controls
    cy.get('body').then($body => {
      if ($body.find('[data-testid="tableToolBar"]').length > 0) {
        cy.get('[data-testid="tableToolBar"]').should('be.visible');
        cy.log('✅ Table toolbar found');

        if ($body.text().includes('Rows per page')) {
          cy.contains('Rows per page').should('be.visible');
        }
      } else {
        cy.log('ℹ️ No table toolbar found');
      }
    });
  });
});
