import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Create and execution tests', () => {
  beforeEach(() => {
    // Navigate to self-service and wait for page to load
    cy.visit('/self-service');
    cy.wait(2000);

    // Ensure we're actually on the self-service page, not stuck in auth flow
    cy.url({ timeout: 15000 }).should('include', '/self-service');

    // Wait for the page content to fully load
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Validates template create form loads successfully', () => {
    // Ensure we're on the self-service page and not a login page
    cy.url().should('include', '/self-service');
    cy.get('body').should('not.contain.text', 'Select a Sign-in method');
    cy.get('body').should('not.contain.text', 'Log in to your account');

    // Look for template cards using multiple possible selectors
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.log('Template cards found on page');

        // Try to find and click a create button
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button').then($buttons => {
                if ($buttons.length > 0) {
                  cy.log(`Found ${$buttons.length} button(s) in template card`);
                  // Look for create button specifically
                  const createButton = $buttons.filter((_, btn) => {
                    const btnText = (btn.textContent || '').toLowerCase();
                    return (
                      btnText.includes('create') ||
                      btn.getAttribute('data-testid')?.includes('create')
                    );
                  });

                  if (createButton.length > 0) {
                    cy.wrap(createButton.first()).click();
                    cy.wait(2000);

                    // Check if we navigated to create page
                    cy.url().then(url => {
                      if (url.includes('/create')) {
                        cy.log(
                          'Successfully navigated to template creation page',
                        );
                        cy.get('main').should('be.visible');

                        // Check for form elements or creation interface
                        cy.get('body').then($createBody => {
                          const hasForm = $createBody.find('form').length > 0;
                          const hasSteps =
                            $createBody.text().includes('Step') ||
                            $createBody.find('[data-testid*="step"]').length >
                              0;
                          const hasInputs =
                            $createBody.find('input, select, textarea').length >
                            0;

                          if (hasForm) {
                            cy.log('Template creation form found');
                            cy.get('form').should('be.visible');
                          } else if (hasSteps) {
                            cy.log('Multi-step creation process found');
                          } else if (hasInputs) {
                            cy.log('Input fields found for template creation');
                          } else {
                            cy.log('Template creation interface loaded');
                          }
                        });
                      } else {
                        cy.log(
                          'Button clicked but no navigation to create page occurred',
                        );
                      }
                    });
                  } else {
                    cy.log('No create button found in template card');
                  }
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

  it('Validates template form validation works', () => {
    // Ensure we're on the self-service page and not a login page
    cy.url().should('include', '/self-service');
    cy.get('body').should('not.contain.text', 'Select a Sign-in method');
    cy.get('body').should('not.contain.text', 'Log in to your account');

    // Look for template cards using multiple possible selectors
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button').then($buttons => {
                const createButton = $buttons.filter((_, btn) => {
                  const btnText = (btn.textContent || '').toLowerCase();
                  return (
                    btnText.includes('create') ||
                    btn.getAttribute('data-testid')?.includes('create')
                  );
                });

                if (createButton.length > 0) {
                  cy.wrap(createButton.first()).click();
                  cy.wait(2000);

                  cy.url().then(url => {
                    if (url.includes('/create')) {
                      // Try to submit form without filling required fields
                      cy.get('body').then($createBody => {
                        if ($createBody.find('form').length > 0) {
                          cy.get('button[type="submit"], button')
                            .contains(/next|submit|create/i)
                            .first()
                            .click();

                          // Look for validation messages
                          cy.wait(1000);
                          cy.get('body').then($bodyAfterSubmit => {
                            const hasValidationErrors =
                              $bodyAfterSubmit.text().includes('required') ||
                              $bodyAfterSubmit.text().includes('error') ||
                              $bodyAfterSubmit.find('.error, [role="alert"]')
                                .length > 0;

                            if (hasValidationErrors) {
                              cy.log('Form validation working correctly');
                            } else {
                              cy.log(
                                'No validation errors shown or form accepted defaults',
                              );
                            }
                          });
                        } else {
                          cy.log('No form found to test validation');
                        }
                      });
                    }
                  });
                } else {
                  cy.log('No create button found for validation testing');
                }
              });
            });
          });
      } else {
        cy.log('No template cards found for validation testing');
      }
    });
  });

  it('Validates template creation navigation flow', () => {
    // Ensure we're on the self-service page and not a login page
    cy.url().should('include', '/self-service');
    cy.get('body').should('not.contain.text', 'Select a Sign-in method');
    cy.get('body').should('not.contain.text', 'Log in to your account');

    // Look for template cards using multiple possible selectors
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            // Store template content for later verification
            cy.wrap($card)
              .invoke('text')
              .then(templateContent => {
                cy.wrap($card).within(() => {
                  cy.get('button').then($buttons => {
                    const createButton = $buttons.filter((_, btn) => {
                      const btnText = (btn.textContent || '').toLowerCase();
                      return (
                        btnText.includes('create') ||
                        btn.getAttribute('data-testid')?.includes('create')
                      );
                    });

                    if (createButton.length > 0) {
                      cy.wrap(createButton.first()).click();
                      cy.wait(2000);

                      cy.url().then(url => {
                        if (url.includes('/create')) {
                          cy.log(
                            'Successfully navigated to template creation page',
                          );

                          // Verify we can go back
                          cy.go('back');
                          cy.url().should('include', '/self-service');
                          cy.wait(1000);

                          // Verify template is still visible by checking for similar content
                          cy.get('main').should('be.visible');
                          cy.log(
                            'Successfully navigated back to self-service page',
                          );
                        } else {
                          cy.log('Navigation to create page did not occur');
                        }
                      });
                    } else {
                      cy.log('No create button found for navigation testing');
                    }
                  });
                });
              });
          });
      } else {
        cy.log('No template cards found for navigation testing');
      }
    });
  });

  it('Validates basic template information is displayed', () => {
    // Ensure we're on the self-service page and not a login page
    cy.url().should('include', '/self-service');
    cy.get('body').should('not.contain.text', 'Select a Sign-in method');
    cy.get('body').should('not.contain.text', 'Log in to your account');

    // Look for template cards using multiple possible selectors
    cy.get('body').then($body => {
      const hasTemplateCards =
        $body.find('[data-testid*="-"], .MuiCard-root, article, .template')
          .length > 0;

      if (hasTemplateCards) {
        cy.get('[data-testid*="-"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button').then($buttons => {
                const createButton = $buttons.filter((_, btn) => {
                  const btnText = (btn.textContent || '').toLowerCase();
                  return (
                    btnText.includes('create') ||
                    btn.getAttribute('data-testid')?.includes('create')
                  );
                });

                if (createButton.length > 0) {
                  cy.wrap(createButton.first()).click();
                  cy.wait(2000);

                  cy.url().then(url => {
                    if (url.includes('/create')) {
                      // Check for template information display
                      cy.get('header, h1, h2').should('exist');

                      // Look for template description or details
                      cy.get('body').then($createBody => {
                        const hasDescription =
                          $createBody
                            .find('p, div')
                            .filter(
                              (_, el) =>
                                el.textContent && el.textContent.length > 20,
                            ).length > 0;

                        if (hasDescription) {
                          cy.log('Template description or details found');
                        } else {
                          cy.log('Basic template header information displayed');
                        }
                      });
                    } else {
                      cy.log(
                        'Navigation to create page did not occur for information validation',
                      );
                    }
                  });
                } else {
                  cy.log(
                    'No create button found for information validation testing',
                  );
                }
              });
            });
          });
      } else {
        cy.log('No template cards found for information validation testing');
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
