import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { ConfigReader } from '@backstage/config';
import { MOCK_CONFIG, MOCK_ORGANIZATION, MOCK_TOKEN } from '../mock';
import { createShowCases } from './aapCreateShowCases';
import { UseCaseMaker } from './helpers';
import { mockAnsibleService } from './mockIAAPService';
import { getAnsibleConfig } from '@ansible/backstage-rhaap-common';

describe('ansible-aap:showCases:create', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const action = createShowCases(mockAnsibleService, ansibleConfig);

  const createShowCasesData = {
    organization: MOCK_ORGANIZATION,
    scmType: 'Github',
    useCases: [
      { name: 'Use case 1', version: 'main', url: 'https://useCase1.test' },
      { name: 'Use case 2', version: 'dev', url: 'https://useCase2.test' },
      {
        name: 'Use case 3',
        version: 'someVersion',
        url: 'https://useCase3.test',
      },
    ],
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      values: createShowCasesData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create use cases', async () => {
    jest
      .spyOn(UseCaseMaker.prototype, 'makeTemplates')
      .mockImplementation(() => {
        return Promise.resolve();
      });

    await action.handler(mockContext);
    expect(mockContext.output).toHaveBeenCalledWith(
      'showCase',
      'Successfully created RH AAP show case templates.',
    );
  });

  it('should fail with message', async () => {
    jest
      .spyOn(UseCaseMaker.prototype, 'makeTemplates')
      .mockImplementation(() => {
        throw new Error('Test error message.');
      });
    let error;
    try {
      await action.handler(mockContext);
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Test error message.');
  });

  it('should fail without message', async () => {
    jest
      .spyOn(UseCaseMaker.prototype, 'makeTemplates')
      .mockImplementation(() => {
        return Promise.reject();
      });
    let error;
    try {
      await action.handler(mockContext);
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Something went wrong.');
  });
});
