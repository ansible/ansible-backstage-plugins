import { createProjectAction } from './aapCreateProject';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { MOCK_ORGANIZATION, MOCK_TOKEN } from '../mock';
import { Project } from '@ansible/backstage-rhaap-common';
import { mockAnsibleService } from './mockIAAPService';

describe('ansible-aap:project:create', () => {
  const action = createProjectAction(mockAnsibleService);

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

  mockContext.output = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create project', async () => {
    const expectedProject = {
      ...projectData,
      url: 'https/testProject.ur',
      id: 1,
    };

    mockAnsibleService.createProject.mockResolvedValue(expectedProject);

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('project', expectedProject);
  });

  it('should fail with message', async () => {
    mockAnsibleService.createProject.mockRejectedValue(
      new Error('Test error message.'),
    );

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
    mockAnsibleService.createProject.mockRejectedValue(undefined);

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
