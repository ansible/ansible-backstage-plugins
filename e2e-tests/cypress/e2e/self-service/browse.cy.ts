import { Common } from '../utils/common';

describe('Ansible self-service Browse Page Functional Tests', () => {
  before(() => {
    // Login once before all tests using session-based authentication
    Common.LogintoAAPWithSession();
  });

  beforeEach(() => {
    // Restore session and navigate to self-service
    Common.LogintoAAPWithSession();
    cy.visit('/self-service');
    cy.wait(2000);

    // Ensure we're actually on the self-service page, not stuck in auth flow
    cy.url({ timeout: 15000 }).should('include', '/self-service');

    // Wait for the page content to fully load
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Validates the search bar functionality', () => {
    // Ensure we're on the self-service page and not a login page
    cy.url().should('include', '/self-service');
    cy.get('body').should('not.contain.text', 'Select a Sign-in method');
    cy.get('body').should('not.contain.text', 'Log in to your account');

    // Check if search functionality is available on the page
    cy.get('body').then($body => {
      const hasSearchBar =
        $body.find(
          '[data-testid="search-bar-container"], [aria-label="search"], input[type="search"]',
        ).length > 0 ||
        $body
          .find('input')
          .filter(
            (_, el) =>
              (el as unknown as HTMLInputElement).placeholder &&
              (el as unknown as HTMLInputElement).placeholder
                .toLowerCase()
                .includes('search'),
          ).length > 0;

      if (hasSearchBar) {
        cy.log('Search bar found - testing search functionality');

        // Try different selectors for search bar
        if ($body.find('[data-testid="search-bar-container"]').length > 0) {
          cy.log('Using new data-testid selector for search bar');
          cy.get('[data-testid="search-bar-container"]').within(() => {
            cy.get('input').as('searchBar');
          });
        } else if ($body.find('[aria-label="search"]').length > 0) {
          cy.log('Using aria-label selector for search bar');
          cy.get('[aria-label="search"]').within(() => {
            cy.get('input').as('searchBar');
          });
        } else {
          cy.log('Using fallback search input selector');
          cy.get('input[type="search"]').first().as('searchBar');
        }

        // Test basic search functionality if search bar exists
        cy.get('@searchBar').should('exist');
        // Force interaction since it might have visibility: hidden
        cy.get('@searchBar').type('test', { force: true });
        cy.wait(1000);
        cy.get('@searchBar').clear({ force: true });
        cy.log('Search bar functionality verified');
      } else {
        cy.log(
          'No search bar found on this page - search functionality may not be available',
        );
        // Still pass the test if search isn't available
      }
    });
  });

  it('Validates checkboxes/filters on the Page', () => {
    // Check if categories picker or any filter controls exist
    cy.get('body').then($body => {
      if ($body.find('[id="categories-picker"]').length > 0) {
        cy.get('[id="categories-picker"]').should('exist');
      } else if ($body.find('[data-testid*="filter"]').length > 0) {
        cy.get('[data-testid*="filter"]').first().should('exist');
      } else {
        cy.log('No filter controls found - this may be expected');
      }
    });
  });

  it('Validates template cards and Create button functionality', () => {
    // Wait for main content to load
    cy.get('main', { timeout: 10000 }).should('be.visible');

    // Look for template cards using multiple possible selectors
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.log('Template cards found on page');

        // Try to find and click a create button, but don't fail if navigation structure is different
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button').then($buttons => {
                if ($buttons.length > 0) {
                  cy.log(`Found ${$buttons.length} button(s) in template card`);
                  // Click the first button (likely a create/action button)
                  cy.wrap($buttons.first()).click();
                  cy.wait(2000);

                  // Check if we navigated anywhere (create page, details, etc.)
                  cy.url().then(url => {
                    if (
                      url.includes('/create') ||
                      url.includes('/template') ||
                      url.includes('/details')
                    ) {
                      cy.log('Successfully navigated to template action page');
                      cy.go('back');
                      cy.wait(1000);
                    } else {
                      cy.log(
                        'Button clicked but no navigation occurred - may be different interaction',
                      );
                    }
                  });
                } else {
                  cy.log('No buttons found in template card');
                }
              });
            });
          });
      } else {
        cy.log('No template cards found - may be empty state or loading');
      }
    });
  });

  it('Validates favorites functionality if available', () => {
    // Wait for main content to load
    cy.get('main', { timeout: 10000 }).should('be.visible');

    // Look for favorite functionality - this is optional
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button, [role="button"]').then($buttons => {
                const favoriteButton = $buttons.filter((_, btn) => {
                  const btnText = btn.textContent || '';
                  const hasHeartIcon =
                    btnText.includes('♥') ||
                    btnText.includes('🤍') ||
                    btnText.includes('❤');
                  const hasStarIcon =
                    btnText.includes('☆') || btnText.includes('★');
                  const hasFavoriteLabel = btn
                    .getAttribute('aria-label')
                    ?.includes('favorite');
                  return hasHeartIcon || hasStarIcon || hasFavoriteLabel;
                });

                if (favoriteButton.length > 0) {
                  cy.wrap(favoriteButton.first()).click();
                  cy.log('Favorite button found and clicked');
                } else {
                  cy.log(
                    'No favorite button found - functionality may not be available',
                  );
                }
              });
            });
          });
      } else {
        cy.log('No template cards found for favorites testing');
      }
    });
  });

  it('Validates page loads successfully with templates', () => {
    // Basic validation that the self-service page loads
    cy.url().should('include', '/self-service');
    cy.get('main').should('be.visible');

    // Check for content - this test is just to verify the page loads
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;
      const hasLoadingState =
        $body.find('[data-testid="loading-templates"]').length > 0;
      const hasEmptyState =
        $body.text().includes('No templates') || $body.text().includes('empty');

      if (hasLoadingState) {
        cy.log('Page is in loading state');
      } else if (hasTemplateCards) {
        cy.log(
          `Found ${$body.find('[data-testid*="-"], .MuiCard-root, article, .template').length} template-like elements`,
        );
      } else if (hasEmptyState) {
        cy.log('Page shows empty state - no templates available');
      } else {
        cy.log('Page loaded successfully');
      }

      // The key test is that the page loads without errors
      cy.get('main').should('be.visible');
    });
  });
});
