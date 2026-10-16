import { MOCK_ORGANIZATION } from './mockOrganization';

export const MOCK_EXECUTION_ENVIRONMENT = {
  id: 1,
  url: 'https/testEnv.url',
  environmentName: 'Test environment',
  environmentDescription: 'Test environment description',
  organization: MOCK_ORGANIZATION,
  image: 'some.image',
  pull: 'always',
};

export const MOCK_NEW_EXECUTION_ENVIRONMENT_POST_DATA = {
  environmentName: 'Test environment',
  environmentDescription: 'Test environment description',
  organization: MOCK_ORGANIZATION,
  image: 'some.image',
  pull: 'always',
};
