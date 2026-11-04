import {
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  launchJobTemplate,
} from './actions';
import * as filters from './filters';

describe('AAP scaffolder contract', () => {
  it('preserves the five rhaap action IDs', () => {
    const service = {} as any;
    const config = { getString: () => '' } as any;

    expect([
      createProjectAction(service).id,
      createExecutionEnvironment(service).id,
      createJobTemplate(service).id,
      launchJobTemplate(service, config).id,
      cleanUp(service).id,
    ]).toEqual([
      'rhaap:create-project',
      'rhaap:create-execution-environment',
      'rhaap:create-job-template',
      'rhaap:launch-job-template',
      'rhaap:clean-up',
    ]);
  });

  it('exports exactly the four AAP template filters', () => {
    expect(Object.keys(filters).sort()).toEqual([
      'multiResourceFilter',
      'resourceFilter',
      'useCaseNameFilter',
      'uuidFilter',
    ]);
  });
});
