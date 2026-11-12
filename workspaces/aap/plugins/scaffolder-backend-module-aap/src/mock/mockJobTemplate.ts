import { MOCK_PROJECT } from './mockProject';
import { MOCK_ORGANIZATION } from './mockOrganization';
import { MOCK_INVENTORY } from './mockInevnory';
import { MOCK_EXECUTION_ENVIRONMENT } from './mockExecutionEnvironment';
import { MOCK_BASE_URL, MOCK_TOKEN } from './mockData';
import { MOCK_NEW_SCM_CREDENTIAL_DATA } from './mockScmCredential';

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
    aap_hostname: MOCK_BASE_URL,
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

export const MOCK_NEW_JOB_TEMPLATE_POST_DATA = {
  templateName: 'Test template',
  templateDescription: 'Test template description',
  scmType: 'Github',
  project: MOCK_PROJECT,
  organization: MOCK_ORGANIZATION,
  jobInventory: MOCK_INVENTORY,
  playbook: 'Test playbook',
  executionEnvironment: MOCK_EXECUTION_ENVIRONMENT,
  extraVariables: {
    aap_hostname: MOCK_BASE_URL,
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

export const MOCK_JOB_TEMPLATE_LAUNCH_DATA = {
  template: MOCK_JOB_TEMPLATE.templateName,
  jobType: 'run',
  inventory: MOCK_INVENTORY,
  executionEnvironment: MOCK_EXECUTION_ENVIRONMENT,
  jobSliceCount: 1,
  timeout: 0,
  diffMode: false,
  extraVariables: {
    var1: 'test1',
    var2: 'test2',
  },
  jobTags: 'jobTag',
  skipTags: 'skipTage',
};
