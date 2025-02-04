import { Common } from '../utils/common';

describe('Ansible Portal Authentication Tests', () => {
  it('Sign In to Portal', { retries: 2 }, () => {
    Common.LogintoAAP();
  });

  it('Go to wizard catalog plugin', () => {
    cy.visit('/wizard/catalog');
    cy.wait(3000);
    cy.get(
      '#root > div > main > article > .MuiGrid-container > .MuiGrid-item > :nth-child(2)',
    ).should('contain.text', 'Create wizard use cases');
  });
});
