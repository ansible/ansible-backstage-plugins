import { Common } from '../utils/common';

describe('Ansible self-service Authentication Tests', () => {
  it('Sign In to self-service and verify access', { retries: 2 }, () => {
    Common.LogintoAAPWithSession();
    cy.visit('/self-service');
    cy.wait(3000);
    cy.get('header > div > h1 > span').should('contain.text', 'Templates');
  });
});
