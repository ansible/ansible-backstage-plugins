import { authenticator } from 'otplib';
export class Common {
  static LogintoGithub() {
    cy.visit('https://github.com/login');
    cy.contains('Sign in').then(() => {
      cy.get('#login_field').type(Cypress.env('GH_USER_ID'), {
        delay: 100,
      });
      cy.get('#password').type(Cypress.env('GH_USER_PASS'), {
        log: false,
        delay: 100,
      });
      cy.get('[value="Sign in"]').click();
      // Enable 2FA
      cy.get('#app_totp').type(
        authenticator.generate(Cypress.env('AUTHENTICATOR_SECRET')),
        { log: false },
      );
    });
  }

  static SignIntoRHDHusingGithub() {
    this.LogintoGithub();
    cy.visit('/');
    cy.wait(5000);
    cy.get('body').then($body => {
      if (
        $body.find('li:nth-child(2) > div > .MuiCardActions-root-220 > button')
          .length > 0
      ) {
        cy.contains('Sign In').invoke('removeAttr', 'target').click();
        cy.wait(5000);
        cy.get('body').then($body => {
          if ($body.text().includes('Authorize')) {
            cy.get(
              'body > div.logged-in.env-production.page-responsive.color-bg-subtle > div.application-main > main > div > div.px-3.mt-5 > div.Box.color-shadow-small > div.Box-footer.p-3.p-md-4.clearfix > div:nth-child(1) > form > div > button.js-oauth-authorize-btn.btn.btn-primary.width-full.ws-normal',
            ).click();
            cy.wait(3000);
          }
          cy.contains('Ansible').click();
          cy.url().should('include', '/ansible');
          cy.wait(5000);
        });
      }
    });
  }

  static LogintoAAP() {
    cy.wait(200); // Reduced to minimum
    cy.visit('/');
    cy.wait(3000); // Reduced further
    cy.get('body').then($body => {
      if ($body.text().includes('Select a Sign-in method')) {
        cy.contains('Sign In').invoke('removeAttr', 'target').click();
        cy.wait(3000); // Reduced further
        cy.get('body').then($body => {
          cy.wait(200); // Minimal wait
          if ($body.text().includes('Log in to your account')) {
            cy.wait(50); // Minimal wait
            cy.get('#pf-login-username-id').type(Cypress.env('AAP_USER_ID'), {
              delay: 0, // No delay
            });
            cy.wait(50); // Minimal wait
            cy.get('#pf-login-password-id').type(Cypress.env('AAP_USER_PASS'), {
              log: false,
              delay: 0, // No delay
            });
            cy.wait(50); // Minimal wait
            cy.get('[aria-label="Show password"]').click();
            cy.get('[aria-label="Hide password"]').click();
            cy.get('button').contains('Log in').as('login');
            cy.wait(100); // Minimal wait
            cy.get('@login').click();
            cy.wait(1000); // Reduced significantly
          }
        });
        cy.wait(500); // Reduced from 1000
        cy.get('body').then($body => {
          if (
            $body.text().includes('Authorize Ansible Automation Experience App')
          ) {
            cy.get('input').contains('Authorize').click();
            cy.wait(1500); // Reduced from 3000
          }
        });
        cy.visit('/');
        cy.wait(1000); // Reduced from 2000
        cy.get('header')
          .contains('Templates', { timeout: 15000 })
          .should('exist');
      }
    });
  }

  static LogintoAAPWithSession() {
    cy.session(
      'aap-user-session',
      () => {
        // Use optimized login for session creation
        cy.wait(500);
        cy.visit('/');
        cy.wait(5000);
        cy.get('body').then($body => {
          if ($body.text().includes('Select a Sign-in method')) {
            cy.contains('Sign In').invoke('removeAttr', 'target').click();
            cy.wait(5000);
            cy.get('body').then($body => {
              cy.wait(500);
              if ($body.text().includes('Log in to your account')) {
                cy.wait(100);
                cy.get('#pf-login-username-id').type(
                  Cypress.env('AAP_USER_ID'),
                  {
                    delay: 50,
                  },
                );
                cy.wait(100);
                cy.get('#pf-login-password-id').type(
                  Cypress.env('AAP_USER_PASS'),
                  {
                    log: false,
                    delay: 50,
                  },
                );
                cy.wait(100);
                cy.get('[aria-label="Show password"]').click();
                cy.get('[aria-label="Hide password"]').click();
                cy.get('button').contains('Log in').as('login');
                cy.wait(250);
                cy.get('@login').click();
                cy.wait(2000);
              }
            });
            cy.wait(1000);
            cy.get('body').then($body => {
              if (
                $body
                  .text()
                  .includes('Authorize Ansible Automation Experience App')
              ) {
                cy.get('input').contains('Authorize').click();
                cy.wait(3000);
              }
            });
            // Navigate to home to complete session setup
            cy.visit('/');
            cy.wait(2000);
            // Just ensure we're not on a login page anymore
            cy.get('body').should(
              'not.contain.text',
              'Select a Sign-in method',
            );
          }
        });
      },
      {
        validate: () => {
          // Simple validation: check if we're authenticated by visiting root
          cy.visit('/');
          cy.wait(2000);
          // Check that we're not on a login page
          cy.get('body').should('not.contain.text', 'Select a Sign-in method');
        },
        cacheAcrossSpecs: true,
      },
    );

    // Always visit home after session restore to ensure we're in correct state
    cy.visit('/');
    cy.wait(1000);
  }
}
