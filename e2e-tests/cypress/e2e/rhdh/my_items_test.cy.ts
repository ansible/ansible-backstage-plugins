import { Common } from '../utils/common';

describe('Developer Hub ansible plugin tests', () => {
  before(() => {
    Common.SignIntoRHDHusingGithub();
  });

  it('Visits My Items tab   and check all links there', () => {
    cy.get('[data-testid="header-tab-1"]').click();
    cy.url().should('include', '/myitems');
    cy.wait(5000);
    cy.get('li[role="menuitem"]').eq(0).should('have.text', 'Starred 0');
    cy.get('[title="Add to favorites"]')
      .first()
      .within(() => {
        cy.get('span').should('be.visible').click({ force: true });
      });
    cy.get('li[role="menuitem"]').eq(0).should('have.text', 'Starred 1');
    cy.get('[title="Remove from favorites"]')
      .first()
      .within(() => {
        cy.get('span').should('be.visible').click({ force: true });
      });
    cy.get('li[role="menuitem"]').eq(0).should('have.text', 'Starred 0');
    cy.contains('a', 'Edit')
      .should('have.attr', 'href')
      .and('include', 'github');
  });
});
