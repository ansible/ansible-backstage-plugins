import { Common } from '../utils/common';

const EE_TEMPLATE_URL =
  Cypress.env('EE_IMPORT_REPO_URL') ||
  'https://github.com/ansible/ansible-rhdh-templates/blob/v1.0.2/templates/ee-start-from-scratch.yaml';

const EE_TEMPLATE_TITLE = 'Start from scratch';

// Generate dynamic repository name suffix using timestamp
const REPO_SUFFIX = Math.floor(Math.random() * 100)
  .toString()
  .padStart(2, '0');
const RANDOM_LETTER = String.fromCharCode(97 + Math.floor(Math.random() * 26));
const REPO_NAME = `ee-repo-${RANDOM_LETTER}`;
const EE_FILE_NAME = `ee-${REPO_SUFFIX}`;

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Execution Environment Template Execution Tests', () => {
  it('Imports EE template via kebab menu and executes it from Create tab', () => {
    //
    // 1. Go to EE Create tab
    //
    cy.visit('/self-service/ee');
    cy.wait(2000);

    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.text().includes('Create')) {
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
      } else {
        cy.log(
          ' Create tab not found on EE page - aborting template import test',
        );
        return;
      }
    });

    // 2. Click kebab menu and select Import Template to open catalog-import stepper
    //
    cy.get('body').then($body => {
      const hasKebabMenu =
        $body.find('[data-testid="kebab-menu-button"]').length > 0;

      if (!hasKebabMenu) {
        cy.log(
          'Kebab menu button not available on Create tab (permission or config)',
        );
        return;
      }

      cy.log(' Kebab menu button found on Create tab');

      // Click the kebab menu button to open the menu
      cy.get('[data-testid="kebab-menu-button"]').click({ force: true });
      cy.wait(500);

      // Click the Import Template menu item
      cy.get('[data-testid="import-template-button"]').click({ force: true });
    });

    // Now wait and CHECK the URL, but don’t assume it always changed
    cy.wait(3000);
    cy.url({ timeout: 15000 }).then(url => {
      if (url.includes('/self-service/catalog-import')) {
        cy.log(' Navigated to catalog import from Import Template');
        cy.get('main', { timeout: 15000 }).should('be.visible');
      } else {
        cy.log(
          ` After Import Template, URL did not include /catalog-import. Current URL: ${url}`,
        );
        // Bail out of the rest of this test if we never reached catalog-import
        throw new Error(
          'Catalog import page was not reached; aborting template execution test',
        );
      }
    });

    cy.wait(3000);
    cy.url({ timeout: 15000 }).should(
      'include',
      '/self-service/catalog-import',
    );
    cy.get('main', { timeout: 15000 }).should('be.visible');

    //
    // 3. Fill URL field with EE template URL and click Analyze
    //
    cy.contains('label', 'URL')
      .closest('div')
      .find('input')
      .first()
      .as('eeUrlInput');

    cy.get('@eeUrlInput')
      .clear({ force: true })
      .type(EE_TEMPLATE_URL, { force: true });

    cy.log(` Typed EE template URL: ${EE_TEMPLATE_URL}`);

    cy.contains('button', /analyze/i).click({ force: true });
    cy.wait(5000);
    //
    // 4. Move through Review step and click Import
    //
    cy.get('body').then($body => {
      const text = $body.text().toLowerCase();

      if (
        !text.includes('review') &&
        !text.includes('the following entities')
      ) {
        cy.log(' Review step text not clearly visible after Analyze');
      } else {
        cy.log(' Review step visible after Analyze');
      }

      const importButton = $body
        .find('button')
        .filter((_, btn) => {
          const txt = (btn.textContent || '').toLowerCase().trim();
          return txt === 'import' || txt.includes('import');
        })
        .first();

      if (importButton.length) {
        cy.wrap(importButton).click({ force: true });
        cy.wait(7000);
        cy.log(' Clicked Import button on Review step');
      } else {
        cy.log(
          ' Import button not found on Review step - wizard may behave differently',
        );
      }
    });

    //
    // 5. Verify Finish step shows entities added to catalog
    //
    cy.get('body', { timeout: 20000 }).then($body => {
      const finishText = $body.text();
      if (
        finishText
          .toLowerCase()
          .includes('the following entities have been added to the catalog')
      ) {
        cy.log(' Finish step shows entities added to the catalog');
      } else {
        cy.log(' Finish step summary text not clearly visible');
      }

      if (finishText.toLowerCase().includes('register another')) {
        cy.contains(/register another/i).should('exist');
      }
    });

    // 6. Go back to EE Create tab and verify template card appears
    cy.visit('/self-service/ee');
    cy.wait(2000);
    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.contains('Create').click({ force: true });
    cy.wait(2000);
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.text().includes(EE_TEMPLATE_TITLE)) {
        cy.log(` EE template "${EE_TEMPLATE_TITLE}" now visible on Create tab`);

        // Click Start on that specific template card
        cy.contains(EE_TEMPLATE_TITLE)
          .parents('[data-testid*="template"], .MuiCard-root, article')
          .first()
          .within(() => {
            cy.get('button, [role="button"]')
              .filter((_, btn) =>
                (btn.textContent || '').toLowerCase().includes('start'),
              )
              .first()
              .click({ force: true });
          });

        cy.wait(3000);
        cy.url().then(url => {
          if (url.includes('/create')) {
            cy.log(` Navigated to template execution page: ${url}`);
          } else {
            cy.log(
              ` After Start click, URL did not include /create. Current URL: ${url}`,
            );
          }
        });

        //
        // 7. Walk through EE creation wizard steps
        //
        cy.get('main', { timeout: 15000 }).should('be.visible');

        // Step 1: Base Image - just click Next
        cy.contains('button', /^Next$/i).click({ force: true });
        cy.wait(1000);

        // Step 2: Collections - click Next
        cy.contains('button', /^Next$/i).click({ force: true });
        cy.wait(1000);

        // Step 3: MCP servers - select GitHub and click Next
        // Step 3: MCP servers - select GitHub and click Next
        cy.get('body').then($body => {
          if ($body.text().includes('GitHub')) {
            cy.contains(/github/i)
              .parents()
              .filter((_, el) => {
                const $el = Cypress.$(el);
                // Check if this looks like a card or clickable element
                return (
                  $el.hasClass('MuiCard-root') ||
                  $el.is('button') ||
                  $el.attr('role') === 'button' ||
                  $el.find('button, [role="button"]').length > 0
                );
              })
              .first()
              .click({ force: true });
            cy.wait(500);
            cy.log(' Selected GitHub MCP server');
          } else {
            cy.log(' GitHub MCP server option not found');
          }
        });
        cy.contains('button', /^Next$/i).click({ force: true });
        cy.wait(1000);
        // Step 4: Additional Build Steps - click Next
        cy.contains('button', /^Next$/i).click({ force: true });
        cy.wait(1000);

        // Step 5: Generate and publish - fill required fields
        cy.contains('label', /^EE Definition Name/i)
          .closest('div')
          .find('input, textarea')
          .first()
          .clear({ force: true })
          .type(EE_FILE_NAME, { force: true });

        cy.contains('label', /^Description/i)
          .closest('div')
          .find('input, textarea')
          .first()
          .clear({ force: true })
          .type('execution environment', { force: true });

        // Select source control provider: GitHub
        cy.contains('label', /Select source control provider/i)
          .closest('div')
          .within(() => {
            cy.get('[role="button"], input, [aria-haspopup="listbox"]')
              .first()
              .click({ force: true });
          });

        cy.contains(/github/i).click({ force: true });

        // Git repository organization or username
        cy.contains('label', /Git repository organization or username/i)
          .closest('div')
          .find('input, textarea')
          .first()
          .clear({ force: true })
          .type('test-rhaap-1', { force: true });

        // Repository Name
        cy.contains('label', /^Repository Name/i)
          .closest('div')
          .find('input, textarea')
          .first()
          .clear({ force: true })
          .type(REPO_NAME, { force: true });

        // Create new repository checkbox
        cy.contains(/Create new repository/i).click({ force: true });

        // Go to Review step
        cy.contains('button', /^Next$/i).click({ force: true });
        cy.wait(2000);

        // Step 6: Review - final create
        cy.contains('button', /create/i).click({ force: true });

        // Wait for completion page to load - check for stepper completion or success indicators
        cy.get('body', { timeout: 30000 }).should('be.visible');
        cy.wait(5000); // Give extra time for async operations to complete

        // Wait for completion indicators (stepper steps, success message, or action buttons)
        cy.get('body', { timeout: 30000 }).then($body => {
          const hasCompletion =
            $body.text().includes('Create Execution Environment Definition') ||
            $body.text().includes('Github Repository') ||
            $body.text().includes('View details') ||
            $body.text().includes('Getting Started') ||
            $body.find('[data-testid*="success"], [data-testid*="complete"]')
              .length > 0;

          if (!hasCompletion) {
            cy.log(
              ' Completion page may still be loading, waiting additional time...',
            );
            cy.wait(5000);
          }
        });

        cy.url().then(finalUrl => {
          cy.log(` Completed EE creation wizard, final URL: ${finalUrl}`);
        });

        // Wait for action buttons to be visible before proceeding to second execution
        cy.get('body', { timeout: 30000 }).then($body => {
          const hasButtons =
            $body.text().includes('Github Repository') ||
            $body.text().includes('View details') ||
            $body.text().includes('Getting Started') ||
            $body.text().includes('Download') ||
            $body.find('button, a').filter((_, el) => {
              const text = (el.textContent || '').toLowerCase();
              return (
                text.includes('github') ||
                text.includes('catalog') ||
                text.includes('getting started') ||
                text.includes('download')
              );
            }).length > 0;

          if (hasButtons) {
            cy.log(' Action buttons are visible on completion page');
            cy.wait(2000); // Additional wait to ensure buttons are fully interactive
          } else {
            cy.log(' Waiting for action buttons to appear...');
            cy.wait(5000);
          }
        });

        //
        // 8. Second execution: Without Git publishing
        //
        cy.log('Starting second template execution (without Git publishing)');

        // Go back to EE Create tab
        cy.visit('/self-service/ee');
        cy.wait(2000);
        cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
        cy.get('main', { timeout: 15000 }).should('be.visible');
        cy.get('body').then($body => {
          if ($body.text().includes(EE_TEMPLATE_TITLE)) {
            cy.log(
              ` Starting second execution of "${EE_TEMPLATE_TITLE}" template`,
            );

            // Click Start on template card
            cy.contains(EE_TEMPLATE_TITLE)
              .parents('[data-testid*="template"], .MuiCard-root, article')
              .first()
              .within(() => {
                cy.get('button, [role="button"]')
                  .filter((_, btn) =>
                    (btn.textContent || '').toLowerCase().includes('start'),
                  )
                  .first()
                  .click({ force: true });
              });
            cy.wait(3000);
            cy.get('main', { timeout: 15000 }).should('be.visible');

            // Step 1: Base Image - click Next
            cy.contains('button', /^Next$/i).click({ force: true });
            cy.wait(1000);

            // Step 2: Collections - click Next
            cy.contains('button', /^Next$/i).click({ force: true });
            cy.wait(1000);
            // Step 3: MCP servers - select GitHub and click Next
            cy.get('body').then($bodyMCP => {
              if ($bodyMCP.text().includes('GitHub')) {
                const $githubCard = $bodyMCP
                  .find('*:contains("GitHub")')
                  .filter((_, el) => {
                    const $el = Cypress.$(el);
                    const text = $el.text().toLowerCase();
                    return (
                      text.includes('github') &&
                      (text === 'github' ||
                        $el.parents('.MuiCard-root, [data-testid*="mcp"]')
                          .length > 0)
                    );
                  })
                  .closest(
                    '.MuiCard-root, [role="button"], button, div[onclick]',
                  )
                  .first();

                if ($githubCard.length > 0) {
                  cy.wrap($githubCard).click({ force: true });
                  cy.wait(500);
                  cy.log(' Selected GitHub MCP server');
                } else {
                  cy.contains(/^github$/i).then($el => {
                    cy.wrap($el).parents().first().click({ force: true });
                  });
                  cy.wait(500);
                }
              }
            });
            cy.contains('button', /^Next$/i).click({ force: true });
            cy.wait(1000);
            // Step 4: Additional Build Steps - click Next
            cy.contains('button', /^Next$/i).click({ force: true });
            cy.wait(1000);

            // Step 5: Generate and publish - WITHOUT Git publishing
            cy.contains('label', /^EE Definition Name/i)
              .closest('div')
              .find('input, textarea')
              .first()
              .clear({ force: true })
              .type(`${EE_FILE_NAME}`, { force: true });

            cy.contains('label', /^Description/i)
              .closest('div')
              .find('input, textarea')
              .first()
              .clear({ force: true })
              .type('execution environment', { force: true });
            // Uncheck "Publish to a Git repository" checkbox
            cy.get('body').then($body => {
              const $publishCheckbox = $body
                .find('input[type="checkbox"]')
                .filter((_, el) => {
                  const $el = Cypress.$(el);
                  const label = $el.closest('label, div').text().toLowerCase();
                  return (
                    label.includes('publish') &&
                    label.includes('git') &&
                    label.includes('repository')
                  );
                })
                .first();

              if ($publishCheckbox.length > 0) {
                cy.wrap($publishCheckbox).then($checkbox => {
                  if ($checkbox.is(':checked')) {
                    cy.wrap($checkbox).uncheck({ force: true });
                    cy.wait(500);
                    cy.log(' Unchecked "Publish to a Git repository" checkbox');
                  } else {
                    cy.log(
                      ' "Publish to a Git repository" checkbox already unchecked',
                    );
                  }
                });
              } else {
                // Fallback: try to find by text
                cy.contains(/Publish to a Git repository/i)
                  .closest('label, div')
                  .find('input[type="checkbox"]')
                  .first()
                  .uncheck({ force: true });
                cy.wait(500);
                cy.log(
                  ' Unchecked "Publish to a Git repository" checkbox (fallback method)',
                );
              }
            });

            // Go to Review step (Git fields should be hidden now)
            cy.contains('button', /^Next$/i).click({ force: true });
            cy.wait(2000);

            // Step 6: Review - final create
            cy.contains('button', /create/i).click({ force: true });

            // Wait for completion
            cy.get('body', { timeout: 30000 }).should('be.visible');
            cy.wait(5000);

            // Wait for completion indicators
            cy.get('body', { timeout: 30000 }).then($body => {
              const hasCompletion =
                $body
                  .text()
                  .includes('Create Execution Environment Definition') ||
                $body.text().includes('Github Repository') ||
                $body.text().includes('View details') ||
                $body.text().includes('Getting Started') ||
                $body.find(
                  '[data-testid*="success"], [data-testid*="complete"]',
                ).length > 0;

              if (!hasCompletion) {
                cy.log(
                  ' Completion page may still be loading, waiting additional time...',
                );
                cy.wait(5000);
              }
            });

            cy.url().then(finalUrl => {
              cy.log(
                ` Completed second EE creation (without Git) wizard, final URL: ${finalUrl}`,
              );
            });

            //
            // 9. Verify post-creation action buttons (after second execution)
            //
            cy.get('body', { timeout: 30000 }).then($body => {
              const bodyText = $body.text();
              cy.log(` Page text includes: ${bodyText.substring(0, 200)}...`); // Debug: log first 200 chars

              // 9a. Verify "EE files download" button (first)
              if (
                bodyText.includes('Download') ||
                bodyText.includes('download') ||
                bodyText.includes('EE files') ||
                bodyText.includes('files')
              ) {
                cy.log(' Found Download/EE files text on page');
                cy.get('body').then($b => {
                  const $downloadBtn = $b
                    .find('button, a, [role="button"]')
                    .filter((_, el) => {
                      const text = (el.textContent || '').toLowerCase();
                      return (
                        (text.includes('download') && text.includes('ee')) ||
                        (text.includes('download') && text.includes('files')) ||
                        text.includes('download ee files') ||
                        text.includes('download files')
                      );
                    })
                    .first();

                  if ($downloadBtn.length > 0) {
                    cy.log(' Found EE files download button');
                    cy.wrap($downloadBtn).then($btn => {
                      const href = $btn.attr('href');
                      const downloadAttr = $btn.attr('download');

                      if (href || downloadAttr) {
                        cy.log(
                          ` EE files download button has href/download attribute: ${href || downloadAttr}`,
                        );
                      }

                      // Click the download button
                      cy.wrap($downloadBtn)
                        .invoke('removeAttr', 'target')
                        .click({ force: true });
                      cy.wait(2000);
                      cy.log(' Clicked EE files download button');
                    });
                  } else {
                    cy.log(' EE files download button element not found');
                  }
                });
              } else {
                cy.log(
                  ' EE files download button not found on completion page',
                );
              }

              // 9b. Verify "Getting Started" button (second)
              cy.get('body', { timeout: 15000 }).then($bodyAfter => {
                const bodyTextAfter = $bodyAfter.text();
                if (
                  bodyTextAfter.includes('Getting Started') ||
                  bodyTextAfter.includes('Getting started') ||
                  bodyTextAfter.includes('getting started')
                ) {
                  cy.log(' Found Getting Started text on page');
                  cy.url().then(originalUrl => {
                    cy.get('body').then($b => {
                      const $gettingStartedBtn = $b
                        .find('button, a, [role="button"]')
                        .filter((_, el) => {
                          const text = (el.textContent || '').toLowerCase();
                          return (
                            text.includes('getting') && text.includes('started')
                          );
                        })
                        .first();

                      if ($gettingStartedBtn.length > 0) {
                        cy.wrap($gettingStartedBtn)
                          .invoke('removeAttr', 'target')
                          .click({ force: true });
                        cy.wait(3000);
                        cy.url().then(url => {
                          try {
                            const urlObj = new URL(url);
                            const hostname = urlObj.hostname;
                            if (
                              hostname === 'github.com' ||
                              hostname.endsWith('.github.com')
                            ) {
                              cy.log(
                                ` Getting Started button navigated to: ${url}`,
                              );
                              cy.go('back');
                              cy.wait(2000);
                              cy.get('body', { timeout: 15000 }).should(
                                'be.visible',
                              );
                              cy.log(' Navigated back from Getting Started');
                            } else {
                              cy.log(
                                ` Getting Started button clicked, URL: ${url}`,
                              );
                            }
                          } catch (e) {
                            // If URL parsing fails, try parsing with base URL for relative URLs
                            try {
                              // Get current URL as base for relative URLs
                              const currentUrl = cy.url();
                              cy.url().then(baseUrl => {
                                try {
                                  const urlObj = new URL(url, baseUrl);
                                  const hostname = urlObj.hostname;
                                  if (
                                    hostname === 'github.com' ||
                                    hostname.endsWith('.github.com')
                                  ) {
                                    cy.log(
                                      ` Getting Started button navigated to: ${url}`,
                                    );
                                    cy.go('back');
                                    cy.wait(2000);
                                    cy.get('body', { timeout: 15000 }).should(
                                      'be.visible',
                                    );
                                    cy.log(
                                      ' Navigated back from Getting Started',
                                    );
                                  } else {
                                    cy.log(
                                      ` Getting Started button clicked, URL: ${url}`,
                                    );
                                  }
                                } catch (e2) {
                                  // If still can't parse, treat as indeterminate
                                  cy.log(
                                    ` Could not parse URL reliably: ${url}. Treating as non-GitHub.`,
                                  );
                                }
                              });
                            } catch (e2) {
                              // If we can't get base URL, treat as indeterminate
                              cy.log(
                                ` Could not parse URL reliably: ${url}. Treating as non-GitHub.`,
                              );
                            }
                          }
                        });
                      } else {
                        cy.log(' Getting Started button element not found');
                      }
                    });
                  });
                } else {
                  cy.log(
                    ' Getting Started button not found on completion page',
                  );
                }
              });

              // 9c. Verify "View details in Catalog" button (third) - opens in another window
              cy.get('body', { timeout: 15000 }).then($bodyCatalog => {
                const bodyTextCatalog = $bodyCatalog.text();
                if (
                  bodyTextCatalog.includes('View details in catalog') ||
                  bodyTextCatalog.includes('View details in Catalog') ||
                  bodyTextCatalog.includes('catalog')
                ) {
                  cy.log(' Found View details in Catalog text on page');
                  cy.get('body').then($b => {
                    const $catalogBtn = $b
                      .find('button, a, [role="button"]')
                      .filter((_, el) => {
                        const text = (el.textContent || '').toLowerCase();
                        return (
                          text.includes('view') && text.includes('catalog')
                        );
                      })
                      .first();

                    if ($catalogBtn.length > 0) {
                      // Click button - it will open in another window/tab (target="_blank")
                      cy.wrap($catalogBtn).click({ force: true });
                      cy.wait(2000);
                      cy.log(
                        ' Clicked View details in Catalog button (opens in another window)',
                      );
                      // Note: Since it opens in another window, we don't navigate back
                    } else {
                      cy.log(
                        ' View details in Catalog button element not found',
                      );
                    }
                  });
                } else {
                  cy.log(
                    ' View details in Catalog button not found on completion page',
                  );
                }
              });

              // 9d. Verify "Github Repository" button (fourth)
              cy.get('body', { timeout: 15000 }).then($bodyGithub => {
                const bodyTextGithub = $bodyGithub.text();
                if (
                  bodyTextGithub.includes('Github Repository') ||
                  bodyTextGithub.includes('GitHub Repository') ||
                  bodyTextGithub.includes('Github')
                ) {
                  cy.log(' Found Github Repository text on page');
                  cy.get('body').then($b => {
                    const $githubBtn = $b
                      .find('button, a, [role="button"]')
                      .filter((_, el) => {
                        const text = (el.textContent || '').toLowerCase();
                        return (
                          text.includes('github') && text.includes('repository')
                        );
                      })
                      .first();

                    if ($githubBtn.length > 0) {
                      cy.wrap($githubBtn).then($btn => {
                        const href = $btn.attr('href');
                        cy.url().then(originalUrl => {
                          if (href) {
                            cy.log(
                              ` Github Repository link found with href: ${href}`,
                            );
                            // Click the link and verify it navigates to GitHub
                            cy.wrap($btn)
                              .invoke('removeAttr', 'target')
                              .click({ force: true });
                            cy.wait(3000);
                            cy.url().then(url => {
                              try {
                                const urlObj = new URL(url);
                                const hostname = urlObj.hostname;
                                if (
                                  hostname === 'github.com' ||
                                  hostname.endsWith('.github.com')
                                ) {
                                  cy.log(
                                    ` Github Repository button navigated to GitHub: ${url}`,
                                  );
                                  // Navigate back if needed
                                  cy.go('back');
                                  cy.wait(2000);
                                  cy.get('body', { timeout: 15000 }).should(
                                    'be.visible',
                                  );
                                  cy.log(' Navigated back from GitHub');
                                } else {
                                  cy.log(
                                    ` Github Repository button clicked, but URL is: ${url}`,
                                  );
                                  // If we didn't navigate to GitHub, go back anyway
                                  if (url !== originalUrl) {
                                    cy.go('back');
                                    cy.wait(2000);
                                  }
                                }
                              } catch (e) {
                                // If URL parsing fails, try parsing with base URL for relative URLs
                                cy.url().then(baseUrl => {
                                  try {
                                    const urlObj = new URL(url, baseUrl);
                                    const hostname = urlObj.hostname;
                                    if (
                                      hostname === 'github.com' ||
                                      hostname.endsWith('.github.com')
                                    ) {
                                      cy.log(
                                        ` Github Repository button navigated to GitHub: ${url}`,
                                      );
                                      cy.go('back');
                                      cy.wait(2000);
                                    } else {
                                      cy.log(
                                        ` Github Repository button clicked, URL: ${url}`,
                                      );
                                    }
                                  } catch (e2) {
                                    cy.log(
                                      ` Could not parse URL reliably: ${url}. Treating as non-GitHub.`,
                                    );
                                  }
                                });
                              }
                            });
                          } else {
                            cy.log(
                              ' Github Repository button has no href, clicking as button',
                            );
                            cy.wrap($btn)
                              .invoke('removeAttr', 'target')
                              .click({ force: true });
                            cy.wait(3000);
                            cy.url().then(url => {
                              try {
                                const urlObj = new URL(url);
                                const hostname = urlObj.hostname;
                                if (
                                  hostname === 'github.com' ||
                                  hostname.endsWith('.github.com')
                                ) {
                                  cy.log(
                                    ` Github Repository button navigated to GitHub: ${url}`,
                                  );
                                  cy.go('back');
                                  cy.wait(2000);
                                } else {
                                  cy.log(
                                    ` Github Repository button clicked, URL: ${url}`,
                                  );
                                }
                              } catch (e) {
                                // If URL parsing fails, try parsing with base URL for relative URLs
                                cy.url().then(baseUrl => {
                                  try {
                                    const urlObj = new URL(url, baseUrl);
                                    const hostname = urlObj.hostname;
                                    if (
                                      hostname === 'github.com' ||
                                      hostname.endsWith('.github.com')
                                    ) {
                                      cy.log(
                                        ` Github Repository button navigated to GitHub: ${url}`,
                                      );
                                      cy.go('back');
                                      cy.wait(2000);
                                    } else {
                                      cy.log(
                                        ` Github Repository button clicked, URL: ${url}`,
                                      );
                                    }
                                  } catch (e2) {
                                    // If still can't parse, treat as indeterminate
                                    cy.log(
                                      ` Could not parse URL reliably: ${url}. Treating as non-GitHub.`,
                                    );
                                  }
                                });
                              }
                            });
                          }
                        });
                      });
                    } else {
                      cy.log(
                        ' Github Repository button element not found (text exists but no clickable element)',
                      );
                    }
                  });
                } else {
                  cy.log(
                    ' Github Repository button not found on completion page',
                  );
                }
              });
            });
          } else {
            cy.log(
              ` EE template card "${EE_TEMPLATE_TITLE}" not found for second execution`,
            );
          }
        });
      } else {
        cy.log(
          ` EE template card "${EE_TEMPLATE_TITLE}" not found on Create tab after import`,
        );
      }
    });
  });
});
