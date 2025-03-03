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
    cy.wait(1000);
    cy.visit('/');
    cy.wait(7000);
    cy.get('body').then($body => {
      if (
        $body.find('li:nth-child(2) > div > .MuiCardActions-root-220 > button')
          .length > 0
      ) {
        cy.contains('Sign In').invoke('removeAttr', 'target').click();
        cy.wait(7000);
        cy.get('body').then($body => {
          cy.wait(1000);
          if ($body.text().includes('Log in to your account')) {
            cy.wait(200);
            cy.get('#pf-login-username-id').type(Cypress.env('AAP_USER_ID'), {
              delay: 100,
            });
            cy.wait(200);
            cy.get('#pf-login-password-id').type(Cypress.env('AAP_USER_PASS'), {
              log: false,
              delay: 100,
            });
            cy.wait(200);
            cy.get('[aria-label="Show password"]').click();
            cy.get('[aria-label="Hide password"]').click();
            cy.get('button').contains('Log in').as('login');
            cy.wait(500);
            cy.get('@login').click();
            cy.wait(3000);
          }
        });
        cy.wait(2000);
        cy.get('body').then($body => {
          if (
            $body.text().includes('Authorize Ansible Automation Experience App')
          ) {
            cy.get('input').contains('Authorize').click();
            cy.wait(5000);
          }
        });
        cy.visit('/');
        cy.get('nav').contains('Settings').should('exist');
      }
    });
  }
}
