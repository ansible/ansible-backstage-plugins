import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Authentication Tests', () => {
  it('Go to self-service plugin', () => {
    cy.visit('/self-service');
    cy.wait(3000);
    cy.get('header > div > h1 > span').should('contain.text', 'Templates');
  });
});
