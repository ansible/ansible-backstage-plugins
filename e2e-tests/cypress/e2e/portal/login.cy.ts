import { Common } from '../utils/common';

describe('Portal Login', () => {
  it('Sign In to Portal', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible Portal Authentication Tests', () => {
  it('Go to portal plugin', () => {
    cy.visit('/portal');
    cy.wait(3000);
    cy.get('header > div > h1 > span').should('contain.text', 'Templates');
  });
});
