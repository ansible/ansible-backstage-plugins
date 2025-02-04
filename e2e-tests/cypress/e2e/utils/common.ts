import { authenticator } from 'otplib';
export class Common {
  static LogintoGithub() {
    cy.visit('https://github.com/login');
    cy.contains('Sign in').then(() => {
      cy.get('#login_field').type(Cypress.env('GH_USER_ID'));
      cy.get('#password').type(Cypress.env('GH_USER_PASS'), { log: false });
      cy.get('[value="Sign in"]').click();
      // Enable 2FA
      cy.get('#app_totp').type(
        authenticator.generate(Cypress.env('AUTHENTICATOR_SECRET')),
        { log: false },
      );
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
          cy.visit('/');
          cy.get('nav').contains('Settings').should('exist');
        });
      }
    });
  }
}
