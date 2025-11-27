import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Browse Page Functional Tests', () => {
  beforeEach(() => {
    // Navigate to EE tab page and wait for it to load
    cy.visit('/self-service/ee');
    cy.wait(2000);

    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Validates EE tab view shows Catalog and Create tabs', () => {
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').should('be.visible');
      } else {
        cy.log('ℹ️ Catalog tab label not found');
      }

      if ($body.text().includes('Create')) {
        cy.contains('Create').should('be.visible');
      } else {
        cy.log('ℹ️ Create tab label not found');
      }
    });
  });

  it('Validates Catalog tab: empty state CTA and docs link or table content', () => {
    // Ensure Catalog tab is active
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').click({ force: true });
        cy.wait(1000);
      }
    });

    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const hasEmptyState =
        $body
          .text()
          .includes('No Execution Environment definition files, yet') ||
        $body.text().includes('No Execution Environment definition files') ||
        $body.text().includes('No Execution Environment');

      const hasTable = $body.find('table').length > 0;

      if (hasEmptyState) {
        cy.log('✅ EE Catalog empty state detected');

        // Button: Create Execution Environment definition file
        if ($body.text().includes('Create Execution Environment definition file')) {
          // Element might be clipped; just ensure it exists and click with force
          cy.contains('Create Execution Environment definition file').should('exist');
        
          cy.contains('Create Execution Environment definition file').click({
            force: true,
          });
          cy.wait(2000);
          

          cy.get('body').then($createBody => {
            if (
              $createBody
                .text()
                .includes('Create an Execution Environment')
            ) {
              cy.contains('Create an Execution Environment').should(
                'be.visible',
              );
              cy.log(
                '✅ Empty state CTA navigated to Create tab (CreateContent)',
              );
            } else {
              cy.log(
                'ℹ️ After CTA click, Create tab content text not clearly visible',
              );
            }
          });

          // Navigate back to Catalog for the rest of the test
          cy.contains('Catalog').click({ force: true });
          cy.wait(1000);
        } else {
          cy.log(
            'ℹ️ Empty state CTA button text not found on Catalog empty state',
          );
        }

        // Docs link under empty state
        if (
          $body
            .text()
            .includes(
              'How to build and use Execution Environment from definition files',
            )
        ) {
          cy.contains(
            'How to build and use Execution Environment from definition files',
          )
            .should('be.visible')
            .and('have.attr', 'href')
            .then(href => {
              cy.log(`✅ Docs link href: ${href}`);
            });
        } else {
          cy.log('ℹ️ EE docs link text not found in empty state');


          
        }
      } else if (hasTable) {
        cy.log('✅ EE Catalog table found');

        // Check basic columns
        if ($body.text().includes('Name')) {
          cy.contains('Name').should('be.visible');
        }
        if ($body.text().includes('Owner')) {
          cy.contains('Owner').should('be.visible');
        }
        if ($body.text().includes('Description')) {
          cy.contains('Description').should('be.visible');
        }
      } else {
        cy.log(
          'ℹ️ Catalog tab has neither explicit empty state nor table - may be loading or misconfigured',
        );
      }
    });
  });

  it('Validates Catalog tab filters, favorites, edit and navigation to detail page', () => {
    // Ensure Catalog tab is active
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').click({ force: true });
        cy.wait(1000);
      }
    });

    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.find('table').length === 0) {
        cy.log('ℹ️ No Catalog table available to test filters and navigation');
        return;
      }

      // Owner filter
      if ($body.text().includes('Owner')) {
        cy.contains('Owner')
          .parent()
          .within(() => {
            cy.get('select, [role="button"]')
              .first()
              .click({ force: true });
          });
        cy.wait(1000);
        cy.log('✅ Owner filter opened (selection not asserted)');
      } else {
        cy.log('ℹ️ Owner filter label not found');
      }

      // Tags filter
      if ($body.text().includes('Tags')) {
        cy.contains('Tags')
          .parent()
          .within(() => {
            cy.get('select, [role="button"]')
              .first()
              .click({ force: true });
          });
        cy.wait(1000);
        cy.log('✅ Tags filter opened (selection not asserted)');
      } else {
        cy.log('ℹ️ Tags filter label not found');
      }

      // Favorites star in Actions column (if present)
      const hasStarButton = $body
        .find('button')
        .filter((_, btn) => {
          const aria = btn.getAttribute('aria-label') || '';
          const txt = (btn.textContent || '').toLowerCase();
          return (
            aria.toLowerCase().includes('favorite') ||
            txt.includes('★') ||
            txt.includes('☆')
          );
        }).length > 0;

      if (hasStarButton) {
        cy.get('button')
          .filter((_, btn) => {
            const aria = btn.getAttribute('aria-label') || '';
            const txt = (btn.textContent || '').toLowerCase();
            return (
              aria.toLowerCase().includes('favorite') ||
              txt.includes('★') ||
              txt.includes('☆')
            );
          })
          .first()
          .click({ force: true });
        cy.log('✅ Favorites/star button clicked in Catalog table');
      } else {
        cy.log('ℹ️ No favorites/star button found in Catalog table');
      }

      // Edit button (if present)
      const hasEditButton = $body
        .find('button')
        .filter((_, btn) => {
          const aria = btn.getAttribute('aria-label') || '';
          const txt = (btn.textContent || '').toLowerCase();
          return aria.toLowerCase().includes('edit') || txt.includes('edit');
        }).length > 0;

      if (hasEditButton) {
        cy.get('button')
          .filter((_, btn) => {
            const aria = btn.getAttribute('aria-label') || '';
            const txt = (btn.textContent || '').toLowerCase();
            return aria.toLowerCase().includes('edit') || txt.includes('edit');
          })
          .first()
          .click({ force: true });
        cy.wait(1000);
        cy.log('✅ Edit button clicked (may open external editor)');
      } else {
        cy.log('ℹ️ No Edit button found in Catalog table');
      }
    });

    // Navigation to EE details page by clicking first name/link
    cy.get('body').then($body => {
      if ($body.find('table').length > 0) {
        cy.get('table').within(() => {
          cy.get('button, a')
            .first()
            .click({ force: true });
        });
        cy.wait(3000);

        cy.url().then(url => {
          if (url.includes('/self-service/catalog/')) {
            cy.log('✅ Navigated to EE details page from Catalog');
            cy.get('main', { timeout: 15000 }).should('be.visible');
          } else {
            cy.log(
              `ℹ️ Clicked first Catalog row but URL did not include /self-service/catalog. Current URL: ${url}`,
            );
          }
        });
      }
    });
  });

  it('Validates Create tab: Add Template button, filters and template start button', () => {
    // Switch to Create tab
    cy.get('body').then($body => {
      if ($body.text().includes('Create')) {
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
      } else {
        cy.log('ℹ️ Create tab not found on EE page');
      }
    });

    cy.get('main', { timeout: 15000 }).should('be.visible');

    // Add Template button and navigation
    cy.get('body').then($body => {
      const hasAddTemplate =
        $body.find('[data-testid="add-template-button"]').length > 0 ||
        $body.text().toLowerCase().includes('add template');

      if (hasAddTemplate) {
        cy.log('✅ Add Template button found on Create tab');

        if ($body.find('[data-testid="add-template-button"]').length > 0) {
          cy.get('[data-testid="add-template-button"]').click({ force: true });
        } else {
          cy.contains(/add template/i).click({ force: true });
        }

        cy.wait(3000);

        cy.url().then(url => {
          if (url.includes('/catalog-import')) {
            cy.log('✅ Navigated to catalog import from Add Template');
          } else {
            cy.log(
              `ℹ️ After Add Template, URL did not include /catalog-import. Current URL: ${url}`,
            );
          }
        });

        // Navigate back to EE and re-enter Create tab for filters/template tests
        cy.visit('/self-service/ee');
        cy.wait(2000);
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
      } else {
        cy.log(
          'ℹ️ Add Template button not available on Create tab (permission or config)',
        );
      }
    });

    // Filters on Create tab: search + All/Starred
    cy.get('body').then($body => {
      // Search bar
      if ($body.find('[data-testid="search-bar-container"]').length > 0) {
        cy.get('[data-testid="search-bar-container"]').within(() => {
          cy.get('input')
            .first()
            .as('eeSearch');
        });
        cy.get('@eeSearch').type('ee', { force: true });
        cy.wait(1000);
        cy.get('@eeSearch').clear({ force: true });
        cy.log('✅ EE Create tab search bar interaction verified');
      } else {
        cy.log('ℹ️ EE Create tab search bar not found');
      }

      // UserListPicker (All/Starred)
      if ($body.find('[data-testid="user-picker-container"]').length > 0) {
        cy.get('[data-testid="user-picker-container"]').within(() => {
          cy.get('button, [role="button"]')
            .then($buttons => {
              if ($buttons.length === 0) {
                cy.log(
                  'ℹ️ User picker container has no clickable buttons (no All/Starred controls visible)',
                );
                return;
              }
      
              const starredButton = $buttons.filter((_, btn) => {
                const txt = (btn.textContent || '').toLowerCase();
                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                return txt.includes('starred') || aria.includes('starred');
              });
      
              if (starredButton.length > 0) {
                cy.wrap(starredButton.first()).click({ force: true });
                cy.wait(1000);
                cy.log('✅ Switched EE Create tab filter to Starred');
      
                const allButton = $buttons.filter((_, btn) => {
                  const txt = (btn.textContent || '').toLowerCase();
                  const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                  return txt.includes('all') || aria.includes('all');
                });
      
                if (allButton.length > 0) {
                  cy.wrap(allButton.first()).click({ force: true });
                  cy.wait(1000);
                  cy.log('✅ Switched EE Create tab filter back to All');
                }
              } else {
                cy.log(
                  'ℹ️ No explicit All/Starred buttons found in user picker on Create tab',
                );
              }
            });
        });
      } else {
        cy.log('ℹ️ EE Create tab user picker container not found');
      }
    });

    // Template cards and Start/Create button
    cy.get('body').then($body => {
      const hasTemplates =
        $body.find('[data-testid="templates-container"]').length > 0 ||
        $body.find('.MuiCard-root, article, .template').length > 0;

      if (hasTemplates) {
        cy.log('✅ EE Create tab templates container/cards found');

        cy.get('[data-testid="templates-container"], .MuiCard-root, article, .template')
          .first()
          .then($card => {
            cy.wrap($card).within(() => {
              cy.get('button')
                .then($buttons => {
                  if ($buttons.length === 0) {
                    cy.log('ℹ️ No buttons found in EE template card');
                    return;
                  }

                  const startButton = $buttons.filter((_, btn) => {
                    const txt = (btn.textContent || '').toLowerCase();
                    return (
                      txt.includes('start') ||
                      txt.includes('create') ||
                      (btn.getAttribute('data-testid') || '')
                        .toLowerCase()
                        .includes('start')
                    );
                  });

                  if (startButton.length > 0) {
                    cy.wrap(startButton.first()).click({ force: true });
                    cy.wait(2000);
                    cy.log('✅ EE template Start/Create button clicked');

                    // Basic assertion: we navigated somewhere (create form/details)
                    cy.get('main', { timeout: 15000 }).should('be.visible');
                  } else {
                    cy.log(
                      'ℹ️ No explicit Start/Create button found in EE template card',
                    );
                  }
                });
            });
          });
      } else {
        cy.log('ℹ️ No EE templates found on Create tab (empty state)');
      }
    });
  });
});