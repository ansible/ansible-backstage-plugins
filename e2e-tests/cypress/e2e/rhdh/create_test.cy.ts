import { Common } from '../utils/common';

describe('Developer Hub ansible plugin tests', () => {
  before(() => {
    Common.SignIntoRHDHusingGithub();
  });

  it('Visits Create tab   and check all links there', () => {
    cy.get('[data-testid="header-tab-2"]').click();
  });
});
