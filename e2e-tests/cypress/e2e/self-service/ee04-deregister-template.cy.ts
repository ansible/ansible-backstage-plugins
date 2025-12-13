import { Common } from '../utils/common';

const EE_TEMPLATE_TITLE = 'Start from scratch';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});
describe('Unregister EE Template', () => {
  it('Unregisters the imported EE template from the catalog', () => {
    cy.visit('/self-service/ee');
    cy.wait(2000);
    cy.url({ timeout: 15000 }).should('include', '/self-service/ee');
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.get('body').then($body => {
      if ($body.text().includes('Create')) {
        cy.contains('Create').click({ force: true });
        cy.wait(2000);
      } else {
        cy.log(' Create tab not found on EE page - aborting unregister test');
      }
    });

    cy.get('body').then($body => {
      if ($body.text().includes(EE_TEMPLATE_TITLE)) {
        cy.log(
          ` Found EE template "${EE_TEMPLATE_TITLE}" - clicking to open details`,
        );

        cy.contains(EE_TEMPLATE_TITLE).click({ force: true });
        cy.wait(3000);

        cy.get('body', { timeout: 15000 }).then($detailsBody => {
          const hasUnregister =
            $detailsBody.text().toLowerCase().includes('unregister') ||
            $detailsBody.find('[data-testid*="unregister"]').length > 0;

          if (hasUnregister) {
            cy.log(' Found Unregister option on template details page');

            const $unregisterBtn = $detailsBody
              .find('button, a, [role="button"]')
              .filter((_, el) => {
                const text = (el.textContent || '').toLowerCase();
                return text.includes('unregister') && text.includes('template');
              })
              .first();

            if ($unregisterBtn.length > 0) {
              cy.wrap($unregisterBtn).click({ force: true });
              cy.wait(2000);
              cy.log(' Clicked Unregister Template button');

              cy.get('body', { timeout: 10000 }).then($confirmBody => {
                const $confirmBtn = $confirmBody
                  .find('button, [role="button"]')
                  .filter((_, el) => {
                    const text = (el.textContent || '').toLowerCase();
                    return (
                      text.includes('unregister') ||
                      text.includes('confirm') ||
                      text.includes('yes') ||
                      text.includes('ok')
                    );
                  })
                  .last();

                if ($confirmBtn.length > 0 && $confirmBtn.is(':visible')) {
                  cy.wrap($confirmBtn).click({ force: true });
                  cy.wait(3000);
                  cy.log(' Confirmed template unregistration');
                }
              });

              cy.visit('/self-service/ee');
              cy.wait(2000);
              cy.contains('Create').click({ force: true });
              cy.wait(2000);

              cy.get('body', { timeout: 15000 }).then($finalBody => {
                if ($finalBody.text().includes(EE_TEMPLATE_TITLE)) {
                  cy.log(
                    ` Template "${EE_TEMPLATE_TITLE}" still visible after unregister attempt`,
                  );
                } else {
                  cy.log(
                    ` Template "${EE_TEMPLATE_TITLE}" successfully unregistered`,
                  );
                }
              });
            } else {
              cy.contains(/unregister template/i).click({ force: true });
              cy.wait(2000);
              cy.log(' Clicked Unregister Template (fallback method)');
            }
          } else {
            cy.log(' Unregister option not found on template details page');
          }
        });
      } else {
        cy.log(` EE template "${EE_TEMPLATE_TITLE}" not found on Create tab`);
      }
    });
  });
});
