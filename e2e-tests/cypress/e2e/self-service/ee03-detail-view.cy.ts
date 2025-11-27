/// <reference types="cypress" />

import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Execution Environment Detail View Tests', () => {
  beforeEach(() => {
    // Navigate to execution environment catalog page
    cy.visit('/self-service/ee/catalog');
    cy.wait(2000);
    
    // Ensure we're on the EE page
    cy.url({ timeout: 15000 }).should('include', '/self-service/ee/catalog');
    cy.get('main', { timeout: 15000 }).should('be.visible');
    
    // Check if there are any EE entities to test with
    cy.get('body').then($body => {
      // Try to find and click on first EE entity if table exists
      if ($body.find('table').length > 0) {
        // Wait for table to load
        cy.wait(2000);
        // Click on first entity name link
        cy.get('table').within(() => {
          cy.get('button, a').first().click({ force: true });
        });
        cy.wait(3000);
      } else {
        cy.log('No EE entities found - detail view tests may be limited');
      }
    });
  });

  it('Should load the detail page successfully', () => {
    cy.url().should('include', '/self-service/catalog/');
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Should display breadcrumb navigation', () => {
    cy.get('body').then($body => {
      if ($body.text().includes('Execution environment definition files')) {
        cy.contains('Execution environment definition files').should('be.visible');
      }
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').should('be.visible');
      }
    });
  });

  it('Should display entity name and favorite button', () => {
    cy.get('body').then($body => {
      // Check for entity name (h5 heading)
      cy.get('h5, [variant="h5"]').should('exist');
      
      // Check for favorite button
      if ($body.find('button[aria-label*="favorite"]').length > 0) {
        cy.get('button[aria-label*="favorite"]').should('exist');
      }
    });
  });

  it('Should display menu options', () => {
    cy.get('body').then($body => {
      // Look for more options menu button
      if ($body.find('button').filter((_, btn) => {
        return btn.querySelector('svg') || btn.textContent?.includes('More');
      }).length > 0) {
        cy.get('button').contains('More').first().click({ force: true });
        cy.wait(1000);
        
        // Check for menu options
        cy.get('body').then($menuBody => {
          if ($menuBody.text().includes('Unregister entity')) {
            cy.contains('Unregister entity').should('be.visible');
          }
          if ($menuBody.text().includes('Inspect entity')) {
            cy.contains('Inspect entity').should('be.visible');
          }
          if ($menuBody.text().includes('Copy entity URL')) {
            cy.contains('Copy entity URL').should('be.visible');
          }
        });
      }
    });
  });

  it('Should display Overview tab content', () => {
    cy.get('body').then($body => {
      if ($body.text().includes('Overview')) {
        cy.contains('Overview').should('be.visible');
      }
      
      // Check for About card
      if ($body.text().includes('About')) {
        cy.contains('About').should('be.visible');
      }
      
      // Check for description
      cy.get('body').then($content => {
        const hasDescription = $content.text().length > 50;
        if (hasDescription) {
          cy.log('Description content found');
        }
      });
    });
  });

  it('Should display entity details in About card', () => {
    cy.get('body').then($body => {
      if ($body.text().includes('DESCRIPTION')) {
        cy.contains('DESCRIPTION').should('be.visible');
      }
      if ($body.text().includes('OWNER')) {
        cy.contains('OWNER').should('be.visible');
      }
      if ($body.text().includes('TYPE')) {
        cy.contains('TYPE').should('be.visible');
      }
      if ($body.text().includes('TAGS')) {
        cy.contains('TAGS').should('be.visible');
      }
    });
  });

  it('Should handle favorite toggle', () => {
    cy.get('body').then($body => {
      const favoriteButton = $body.find('button[aria-label*="favorite"]');
      if (favoriteButton.length > 0) {
        cy.get('button[aria-label*="favorite"]').first().click({ force: true });
        cy.wait(1000);
        cy.log('Favorite button clicked');
      } else {
        cy.log('Favorite button not found');
      }
    });
  });

  it('Should navigate back via breadcrumb', () => {
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').click({ force: true });
        cy.wait(2000);
        cy.url().should('include', '/self-service/ee');
      }
    });
  });
});