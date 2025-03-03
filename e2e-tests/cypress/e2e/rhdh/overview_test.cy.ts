import { Common } from '../utils/common';

describe('Developer Hub ansible plugin tests', () => {
  before(() => {
    Common.SignIntoRHDHusingGithub();
  });

  it('Visits overview tab  check all links there', () => {
    const ahuburl = Cypress.env('ahuburl');
    const devspaceurl = Cypress.env('devspacesurl');
    const aucontroller = Cypress.env('automationcontroller');

    cy.log(devspaceurl);
    cy.log(ahuburl);
    cy.log(aucontroller);
    cy.contains('Start Learning Path').click();
    cy.url().should('include', '/learn');
    cy.go('back');
    cy.get('[id^=panelDiscover]')
      .contains('2. DISCOVER EXISTING COLLECTIONS')
      .click();
    if (ahuburl != null) {
      cy.contains('a', 'Go to Automation Hub').should(
        'have.attr',
        'href',
        ahuburl,
      );
    } else {
      cy.contains('a', 'Go to Automation Hub').should(
        'have.attr',
        'href',
        'https://console.redhat.com/ansible/automation-hub/',
      );
    }

    cy.contains('a', 'View documentation')
      .first()
      .should('have.attr', 'href', 'https://red.ht/aap-pah-managing-content');

    cy.get('[id=panelCreate-header]').click();

    cy.contains('Create Ansible Git Project').click();
    cy.url().should('include', '/create');
    cy.go('back');

    cy.get('[id=panelDevelop-header]').click();

    if (devspaceurl != '') {
      cy.contains('a', 'Go to OpenShift Dev Spaces Dashboard').should(
        'have.attr',
        'href',
        devspaceurl,
      );
    } else {
      cy.contains('a', 'Go to OpenShift Dev Spaces Dashboard').should(
        'have.attr',
        'href',
        'https://red.ht/aap-developer-tools/',
      );
    }

    cy.get('[id=panelOperate-header]').click();

    if (aucontroller != '') {
      cy.contains('a', 'Go to Ansible Automation Platform').should(
        'have.attr',
        'href',
        aucontroller,
      );
    } else {
      cy.contains('a', 'Go to Ansible Automation Platform').should(
        'have.attr',
        'href',
        'https://www.redhat.com/en/technologies/management/ansible/trial',
      );
    }

    //cy.contains("a","View documentation").last().should( "have.attr","href", "https://red.ht/aap-docs")

    cy.get('[id^=panelUseful]').contains('USEFUL LINKS').click();

    cy.contains('a', 'Ansible developer tools').should(
      'have.attr',
      'href',
      'https://red.ht/aap-developer-tools',
    );
    cy.contains('a', 'Ansible content creator guide').should(
      'have.attr',
      'href',
      'https://red.ht/aap-creator-guide',
    );
    cy.contains('a', 'Ansible definitions').should(
      'have.attr',
      'href',
      'https://docs.ansible.com/ansible/latest/reference_appendices/glossary.html',
    );
  });
});
