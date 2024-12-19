import { createProjectAction } from './aapCreateProject';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { MOCK_CONFIG, MOCK_ORGANIZATION, MOCK_TOKEN } from '../mock';
import { getAnsibleConfig } from '../config-reader';
import { Project } from '../types';
import { AAPApiClient } from './helpers';

describe('ansible-aap:project:create', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const logger = mockServices.logger.mock();
  const action = createProjectAction(ansibleConfig, logger);

  const projectData: Project = {
    projectName: 'Test project',
    projectDescription: 'Test project description',
    organization: MOCK_ORGANIZATION,
    scmUrl: 'https://github.com/testu/seedseed',
    scmBranch: 'main',
    scmUpdateOnLaunch: true,
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      deleteIfExist: true,
      values: projectData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create project', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createProject')
      .mockImplementation((payload: Project, _deleteIfExists: boolean) => {
        const projectReturnData = payload;
        projectReturnData.url = 'https/testProject.ur';
        projectReturnData.id = 1;
        return Promise.resolve(projectReturnData);
      });

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('project', {
      projectName: 'Test project',
      projectDescription: 'Test project description',
      organization: { id: 1, name: 'Default organization' },
      scmUrl: 'https://github.com/testu/seedseed',
      scmBranch: 'main',
      scmUpdateOnLaunch: true,
      url: 'https/testProject.ur',
      id: 1,
    });
  });

  it('should fail with message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createProject')
      .mockImplementation((_payload: Project, _deleteIfExists: boolean) => {
        throw new Error('Test error message.');
      });
    let error;
    try {
      // @ts-ignore
      await action.handler({ ...mockContext });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Test error message.');
  });

  it('should fail without message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createProject')
      .mockImplementation((_payload: Project, _deleteIfExists: boolean) => {
        return Promise.reject();
      });
    let error;
    try {
      // @ts-ignore
      await action.handler({ ...mockContext });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Something went wrong.');
  });

  it('should fail invalid token', async () => {
    let error;
    mockContext.input.token = '';
    try {
      // @ts-ignore
      await action.handler({ ...mockContext });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Authorization token not provided.');
  });
});
