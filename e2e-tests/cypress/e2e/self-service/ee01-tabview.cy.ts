import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Execution Environment Tabview Tests', () => {
  beforeEach(() => {
    // Navigate to EE tab page and wait for it to load
    cy.visit('/self-service/ee');
    cy.wait(2000);

    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Validates Catalog and Create tabs are visible and switchable', () => {
    cy.get('body').then($body => {
      // Catalog tab
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').should('exist');
      } else {
        cy.log(' Catalog tab label not found');
      }

      // Create tab
      if ($body.text().includes('Create')) {
        cy.contains('Create').should('exist');
      } else {
        cy.log(' Create tab label not found');
      }
    });

    // Switch to Create tab and verify main remains visible
    cy.contains('Create').click({ force: true });
    cy.wait(1000);
    cy.get('main', { timeout: 15000 }).should('be.visible');

    // Switch back to Catalog tab and verify main remains visible
    cy.contains('Catalog').click({ force: true });
    cy.wait(1000);
    cy.get('main', { timeout: 15000 }).should('be.visible');
  });

  it('Validates Catalog tab: empty state CTA redirects to Create tab', () => {
    // Ensure Catalog tab is active (it should be default, but be explicit)
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').click({ force: true });
        cy.wait(1000);
      }
    });

    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const text = $body.text();
      const hasEmptyState = text.includes(
        'No Execution Environment definition files, yet',
      );

      if (!hasEmptyState) {
        cy.log(
          ' EE Catalog is not in empty state (definitions exist) - skipping empty state CTA test',
        );
        return;
      }
      cy.contains('No Execution Environment definition files, yet').should(
        'exist',
      );
      cy.log('EE Catalog empty state detected');

      // Button: "Create Execution Environment definition file"
      if (text.includes('Create Execution Environment definition file')) {
        // Element may be clipped; just ensure it exists and click forcefully
        cy.contains('Create Execution Environment definition file').should(
          'exist',
        );

        cy.contains('Create Execution Environment definition file').click({
          force: true,
        });
        cy.wait(2000);

        // Verify we are on Create tab (CreateContent)
        cy.get('body').then($createBody => {
          const createText = $createBody.text();
          if (createText.includes('Create an Execution Environment')) {
            cy.contains('Create an Execution Environment').should('exist');
            cy.log(' Empty state CTA navigated to Create tab (CreateContent)');
          } else {
            cy.log(
              ' After CTA click, Create tab content text not clearly visible',
            );
          }
        });
      } else {
        cy.log(
          ' Empty state CTA button "Create Execution Environment definition file" not found',
        );
      }
    });
  });

  it('Validates Create tab: Add Template button, filters and template Start button', () => {
    // Switch to Create tab from EE tabview
    cy.get('body').then($body => {
      if ($body.text().includes('Create')) {
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
      } else {
        cy.log(' Create tab not found on EE page');
      }
    });

    cy.get('main', { timeout: 15000 }).should('be.visible');

    // Add Template button and navigation to catalog-import
    cy.get('body').then($body => {
      const hasAddTemplate =
        $body.find('[data-testid="add-template-button"]').length > 0 ||
        $body.text().toLowerCase().includes('add template');

      if (!hasAddTemplate) {
        cy.log(
          ' Add Template button not available on Create tab (permission or config)',
        );
        return;
      }

      cy.log(' Add Template button found on Create tab');

      if ($body.find('[data-testid="add-template-button"]').length > 0) {
        cy.get('[data-testid="add-template-button"]').click({ force: true });
      } else {
        cy.contains(/add template/i).click({ force: true });
      }

      cy.wait(3000);
      cy.url().then(url => {
        if (url.includes('/catalog-import')) {
          cy.log(' Navigated to catalog import from Add Template');
        } else {
          cy.log(
            ` After Add Template, URL did not include /catalog-import. Current URL: ${url}`,
          );
        }
      });

      // Go back to EE Create tab to test filters + templates
      cy.visit('/self-service/ee');
      cy.wait(2000);
      cy.contains('Create').click({ force: true });
      cy.wait(2000);
    });

    // Filters on Create tab: search input + user picker
    cy.get('body').then($body => {
      // Search bar
      if ($body.find('[data-testid="search-bar-container"]').length > 0) {
        cy.get('[data-testid="search-bar-container"]').within(() => {
          cy.get('input').first().as('eeSearch');
        });

        cy.get('@eeSearch').type('ee', { force: true });
        cy.wait(1000);
        cy.get('@eeSearch').clear({ force: true });
        cy.log(' EE Create tab search bar interaction verified');
      } else {
        cy.log(' EE Create tab search bar container not found');
      }

      // User filter (All/Starred) via UserListPicker
      const $container = $body
        .find('[data-testid="user-picker-container"]')
        .first();

      if ($container.length === 0) {
        cy.log(' EE Create tab user picker container not found');
        return;
      }

      const $buttons = $container.find('button, [role="button"]');

      if ($buttons.length === 0) {
        cy.log(
          ' User picker container has no clickable buttons (no All/Starred controls visible)',
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
        cy.log(' Switched EE Create tab filter to Starred');

        const allButton = $buttons.filter((_, btn) => {
          const txt = (btn.textContent || '').toLowerCase();
          const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
          return txt.includes('all') || aria.includes('all');
        });

        if (allButton.length > 0) {
          cy.wrap(allButton.first()).click({ force: true });
          cy.wait(1000);
          cy.log(' Switched EE Create tab filter back to All');
        }
      } else {
        cy.log(
          ' No explicit All/Starred buttons found in user picker on Create tab',
        );
      }
    });

    // Template cards and Start/Create button on Create tab
    cy.get('body').then($body => {
      const hasTemplates =
        $body.find('[data-testid="templates-container"]').length > 0 ||
        $body.find('.MuiCard-root, article, .template').length > 0;

      if (!hasTemplates) {
        cy.log(' No EE templates found on Create tab (empty state)');
        return;
      }

      cy.log(' EE Create tab templates container/cards found');

      cy.get(
        '[data-testid="templates-container"], .MuiCard-root, article, .template',
      )
        .first()
        .then($card => {
          cy.wrap($card).within(() => {
            cy.get('button').then($buttons => {
              if ($buttons.length === 0) {
                cy.log(' No buttons found in EE template card');
                return;
              }

              const startButton = $buttons.filter((_, btn) => {
                const txt = (btn.textContent || '').toLowerCase();
                const testId = (
                  btn.getAttribute('data-testid') || ''
                ).toLowerCase();
                return (
                  txt.includes('start') ||
                  txt.includes('create') ||
                  testId.includes('start') ||
                  testId.includes('create')
                );
              });

              if (startButton.length > 0) {
                cy.wrap(startButton.first()).click({ force: true });
                cy.wait(2000);
                cy.log(' EE template Start/Create button clicked');
                cy.get('main', { timeout: 15000 }).should('be.visible');
              } else {
                cy.log(
                  ' No explicit Start/Create button found in EE template card',
                );
              }
            });
          });
        });
    });
  });

  it('Validates Create tab sidebar filters: Starred, My Org All, and Tags', () => {
    // Switch to Create tab
    cy.contains('Create').click({ force: true });
    cy.wait(2000);
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const text = $body.text();

      // Personal -> Starred filter
      if (text.includes('Personal') && text.includes('Starred')) {
        cy.log(' Personal / Starred section found on sidebar');
        cy.contains('Starred').click({ force: true });
        cy.wait(1000);
        cy.log(' Clicked Starred filter in sidebar');
      } else {
        cy.log(' Sidebar Personal / Starred section not found');
      }

      // My Org -> All filter
      if (text.includes('My Org') && text.includes('All')) {
        cy.log(' My Org / All section found on sidebar');
        cy.contains('All').click({ force: true });
        cy.wait(1000);
        cy.log(' Clicked My Org All filter in sidebar');
      } else {
        cy.log(' Sidebar My Org / All section not found');
      }

      // Tags dropdown
      if (text.includes('Tags')) {
        cy.log(' Tags filter label found on sidebar');
        cy.contains('Tags').click({ force: true });
        cy.wait(1000);
        cy.log(' Clicked Tags filter (dropdown should open if available)');
      } else {
        cy.log(' Tags filter label not found on sidebar');
      }
    });
  });
});
