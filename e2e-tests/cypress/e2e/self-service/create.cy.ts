import { Common } from '../utils/common';

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Ansible self-service Create and execution tests', () => {
  beforeEach(() => {
    cy.visit('/self-service');
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
    cy.get('[data-testid="default-generic-seed"]')
      .find(`button[data-testid=template-card-actions--create]`)
      .as('createCard');
    cy.get('@createCard').click();
    cy.wait(1000);

    // cy.get('h1 > div > div').as('pageHeader');
    // header > div > h1 > span
    cy.get('header > div > h1 > span').as('pageHeader');
    cy.get('@pageHeader').should('have.text', 'Create wizard use cases');

    cy.get('div[aria-labelledby="organization-select-label"').click();

    // Fails to find the values in the dropdown
    // only happens when running tests with `yarn e2e:self-service`
    // Takes the default value even if it is not clicked
    cy.get('li').then($elements => {
      const match = $elements.filter((_, el) => el.innerText.includes(org));
      if (match.length > 0) {
        cy.wrap(match).click();
      } else {
        cy.log(`"${org}" not found, continuing test.`);
        cy.get('body').click(0, 0);
      }
    });

    cy.get('div[aria-labelledby="jobInventory-select-label"').click();

    // Fails to find the values in the dropdown sometimes
    // Only happens when running tests with `yarn e2e:self-service`
    // Takes the default value even if it is not clicked
    cy.get('li').then($elements => {
      const match = $elements.filter((_, el) =>
        el.innerText.includes(inventory),
      );
      if (match.length > 0) {
        cy.wrap(match).click();
      } else {
        cy.log(`"${org}" not found, continuing test.`);
        cy.get('body').click(0, 0);
      }
    });

    cy.get('#root_scmUrl').as('scmUrl').clear().type(scmUrl);
    cy.get('@scmUrl').should('have.value', scmUrl);

    cy.get('#root_scmBranch').as('scmBranch').clear().type(scmBranch);
    cy.get('@scmBranch').should('have.value', scmBranch);

    cy.get('button[type=submit]').as('submitButton').click();
    cy.wait(1000);

    cy.get('#root_playbook').as('playbook').clear().type(playbook);
    cy.get('@playbook').should('have.value', playbook);

    cy.get('div[aria-labelledby="aapHostName-select-label"]').as('aapHostName');
    cy.get('@aapHostName').should('have.text', aapUrl);

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

    cy.get('header > div > h1 > span').as('statusText');
    cy.get('@statusText').should('have.text', 'Create wizard use cases');

    // Check that logs are not visible before opening
    cy.contains('create-project').should('not.exist');

    // Open logs and recheck
    cy.contains('button', 'Show Logs').click();
    cy.contains('create-project').should('exist');
  }

  function validateCreatedCards(cardNames: string[]) {
    const allCardsContainer = 'main > article > div > div > article > div';

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
      'Network',
    );
    cy.contains('p', 'Finished step Launch job template', {
      timeout: 70000,
    }).should('exist');

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

    cy.contains('p', 'Failed to send POST request', { timeout: 30000 }).should(
      'exist',
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

    cy.contains('p', 'Error creating project: failed', {
      timeout: 30000,
    }).should('exist');
  });

  it('Validates created use cases - Network services', () => {
    const networkCardNames = ['Network backup', 'Network backup restore'];

    validateCreatedCards(networkCardNames);
  });
});
