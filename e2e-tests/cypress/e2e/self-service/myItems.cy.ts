import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Wizard Catalog My Items Page Functional Tests', () => {
  beforeEach(() => {
    // Visit the page
    cy.visit('/self-service/create/tasks');
  });

  it('Validates the page header', () => {
    cy.get('[data-testid="taskHeader"]').as('pageHeader');
    cy.get('@pageHeader').should('have.text', 'Task List');
  });

  it('Validates the Owner dropdown options', () => {
    const ownerContainer = '[data-testid="select-owner"]';

    cy.get(ownerContainer).click().should('contain.text', 'All');

    cy.get('button').contains('Clear all').as('clearButton');

    const ownerOptions = ['All', 'My'];

    ownerOptions.forEach(option => {
      cy.get('li').should('contain.text', option);
    });

    cy.contains('li', 'All').click();
    cy.get(ownerContainer).should('contain.text', 'All');
    cy.get('[data-testid="select-owner"] > input').should(
      'have.attr',
      'value',
      'all',
    );

    cy.get('@clearButton').click();

    cy.get(ownerContainer).click();

    cy.contains('li', 'My').click();
    cy.get(ownerContainer).should('contain.text', 'My');
    cy.get('[data-testid="select-owner"] > input').should(
      'have.attr',
      'value',
      'owned',
    );

    cy.get('@clearButton').click();
    cy.get(ownerContainer).should('contain.text', '');
  });

  it('Validates the column headers correctly in the table', () => {
    cy.get('table').within(() => {
      cy.contains('Task ID').should('be.visible');
      cy.contains('Template').should('be.visible');
      cy.contains('Created at').should('be.visible');
      cy.contains('Owner').should('be.visible');
      cy.contains('Status').should('be.visible');
    });
  });

  it('Validates the pagination controls correctly', () => {
    cy.get('[data-testid="tableToolBar"]').should('be.visible');
    cy.contains('Rows per page').should('be.visible');

    cy.get('[aria-label="first page"]').should('have.attr', 'type', 'button');
    cy.get('[aria-label="previous page"]').should(
      'have.attr',
      'type',
      'button',
    );
    cy.get('[aria-label="next page"]').should('have.attr', 'type', 'button');
    cy.get('[aria-label="last page"]').should('have.attr', 'type', 'button');
  });
});
