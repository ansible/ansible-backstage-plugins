import { Common } from '../utils/common';

describe('Ansible Portal Wizard Catalog Create and execution tests', () => {
  it('Sign In to Portal', { retries: 2 }, () => {
    Common.LogintoAAP();
  });

  beforeEach(() => {
    cy.visit('/wizard/catalog');
  });

  function createWizardUseCase(
    org: string,
    inventory: string,
    scmUrl: string,
    scmBranch: string,
    playbook: string,
    useCase: string,
  ) {
    const aapUrl = Cypress.env('AAP_URL');

    // Open the Create wizard use case form and fill details
    cy.get(
      ':nth-child(1) > .MuiPaper-root > .MuiCardActions-root > .MuiBox-root > .MuiButtonBase-root',
    ).as('createCard');
    cy.get('@createCard').click();
    cy.wait(5000);

    cy.get('h1 > div > div').as('pageHeader');
    cy.get('@pageHeader').should('have.text', 'Create wizard use cases');

    cy.get('div[aria-labelledby="organization-select-label"').click();

    cy.contains('[role="option"]', org).click();

    cy.get('div[aria-labelledby="jobInventory-select-label"').click();

    cy.contains('li', inventory).click();

    cy.get('#root_scmUrl').as('scmUrl').clear().type(scmUrl);
    cy.get('@scmUrl').should('have.value', scmUrl);

    cy.get('#root_scmBranch').as('scmBranch').clear().type(scmBranch);
    cy.get('@scmBranch').should('have.value', scmBranch);

    cy.get('button[type=submit]').as('submitButton').click();

    cy.get('#root_playbook').as('playbook').clear().type(playbook);
    cy.get('@playbook').should('have.value', playbook);

    cy.get('#root_aapHostName').as('aapHostName').clear().type(aapUrl);
    cy.get('@aapHostName').should('have.value', aapUrl);

    // Submit before picking a use case - error message should appear
    cy.get('@submitButton').click();
    cy.contains('must NOT have fewer than 1 items').should('exist');

    // Pick use case and submit again
    cy.get('[id="root_useCases"]').contains(useCase).as('useCase').click();
    cy.get('@useCase')
      .contains(useCase)
      .get('[type="checkbox"]')
      .should('be.checked');

    cy.get('@submitButton').click();

    cy.get('button').contains('Create').click();

    cy.get('#root > div > main > article > div:nth-child(1) > div > p').as(
      'statusText',
    );
    cy.get('@statusText').should('have.text', 'Create wizard use cases');

    // Check that logs are not visible before opening
    cy.contains('create-project').should('not.exist');

    // Open logs and recheck
    cy.contains('button', 'Show Logs').click();
    cy.contains('create-project').should('exist');
  }

  function validateCreatedCards(cardNames: string[]) {
    const allCardsContainer =
      '#root > div > main > article > .MuiGrid-container > :nth-child(2) > :nth-child(2)';

    cardNames.forEach(card => {
      cy.get(allCardsContainer).contains(card).should('exist');
    });
  }

  it('Validates successful Wizard Catalog "Create" functionality - RHEL services', () => {
    createWizardUseCase(
      'Default',
      'Demo Inventory',
      'https://github.com/ansible/ansible-pattern-loader',
      'main',
      'seed_portal_content.yml',
      'Rhel',
    );
    cy.get('@statusText', { timeout: 70000 }).should(
      'have.text',
      'Job generic seed template executed successfully',
    );

    cy.contains('a', 'View in RH AAP')
      .as('aapButton')
      .then(button => {
        expect(button.attr('href')).to.contain(Cypress.env('AAP_URL'));
      });

    cy.get('@aapButton').click();
    cy.wait(1000);
  });

  it('Validates failed Wizard Catalog "Create" functionality - invalid playbook', () => {
    createWizardUseCase(
      'Default',
      'Demo Inventory',
      'https://github.com/ansible/ansible-pattern-loader',
      'main',
      'invalid_playbook.yml',
      'Rhel',
    );

    cy.get('@statusText', { timeout: 30000 }).should(
      'have.text',
      'Playbook not found for project.',
    );
  });

  it('Validates failed Wizard Catalog "Create" functionality - invalid source control URL', () => {
    createWizardUseCase(
      'Default',
      'Demo Inventory',
      'https://github.com/ansible/invalid-source',
      'seed_portal_content.yml',
      'main',
      'Network',
    );

    cy.get('@statusText', { timeout: 30000 }).should(
      'have.text',
      'Failed to create project',
    );
  });

  it('Validates created use cases - RHEL services', () => {
    const rhelCardNames = ['Manage RHEL services', 'Manage RHEL time servers'];

    validateCreatedCards(rhelCardNames);
  });
});
