import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Browse Page Functional Tests', () => {
  beforeEach(() => {
    // Visit the page
    cy.visit('/self-service');
  });

  it('Validates the search bar functionality', () => {
    cy.get('[aria-label="search"]').as('searchBar');
    cy.get('[aria-label="clear search"]').as('clearButton');

    cy.get('@searchBar').type('Create wizard use cases');
    cy.get('[data-testid="default-generic-seed"]').should(
      'contain.text',
      'Create wizard use cases',
    );

    cy.get('@clearButton').click();
    cy.get('@searchBar').should('have.value', '');

    // Negative Scenario for search functionality
    cy.get('@searchBar').type('random-string');

    // No cards should be visible after random search.
    cy.get('main > article > div > :nth-child(2)').should(
      'contain.text',
      'No templates found that match your filter. Learn more about adding templates, Opens in a new window.',
    );

    cy.get('@clearButton').click();
    cy.get('@searchBar').should('have.value', '');
  });

  it('Validates checkboxes on the Page', () => {
    cy.get('[id="categories-picker"]').should('exist');
  });

  it('Validates the Create button functionality and its corresponding destination URL', () => {
    cy.get(`[data-testid="default-generic-seed"]`)
      .find(`button[data-testid=template-card-actions--create]`)
      .click();
    cy.url().should(
      'include',
      '/self-service/create/templates/default/generic-seed',
    );

    cy.go('back');
    cy.wait(500);
  });

  it('Validates the Add to favorites button functionality', () => {
    const cardTitle = 'Create wizard use cases';

    cy.get('[id="favorite-template-default-generic-seed"]').click();

    cy.get('[data-testid="user-picker-starred"]').click();

    cy.get('[data-testid="default-generic-seed"]')
      .contains(cardTitle)
      .should('exist');

    // Remove from favorites
    cy.get('[id="favorite-template-default-generic-seed"]').click();
  });
});
