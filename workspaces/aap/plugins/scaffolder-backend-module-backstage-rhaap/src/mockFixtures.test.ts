/* eslint-disable jest/no-export -- test fixtures imported by neighboring suites. */
export const MOCK_TOKEN = 'mock-token';

export const MOCK_ORGANIZATION = {
  id: 1,
  name: 'Default organization',
};

export const MOCK_INVENTORY = {
  id: 1,
  name: 'Test inventory',
};

export const MOCK_PROJECT = {
  id: 1,
  url: 'https/testProject.ur',
  projectName: 'Test project',
  projectDescription: 'Test project description',
  organization: MOCK_ORGANIZATION,
  scmUrl: 'https://github.com/testu/seedseed',
  scmBranch: 'main',
  scmUpdateOnLaunch: true,
};

export const MOCK_EXECUTION_ENVIRONMENT = {
  id: 1,
  url: 'https/testEnv.url',
  environmentName: 'Test environment',
  environmentDescription: 'Test environment description',
  organization: MOCK_ORGANIZATION,
  image: 'some.image',
  pull: 'always',
};

export const MOCK_NEW_SCM_CREDENTIAL_DATA = {
  id: 1,
  name: 'mock credential',
  kind: 'scm',
  inputs: {
    username: 'mock user',
  },
};

export const MOCK_JOB_TEMPLATE = {
  id: 1,
  templateName: 'Test template',
  templateDescription: 'Test template description',
  scmType: 'Github',
  project: MOCK_PROJECT,
  organization: MOCK_ORGANIZATION,
  jobInventory: MOCK_INVENTORY,
  playbook: 'Test playbook',
  executionEnvironment: MOCK_EXECUTION_ENVIRONMENT,
  extraVariables: {
    aap_hostname: 'https://rhaap.test',
    aap_token: MOCK_TOKEN,
    usecases: [
      {
        name: 'pattern name',
        url: 'https://github.com/pattern/repo',
        version: 'main',
      },
    ],
  },
  credentials: MOCK_NEW_SCM_CREDENTIAL_DATA,
};

describe('scaffolder test fixtures', () => {
  it('provides a non-empty mock token', () => {
    expect(MOCK_TOKEN).toBeTruthy();
  });
});
