import { createExecutionEnvironment } from './actions/aapCreateEEEnv';
import { createJobTemplate } from './actions/aapCreateJobTemplate';
import { createProjectAction } from './actions/aapCreateProject';
import { scaffolderModuleAap } from './module';

jest.mock('./actions/aapCreateEEEnv', () => ({
  createExecutionEnvironment: jest.fn(() => 'execution-environment-action'),
}));
jest.mock('./actions/aapCreateJobTemplate', () => ({
  createJobTemplate: jest.fn(() => 'job-template-action'),
}));
jest.mock('./actions/aapCreateProject', () => ({
  createProjectAction: jest.fn(() => 'project-action'),
}));

describe('scaffolderModuleAap', () => {
  it('registers its AAP actions with the Scaffolder backend', async () => {
    const scaffolder = { addActions: jest.fn() };
    const ansibleService = {};
    const registrations = (scaffolderModuleAap as any).getRegistrations();

    await registrations[0].init.func({ scaffolder, ansibleService });

    expect(createProjectAction).toHaveBeenCalledWith(ansibleService);
    expect(createExecutionEnvironment).toHaveBeenCalledWith(ansibleService);
    expect(createJobTemplate).toHaveBeenCalledWith(ansibleService);
    expect(scaffolder.addActions).toHaveBeenCalledWith(
      'project-action',
      'execution-environment-action',
      'job-template-action',
    );
  });
});
