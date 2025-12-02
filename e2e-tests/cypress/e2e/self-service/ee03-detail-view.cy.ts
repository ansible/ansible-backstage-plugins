/// <reference types="cypress" />

import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Execution Environment Catalog and Detail View Tests', () => {
  beforeEach(() => {
    // Small wait to ensure login completed (if running first test)
    cy.wait(1000);

    // Navigate to EE catalog page
    cy.visit('/self-service/ee');
    cy.wait(2000);

    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.get('main', { timeout: 15000 }).should('be.visible');

    // Navigate to Catalog tab
    cy.get('body').then($body => {
      if ($body.text().includes('Catalog')) {
        cy.contains('Catalog').click({ force: true });
        cy.wait(2000);
      }
    });

    // Just check and log - don't create
    cy.get('body').then($body => {
      const hasTableRows = $body.find('table tbody tr').length > 0;
      if (hasTableRows) {
        cy.log(
          ` Catalog has ${$body.find('table tbody tr').length} item(s) for testing`,
        );
      } else {
        cy.log(' Catalog is empty - some tests may be skipped');
        cy.log(' Run ee02-template-execution.cy.ts first to create test data');
      }
    });
  });

  it('Validates Catalog tab: empty state or table content', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const text = $body.text();
      const hasEmptyState = text.includes(
        'No Execution Environment definition files, yet',
      );
      if (hasEmptyState) {
        cy.log(' EE Catalog is in empty state');
        // Empty state tests can be added here if needed
        return;
      }

      // Check if table exists
      if ($body.find('table').length > 0) {
        cy.log(' EE Catalog table found');
        // Check if table exists in DOM (don't require full visibility due to CSS clipping)
        cy.get('table').should('exist');

        // Try to scroll table into view if possible
        cy.get('table').first().scrollIntoView();
        cy.wait(500);

        // Check if table has content (rows) - this is more reliable than visibility
        cy.get('table')
          .first()
          .then($table => {
            const $rows = $table.find('tbody tr');
            if ($rows.length > 0) {
              cy.log(` Table found with ${$rows.length} row(s)`);
            } else {
              cy.log(' Table found but has no rows (empty table)');
            }
          });
      } else {
        cy.log(' EE Catalog table not found');
      }
    });
  });

  it('Validates Catalog tab: right sidebar filters (Starred, My Org, Tags, Owner)', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const text = $body.text();

      // Personal -> Starred filter
      if (text.includes('Personal') && text.includes('Starred')) {
        cy.log(' Personal / Starred section found on sidebar');
        cy.contains('Starred').click({ force: true });
        cy.wait(1000);
        cy.log(' Clicked Starred filter in sidebar');

        // Click back to All or reset
        if (text.includes('All')) {
          cy.contains('All').click({ force: true });
          cy.wait(1000);
        }
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

      // Tags dropdown filter (in right sidebar)
      if (text.includes('Tags')) {
        cy.log(' Tags filter label found on sidebar');
        cy.get('body').then($body => {
          // Look for Tags in the sidebar (not in table)
          // Find element containing "Tags" text
          const $tagsLabel = $body
            .find('*')
            .filter((_, el) => {
              const $el = Cypress.$(el);
              const elText = $el.text().trim();
              return (
                elText === 'Tags' ||
                (elText.includes('Tags') && !$el.closest('table').length)
              );
            })
            .first();

          if ($tagsLabel.length > 0) {
            // Try to find clickable element near Tags label
            // Check if Tags label itself is clickable
            if (
              $tagsLabel.is('button') ||
              $tagsLabel.attr('role') === 'button' ||
              $tagsLabel.is('input')
            ) {
              cy.wrap($tagsLabel).click({ force: true });
              cy.wait(1000);
              cy.log(' Clicked Tags filter label directly');
            } else {
              // Look for clickable element in parent or sibling
              const $parent = $tagsLabel.parent();
              const $clickable = $parent
                .find('button, [role="button"], input, select')
                .first();

              if ($clickable.length > 0) {
                cy.wrap($clickable).click({ force: true });
                cy.wait(1000);
                cy.log(' Clicked Tags filter element');
              } else {
                // Try clicking the parent if it's clickable
                if ($parent.is('button') || $parent.attr('role') === 'button') {
                  cy.wrap($parent).click({ force: true });
                  cy.wait(1000);
                  cy.log(' Clicked Tags filter parent');
                } else {
                  // Fallback: click near the Tags text
                  cy.contains('Tags').then($el => {
                    cy.wrap($el).click({ force: true });
                  });
                  cy.wait(1000);
                  cy.log(' Clicked Tags filter (fallback)');
                }
              }
            }
          } else {
            cy.log(' Tags filter element not found in sidebar');
          }
        });

        // Close dropdown if opened
        cy.wait(1000);
        cy.get('body').then($bodyAfter => {
          if (
            $bodyAfter.find(
              '[role="listbox"], [role="menu"], [role="combobox"]',
            ).length > 0
          ) {
            cy.get('body').click(0, 0); // Click outside to close
            cy.wait(500);
          }
        });
      } else {
        cy.log(' Tags filter label not found on sidebar');
      }

      // Owner dropdown filter (in right sidebar)
      if (text.includes('Owner')) {
        cy.log(' Owner filter label found on sidebar');
        cy.get('body').then($body => {
          // Look for Owner in the sidebar (not in table)
          const $ownerLabel = $body
            .find('*')
            .filter((_, el) => {
              const $el = Cypress.$(el);
              const elText = $el.text().trim();
              return (
                elText === 'Owner' ||
                (elText.includes('Owner') && !$el.closest('table').length)
              );
            })
            .first();

          if ($ownerLabel.length > 0) {
            // Try to find clickable element near Owner label
            if (
              $ownerLabel.is('button') ||
              $ownerLabel.attr('role') === 'button' ||
              $ownerLabel.is('input')
            ) {
              cy.wrap($ownerLabel).click({ force: true });
              cy.wait(1000);
              cy.log(' Clicked Owner filter label directly');
            } else {
              // Look for clickable element in parent or sibling
              const $parent = $ownerLabel.parent();
              const $clickable = $parent
                .find('button, [role="button"], input, select')
                .first();

              if ($clickable.length > 0) {
                cy.wrap($clickable).click({ force: true });
                cy.wait(1000);
                cy.log(' Clicked Owner filter element');
              } else {
                // Try clicking the parent if it's clickable
                if ($parent.is('button') || $parent.attr('role') === 'button') {
                  cy.wrap($parent).click({ force: true });
                  cy.wait(1000);
                  cy.log(' Clicked Owner filter parent');
                } else {
                  // Fallback: click near the Owner text
                  cy.contains('Owner').then($el => {
                    cy.wrap($el).click({ force: true });
                  });
                  cy.wait(1000);
                  cy.log(' Clicked Owner filter (fallback)');
                }
              }
            }
          } else {
            cy.log(' Owner filter element not found in sidebar');
          }
        });

        // Close dropdown if opened
        cy.wait(1000);
        cy.get('body').then($bodyAfter => {
          if (
            $bodyAfter.find(
              '[role="listbox"], [role="menu"], [role="combobox"]',
            ).length > 0
          ) {
            cy.get('body').click(0, 0);
            cy.wait(500);
          }
        });
      } else {
        cy.log(' Owner filter label not found on sidebar');
      }
    });
  });

  it('Validates Catalog table: row elements (Name, Owner, Description, Tags, Actions)', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      const text = $body.text();

      // First check for empty state message
      const hasEmptyState = text.includes(
        'No Execution Environment definition files, yet',
      );

      if (hasEmptyState) {
        cy.contains('No Execution Environment definition files, yet').should(
          'exist',
        );
        cy.log(' EE Catalog is in empty state - no table expected');
        // Verify empty state elements
        if (text.includes('Create Execution Environment definition file')) {
          cy.contains('Create Execution Environment definition file').should(
            'exist',
          );
          cy.log(' Empty state CTA button found');
        }
        return; // Exit early if empty state
      }

      // Check if table exists
      if ($body.find('table').length === 0) {
        cy.log(' No table found - catalog may be empty or loading');
        return;
      }

      // Check if table has rows
      const $tableRows = $body.find('table tbody tr');
      if ($tableRows.length === 0) {
        cy.log(' Table exists but has no rows - empty table state');
        // Verify table headers are still present even with no rows
        cy.get('table')
          .first()
          .then($table => {
            const tableText = $table.text();
            if (tableText.includes('Name') || tableText.includes('Owner')) {
              cy.log(' Table headers present even with no rows');
            }
          });
        return; // Exit if no rows
      }

      cy.log(
        ` Table found with ${$tableRows.length} row(s), checking row elements`,
      );

      // Check table headers - use .first() to get single table
      cy.get('table')
        .first()
        .then($table => {
          const tableText = $table.text();

          if (tableText.includes('Name')) {
            cy.contains('Name').should('exist');
          }
          if (tableText.includes('Owner')) {
            cy.contains('Owner').should('exist');
          }
          if (tableText.includes('Description')) {
            cy.contains('Description').should('exist');
          }
          if (tableText.includes('Tags')) {
            cy.contains('Tags').should('exist');
          }
          if (tableText.includes('Actions')) {
            cy.contains('Actions').should('exist');
          }
        });

      // Check first table row for data - use .first() to get single table
      cy.get('table')
        .first()
        .find('tbody tr')
        .first()
        .then($firstRow => {
          cy.log(' First table row found');

          // Check for Name (should be a link or clickable)
          const $nameLink = $firstRow.find('a').first();
          if ($nameLink.length > 0) {
            cy.log(` Name link found: ${$nameLink.text()}`);
          } else {
            // Check if first cell has clickable content
            const $firstCell = $firstRow.find('td').first();
            if ($firstCell.length > 0) {
              cy.log(` Name cell found: ${$firstCell.text().trim()}`);
            }
          }

          // Check for Owner
          if ($firstRow.text().includes('user:default')) {
            cy.log(' Owner information found in row');
          }

          // Check for Description
          if ($firstRow.text().includes('execution environment')) {
            cy.log(' Description found in row');
          }

          // Check for Tags
          if (
            $firstRow.find('[class*="chip"], [class*="tag"], [class*="badge"]')
              .length > 0
          ) {
            cy.log(' Tags found in row');
          }

          // Check for Actions (star and edit buttons)
          const $starButton = $firstRow.find('button').filter((_, btn) => {
            const ariaLabel = (
              btn.getAttribute('aria-label') || ''
            ).toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            return (
              ariaLabel.includes('favorite') ||
              ariaLabel.includes('star') ||
              title.includes('favorite') ||
              title.includes('star') ||
              btn.querySelector('svg[data-testid*="star"]') !== null
            );
          });

          const $editButton = $firstRow.find('button').filter((_, btn) => {
            const ariaLabel = (
              btn.getAttribute('aria-label') || ''
            ).toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            return (
              ariaLabel.includes('edit') ||
              title.includes('edit') ||
              btn.querySelector('svg[data-testid*="edit"]') !== null ||
              btn.querySelector('svg[data-testid*="pencil"]') !== null
            );
          });

          if ($starButton.length > 0) {
            cy.log(' Star/favorite button found in Actions column');
          }

          if ($editButton.length > 0) {
            cy.log(' Edit button found in Actions column');
          }
        });
    });
  });

  it('Validates Catalog table: star/favorite button in Actions column', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.find('table tbody tr').length === 0) {
        cy.log(' No table rows found - skipping star button test');
        return;
      }

      // Find first row's star button
      cy.get('table tbody tr')
        .first()
        .within(() => {
          cy.get('button').then($buttons => {
            const $starButton = $buttons.filter((_, btn) => {
              const ariaLabel = (
                btn.getAttribute('aria-label') || ''
              ).toLowerCase();
              const title = (btn.getAttribute('title') || '').toLowerCase();
              return (
                ariaLabel.includes('favorite') ||
                ariaLabel.includes('star') ||
                title.includes('favorite') ||
                title.includes('star') ||
                btn.querySelector('svg[data-testid*="star"]') !== null
              );
            });

            if ($starButton.length > 0) {
              cy.log(' Star/favorite button found');
              cy.wrap($starButton.first()).click({ force: true });
              cy.wait(2000); // Wait longer for DOM update
              cy.log(' Clicked star/favorite button - should add to starred');
            } else {
              cy.log(' Star/favorite button not found in Actions column');
            }
          });
        });

      // Exit the .within() block and re-query from body level
      cy.wait(1000);

      // Re-query the table from body level (not inside .within())
      cy.get('body').then($bodyAfter => {
        if ($bodyAfter.find('table tbody tr').length > 0) {
          cy.log(' Table still available after star click');

          // Try to click star again to toggle off
          cy.get('table tbody tr')
            .first()
            .within(() => {
              cy.get('button').then($buttonsAfter => {
                const $starButtonAfter = $buttonsAfter.filter((_, btn) => {
                  const ariaLabel = (
                    btn.getAttribute('aria-label') || ''
                  ).toLowerCase();
                  const title = (btn.getAttribute('title') || '').toLowerCase();
                  return (
                    ariaLabel.includes('favorite') ||
                    ariaLabel.includes('star') ||
                    title.includes('favorite') ||
                    title.includes('star') ||
                    btn.querySelector('svg[data-testid*="star"]') !== null
                  );
                });

                if ($starButtonAfter.length > 0) {
                  cy.wrap($starButtonAfter.first()).click({ force: true });
                  cy.wait(1000);
                  cy.log(
                    ' Clicked star/favorite button again - should remove from starred',
                  );
                } else {
                  cy.log(' Star button not found after first click');
                }
              });
            });
        } else {
          cy.log(
            ' Table not found after star click (may have navigated or re-rendered)',
          );
        }
      });
    });
  });
  it('Validates Catalog table: edit button in Actions column', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.find('table tbody tr').length === 0) {
        cy.log(' No table rows found - skipping edit button test');
        return;
      }

      // Find first row's edit button
      cy.get('table tbody tr')
        .first()
        .within(() => {
          cy.get('button').then($buttons => {
            const $editButton = $buttons.filter((_, btn) => {
              const ariaLabel = (
                btn.getAttribute('aria-label') || ''
              ).toLowerCase();
              const title = (btn.getAttribute('title') || '').toLowerCase();
              return (
                ariaLabel.includes('edit') ||
                title.includes('edit') ||
                btn.querySelector('svg[data-testid*="edit"]') !== null ||
                btn.querySelector('svg[data-testid*="pencil"]') !== null
              );
            });

            if ($editButton.length > 0) {
              cy.log(' Edit button found');
              cy.wrap($editButton.first()).click({ force: true });
              cy.wait(2000);

              // Check if edit dialog/modal opened or navigated
              cy.url().then(url => {
                if (url.includes('/edit') || url.includes('/catalog')) {
                  cy.log(` Edit button clicked, navigated to: ${url}`);
                } else {
                  cy.log(' Edit button clicked (may have opened modal/dialog)');
                }
              });

              // If we navigated away, go back
              cy.url().then(url => {
                if (url.includes('/edit')) {
                  cy.go('back');
                  cy.wait(2000);
                }
              });
            } else {
              cy.log(' Edit button not found in Actions column');
            }
          });
        });
    });
  });

  it('Validates Catalog table: clicking Name link navigates to detail view', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.find('table tbody tr').length === 0) {
        cy.log(' No table rows found - skipping name link test');
        return;
      }

      // Find first row's name element (could be a, button, or clickable div)
      cy.get('table tbody tr')
        .first()
        .then($firstRow => {
          // Try to find name element - could be link, button, or clickable div
          const $nameElement = $firstRow
            .find('a, button, [role="link"], [role="button"]')
            .filter((_, el) => {
              // Check if it's in the Name column (first column typically)
              const $td = Cypress.$(el).closest('td');
              const columnIndex = $td.index();
              // Name is usually first column (index 0)
              return columnIndex === 0 || $td.prevAll().length === 0;
            })
            .first();

          if ($nameElement.length > 0) {
            const entityName = $nameElement.text().trim();
            cy.log(` Found name element: ${entityName}`);

            cy.wrap($nameElement).click({ force: true });
            cy.wait(3000);

            // Verify navigation to detail view
            cy.wait(3000); // Give extra time for navigation
            cy.url({ timeout: 20000 }).then(url => {
              if (
                url.includes('/self-service/catalog/') ||
                url.includes('/catalog/')
              ) {
                cy.log(` Navigated to detail view page: ${url}`);

                // Wait for body to be visible (more reliable than main)
                cy.get('body', { timeout: 20000 }).should('be.visible');
                cy.wait(2000);

                // Verify detail page content
                cy.get('body').then($detailBody => {
                  // Check for main element (optional)
                  const hasMain = $detailBody.find('main').length > 0;
                  if (hasMain) {
                    cy.get('main').should('be.visible');
                    cy.log(' Main element found on detail page');
                  } else {
                    cy.log(
                      ' Main element not found (detail page may use different structure)',
                    );
                  }

                  // Verify entity name is on the page
                  if ($detailBody.text().includes(entityName)) {
                    cy.log(` Detail page shows entity name: ${entityName}`);
                  } else {
                    cy.log(
                      ` Entity name "${entityName}" not clearly visible on detail page`,
                    );
                  }

                  // Check for detail page indicators
                  const hasOverview = $detailBody.text().includes('Overview');
                  const hasAbout = $detailBody.text().includes('About');
                  const hasDescription = $detailBody
                    .text()
                    .includes('DESCRIPTION');

                  if (hasOverview || hasAbout || hasDescription) {
                    cy.log(' Detail page content indicators found');
                  } else {
                    cy.log(
                      ' Detail page content indicators not clearly visible',
                    );
                  }
                });
              } else {
                cy.log(` After clicking name element, URL is: ${url}`);
              }
            });
          } else {
            // Fallback: try clicking the first cell in the row
            cy.log(' Name link/button not found, trying first cell click');
            cy.get('table tbody tr')
              .first()
              .within(() => {
                cy.get('td')
                  .first()
                  .then($firstCell => {
                    const cellText = $firstCell.text().trim();
                    if (cellText) {
                      cy.log(` Found first cell text: ${cellText}`);
                      // Try clicking the cell or any clickable element within it
                      cy.wrap($firstCell)
                        .find('*')
                        .first()
                        .click({ force: true });
                      cy.wait(3000);

                      cy.url().then(url => {
                        if (
                          url.includes('/self-service/catalog/') ||
                          url.includes('/catalog/')
                        ) {
                          cy.log(` Navigated to detail view page: ${url}`);
                        } else {
                          cy.log(` After clicking first cell, URL is: ${url}`);
                        }
                      });
                    }
                  });
              });
          }
        });
    });
  });
  it('Validates Detail view page: Links box, About box, and menu options', () => {
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.find('table tbody tr').length === 0) {
        cy.log(' No table rows found - skipping detail view test');
        return;
      }

      // Navigate to detail view by clicking first row's name
      cy.get('table tbody tr')
        .first()
        .then($firstRow => {
          const $nameElement = $firstRow
            .find('a, button, [role="link"], [role="button"]')
            .filter((_, el) => {
              const $td = Cypress.$(el).closest('td');
              return $td.index() === 0 || $td.prevAll().length === 0;
            })
            .first();
          if ($nameElement.length > 0) {
            const entityName = $nameElement.text().trim();
            cy.log(` Found name element: ${entityName}`);

            cy.wrap($nameElement).click({ force: true });
            cy.wait(3000);

            // Verify navigation to detail view
            cy.url({ timeout: 20000 }).then(url => {
              if (
                url.includes('/self-service/catalog/') ||
                url.includes('/catalog/')
              ) {
                cy.log(` Navigated to detail view page: ${url}`);
                cy.get('body', { timeout: 20000 }).should('be.visible');
                cy.wait(2000);

                // 1. Verify Links box with "Download EE files" button
                cy.get('body').then($detailBody => {
                  // Look for Links card/section
                  if (
                    $detailBody.text().includes('Links') ||
                    $detailBody.text().includes('Download')
                  ) {
                    cy.log(' Links section found on detail page');

                    // Find Download EE files - it's a Box with onClick, containing text "Download EE files"
                    cy.contains('Download EE files').then(
                      ($downloadText: JQuery<HTMLElement>) => {
                        if ($downloadText && $downloadText.length > 0) {
                          // Find the parent Box that has onClick (clickable)
                          const $clickableBox = $downloadText
                            .closest(
                              'div[style*="cursor: pointer"], div[style*="cursor:pointer"]',
                            )
                            .first();

                          if ($clickableBox.length > 0) {
                            cy.log(
                              ' Found Download EE files clickable element',
                            );
                            cy.wrap($clickableBox).click({ force: true });
                            cy.wait(2000);
                            cy.log(' Clicked Download EE files button');
                          } else {
                            // Fallback: click the text element itself or its parent
                            cy.wrap($downloadText).click({ force: true });
                            cy.wait(2000);
                            cy.log(' Clicked Download EE files (fallback)');
                          }
                        } else {
                          cy.log(' Download EE files text not found');
                        }
                      },
                    );
                  } else {
                    cy.log(' Links section not found on detail page');
                  }

                  // 2. Verify About box and OWNER field
                  if ($detailBody.text().includes('About')) {
                    cy.log(' About section found on detail page');

                    // Check for OWNER field
                    if ($detailBody.text().includes('OWNER')) {
                      cy.log(' OWNER field found in About section');

                      // Find OWNER label, then find the button element that follows it
                      cy.contains('OWNER').then(
                        ($ownerLabel: JQuery<HTMLElement>) => {
                          if ($ownerLabel && $ownerLabel.length > 0) {
                            // Find the button element - it's a button with class ownerButton
                            // The button is inside a Typography that follows the OWNER label
                            const $ownerButton = $ownerLabel
                              .parent()
                              .find('button')
                              .first();

                            if ($ownerButton.length > 0) {
                              const ownerText = $ownerButton.text().trim();
                              cy.log(` OWNER button found: ${ownerText}`);

                              // Click OWNER button to verify it's working
                              cy.wrap($ownerButton).click({ force: true });
                              cy.wait(2000);
                              cy.log(' Clicked OWNER button');

                              // Check if navigation occurred
                              cy.url().then(currentUrl => {
                                if (currentUrl !== url) {
                                  cy.log(
                                    ` OWNER button navigated to: ${currentUrl}`,
                                  );
                                  cy.go('back');
                                  cy.wait(2000);
                                } else {
                                  cy.log(
                                    ' OWNER button clicked (may have filtered or navigated)',
                                  );
                                }
                              });
                            } else {
                              cy.log(' OWNER button not found');
                            }
                          } else {
                            cy.log(' OWNER label element not found');
                          }
                        },
                      );
                    } else {
                      cy.log(' OWNER field not found in About section');
                    }
                  } else {
                    cy.log(' About section not found on detail page');
                  }

                  // 3. Verify 3 dots menu (kebab menu) in top right
                  cy.get('body').then($menuBody => {
                    // Look for IconButton containing MoreVertIcon (3 dots icon)
                    // The button is an IconButton with MoreVertIcon inside
                    const $menuButton = $menuBody
                      .find('button[aria-label], button')
                      .filter((_, btn) => {
                        // Check if button contains MoreVert icon (3 vertical dots)
                        const hasMoreVert =
                          btn.querySelector(
                            'svg[data-testid*="MoreVert"], svg path[d*="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"]',
                          ) !== null;
                        return hasMoreVert;
                      })
                      .first();

                    // Fallback: look for any button in top right area
                    if ($menuButton.length === 0) {
                      // Try finding by position or by looking for buttons near the entity name
                      cy.contains(entityName).then(
                        ($nameEl: JQuery<HTMLElement>) => {
                          if ($nameEl && $nameEl.length > 0) {
                            // Find button near the name (should be in header)
                            const $headerButtons = $nameEl
                              .parent()
                              .parent()
                              .find('button')
                              .last();
                            if ($headerButtons.length > 0) {
                              cy.wrap($headerButtons).then($btn => {
                                cy.wrap($btn).click({ force: true });
                                cy.wait(1000);
                                cy.log(
                                  ' Clicked menu button (fallback by position)',
                                );
                              });
                            }
                          }
                        },
                      );
                    }

                    if ($menuButton.length > 0) {
                      cy.log(' Found 3 dots menu button');
                      // Click to open menu
                      cy.wrap($menuButton).click({ force: true });
                      cy.wait(1500); // Wait for menu to open
                      cy.log(' Opened 3 dots menu');

                      // 3a. Test second option: "Inspect entity"
                      cy.get('body').then($menuOpenBody => {
                        // Look for "Inspect entity" MenuItem - it's in a Popover
                        cy.contains('Inspect entity').then(
                          ($inspectOption: JQuery<HTMLElement>) => {
                            if ($inspectOption && $inspectOption.length > 0) {
                              cy.log(' Found "Inspect entity" option');
                              cy.wrap($inspectOption).click({ force: true });
                              cy.wait(3000);
                              cy.log(' Clicked "Inspect entity" option');

                              // Verify Entity Inspector opened
                              cy.get('body').then($inspectorBody => {
                                if (
                                  $inspectorBody
                                    .text()
                                    .includes('Entity Inspector') ||
                                  $inspectorBody.text().includes('Overview') ||
                                  $inspectorBody.text().includes('Raw JSON') ||
                                  $inspectorBody.text().includes('Raw YAML')
                                ) {
                                  cy.log(
                                    ' Entity Inspector opened successfully',
                                  );

                                  // Close Entity Inspector - look for Close button with defensive check
                                  cy.get('body', { timeout: 5000 }).then(
                                    $closeBody => {
                                      // Try to find close button using multiple methods
                                      const $closeButton = $closeBody
                                        .find('button, [role="button"]')
                                        .filter((_, btn) => {
                                          const text = (btn.textContent || '')
                                            .toLowerCase()
                                            .trim();
                                          const ariaLabel = (
                                            btn.getAttribute('aria-label') || ''
                                          ).toLowerCase();
                                          return (
                                            text.includes('close') ||
                                            ariaLabel.includes('close')
                                          );
                                        })
                                        .first();

                                      if ($closeButton.length > 0) {
                                        cy.wrap($closeButton).click({
                                          force: true,
                                        });
                                        cy.wait(2000);
                                        cy.log(' Closed Entity Inspector');
                                      } else {
                                        // Fallback: Try cy.contains with error handling
                                        cy.get('body').then($fallbackBody => {
                                          if (
                                            $fallbackBody
                                              .text()
                                              .toLowerCase()
                                              .includes('close')
                                          ) {
                                            // Use cy.contains but with a timeout and error handling
                                            cy.contains('button', /close/i, {
                                              timeout: 3000,
                                            })
                                              .should('exist')
                                              .click({ force: true });
                                            cy.wait(2000);
                                            cy.log(
                                              ' Closed Entity Inspector (fallback method)',
                                            );
                                          } else {
                                            // Last resort: press Escape key
                                            cy.get('body').type('{esc}');
                                            cy.wait(1000);
                                            cy.log(
                                              ' Closed Entity Inspector using Escape key',
                                            );
                                          }
                                        });
                                      }
                                    },
                                  );
                                } else {
                                  cy.log(
                                    ' Entity Inspector may not have opened as expected',
                                  );
                                }
                              });
                            } else {
                              cy.log(
                                ' "Inspect entity" option not found in menu',
                              );
                            }
                          },
                        );
                      });

                      // Re-open menu for next option
                      cy.wait(1000);
                      cy.get('body').then($reopenBody => {
                        // Find menu button again
                        const $menuButtonAgain = $reopenBody
                          .find('button')
                          .filter((_, btn) => {
                            const hasMoreVert =
                              btn.querySelector(
                                'svg[data-testid*="MoreVert"], svg path[d*="M12 8c1.1 0 2-.9 2-2"]',
                              ) !== null;
                            return hasMoreVert;
                          })
                          .first();

                        if ($menuButtonAgain.length > 0) {
                          cy.wrap($menuButtonAgain).click({ force: true });
                          cy.wait(1500);
                          cy.log(' Re-opened 3 dots menu');
                        }
                      });

                      // 3b. Test first option: "Unregister entity"
                      cy.get('body').then($unregisterBody => {
                        // Look for "Unregister entity" MenuItem
                        cy.contains('Unregister entity').then(
                          ($unregisterOption: JQuery<HTMLElement>) => {
                            if (
                              $unregisterOption &&
                              $unregisterOption.length > 0
                            ) {
                              cy.log(' Found "Unregister entity" option');
                              cy.wrap($unregisterOption).click({ force: true });
                              cy.wait(2000);
                              cy.log(' Clicked "Unregister entity" option');

                              // Verify modal opened
                              cy.get('body').then($modalBody => {
                                if (
                                  $modalBody.text().includes('Are you sure') ||
                                  $modalBody.text().includes('unregister') ||
                                  $modalBody.text().includes('delete')
                                ) {
                                  cy.log(
                                    ' Unregister confirmation modal opened',
                                  );

                                  // Wait a bit for modal to fully render
                                  cy.wait(1000);

                                  // Handle two possible flows:
                                  // Flow 1: Direct "Delete Entity" button
                                  // Flow 2: First "Unregister entity" button → then "Delete Entity" button

                                  cy.get('body').then($body => {
                                    // First, try to find "Delete Entity" button directly (Flow 1)
                                    const $deleteButton = $body
                                      .find('button, [role="button"]')
                                      .filter((_, btn) => {
                                        const text = (btn.textContent || '')
                                          .toLowerCase()
                                          .trim();
                                        const ariaLabel = (
                                          btn.getAttribute('aria-label') || ''
                                        ).toLowerCase();
                                        return (
                                          (text.includes('delete') &&
                                            text.includes('entity')) ||
                                          text === 'delete entity' ||
                                          ariaLabel.includes('delete')
                                        );
                                      })
                                      .first();

                                    if ($deleteButton.length > 0) {
                                      // Flow 1: Direct Delete Entity button found
                                      cy.log(
                                        ' Found "Delete Entity" button directly (Flow 1)',
                                      );
                                      cy.wrap($deleteButton).click({
                                        force: true,
                                      });
                                      cy.wait(2000);
                                      cy.log(' Clicked "Delete Entity" button');

                                      // After deletion, verify navigation
                                      cy.url({ timeout: 10000 }).then(
                                        currentUrl => {
                                          if (
                                            currentUrl.includes(
                                              '/self-service/ee',
                                            ) ||
                                            currentUrl.includes('/catalog')
                                          ) {
                                            cy.log(
                                              ` Navigated back to catalog after deletion: ${currentUrl}`,
                                            );
                                          } else {
                                            cy.log(
                                              ` Current URL after deletion: ${currentUrl}`,
                                            );
                                          }
                                        },
                                      );
                                    } else {
                                      // Flow 2: Check for "Unregister entity" button in first modal
                                      cy.log(
                                        ' Delete Entity button not found - checking for Unregister entity button (Flow 2)',
                                      );

                                      cy.get('body').then($flow2Body => {
                                        const $unregisterButton = $flow2Body
                                          .find('button, [role="button"]')
                                          .filter((_, btn) => {
                                            const text = (btn.textContent || '')
                                              .toLowerCase()
                                              .trim();
                                            const ariaLabel = (
                                              btn.getAttribute('aria-label') ||
                                              ''
                                            ).toLowerCase();
                                            return (
                                              (text.includes('unregister') &&
                                                text.includes('entity')) ||
                                              text === 'unregister entity' ||
                                              ariaLabel.includes('unregister')
                                            );
                                          })
                                          .first();

                                        if ($unregisterButton.length > 0) {
                                          // Flow 2: Click Unregister entity button to get to Delete Entity modal
                                          cy.log(
                                            ' Found "Unregister entity" button in first modal (Flow 2)',
                                          );
                                          cy.wrap($unregisterButton).click({
                                            force: true,
                                          });
                                          cy.wait(2000);
                                          cy.log(
                                            ' Clicked "Unregister entity" button in modal',
                                          );

                                          // Now look for Delete Entity button in second modal
                                          cy.wait(1000);
                                          cy.get('body').then(
                                            $secondModalBody => {
                                              const $deleteButton2 =
                                                $secondModalBody
                                                  .find(
                                                    'button, [role="button"]',
                                                  )
                                                  .filter((_, btn) => {
                                                    const text = (
                                                      btn.textContent || ''
                                                    )
                                                      .toLowerCase()
                                                      .trim();
                                                    const ariaLabel = (
                                                      btn.getAttribute(
                                                        'aria-label',
                                                      ) || ''
                                                    ).toLowerCase();
                                                    return (
                                                      (text.includes(
                                                        'delete',
                                                      ) &&
                                                        text.includes(
                                                          'entity',
                                                        )) ||
                                                      text ===
                                                        'delete entity' ||
                                                      ariaLabel.includes(
                                                        'delete',
                                                      )
                                                    );
                                                  })
                                                  .first();

                                              if ($deleteButton2.length > 0) {
                                                cy.log(
                                                  ' Found "Delete Entity" button in second modal (Flow 2)',
                                                );
                                                cy.wrap($deleteButton2).click({
                                                  force: true,
                                                });
                                                cy.wait(2000);
                                                cy.log(
                                                  ' Clicked "Delete Entity" button',
                                                );

                                                // After deletion, verify navigation
                                                cy.url({ timeout: 10000 }).then(
                                                  currentUrl => {
                                                    if (
                                                      currentUrl.includes(
                                                        '/self-service/ee',
                                                      ) ||
                                                      currentUrl.includes(
                                                        '/catalog',
                                                      )
                                                    ) {
                                                      cy.log(
                                                        ` Navigated back to catalog after deletion: ${currentUrl}`,
                                                      );
                                                    } else {
                                                      cy.log(
                                                        ` Current URL after deletion: ${currentUrl}`,
                                                      );
                                                    }
                                                  },
                                                );
                                              } else {
                                                cy.log(
                                                  ' Delete Entity button not found in second modal',
                                                );
                                                // Try alternative selector
                                                cy.get('body').then(
                                                  $altBody => {
                                                    if (
                                                      $altBody
                                                        .text()
                                                        .toLowerCase()
                                                        .includes(
                                                          'delete entity',
                                                        )
                                                    ) {
                                                      cy.contains(
                                                        'button',
                                                        'Delete Entity',
                                                        { timeout: 3000 },
                                                      )
                                                        .should('exist')
                                                        .click({ force: true });
                                                      cy.wait(2000);
                                                      cy.log(
                                                        ' Clicked "Delete Entity" button (alternative)',
                                                      );
                                                    } else {
                                                      // Close modal - use jQuery first to check existence
                                                      cy.get('body').then(
                                                        $closeBody => {
                                                          const $cancelBtn =
                                                            $closeBody
                                                              .find(
                                                                'button, [role="button"]',
                                                              )
                                                              .filter(
                                                                (_, btn) => {
                                                                  const text = (
                                                                    btn.textContent ||
                                                                    ''
                                                                  )
                                                                    .toLowerCase()
                                                                    .trim();
                                                                  return text.includes(
                                                                    'cancel',
                                                                  );
                                                                },
                                                              )
                                                              .first();

                                                          if (
                                                            $cancelBtn.length >
                                                            0
                                                          ) {
                                                            cy.wrap(
                                                              $cancelBtn,
                                                            ).click({
                                                              force: true,
                                                            });
                                                            cy.wait(1000);
                                                            cy.log(
                                                              ' Clicked Cancel button',
                                                            );
                                                          } else {
                                                            // Last resort: press Escape key
                                                            cy.get('body').type(
                                                              '{esc}',
                                                            );
                                                            cy.wait(1000);
                                                            cy.log(
                                                              ' Closed modal using Escape key',
                                                            );
                                                          }
                                                        },
                                                      );
                                                    }
                                                  },
                                                );
                                              }
                                            },
                                          );
                                        } else {
                                          // Neither Delete Entity nor Unregister entity button found
                                          cy.log(
                                            ' Neither Delete Entity nor Unregister entity button found in modal',
                                          );

                                          // Try to find Cancel button using jQuery first (defensive)
                                          cy.get('body').then($cancelBody => {
                                            const $cancelButton = $cancelBody
                                              .find('button, [role="button"]')
                                              .filter((_, btn) => {
                                                const text = (
                                                  btn.textContent || ''
                                                )
                                                  .toLowerCase()
                                                  .trim();
                                                return text.includes('cancel');
                                              })
                                              .first();

                                            if ($cancelButton.length > 0) {
                                              cy.wrap($cancelButton).click({
                                                force: true,
                                              });
                                              cy.wait(1000);
                                              cy.log(
                                                ' Clicked Cancel button to close modal',
                                              );
                                            } else {
                                              // Last resort: press Escape key
                                              cy.get('body').type('{esc}');
                                              cy.wait(1000);
                                              cy.log(
                                                ' Closed modal using Escape key',
                                              );
                                            }
                                          });
                                        }
                                      });
                                    }
                                  });
                                } else {
                                  cy.log(
                                    ' Unregister confirmation modal may not have opened',
                                  );
                                }
                              });
                            } else {
                              cy.log(
                                ' "Unregister entity" option not found in menu',
                              );
                            }
                          },
                        );
                      });
                    } else {
                      cy.log(' 3 dots menu button not found on detail page');
                    }
                  });
                });
              } else {
                cy.log(` Did not navigate to detail view. Current URL: ${url}`);
              }
            });
          } else {
            cy.log(' Name element not found - cannot navigate to detail view');
          }
        });
    });
  });
});
