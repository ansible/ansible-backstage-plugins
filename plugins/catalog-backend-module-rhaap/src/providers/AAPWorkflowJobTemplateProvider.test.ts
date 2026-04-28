import { ConfigReader } from '@backstage/config';
import { SchedulerServiceTaskInvocationDefinition } from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { AAPWorkflowJobTemplateProvider } from './AAPWorkflowJobTemplateProvider';
import { mockAnsibleService } from '../mock/mockIAAPService';
import { IWorkflowJobTemplate, ISurvey } from '@ansible/backstage-rhaap-common';

const MOCK_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            workflowJobTemplates: {
              enabled: true,
              schedule: {
                frequency: { minutes: 30 },
                timeout: { minutes: 3 },
              },
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://rhaap.test',
      token: 'testtoken',
      checkSSL: false,
    },
  },
};

const MOCK_WF: IWorkflowJobTemplate = {
  id: 50,
  name: 'Demo Workflow',
  description: 'Integration test WFJT',
  type: 'workflow_job_template',
  url: '/api/controller/v2/workflow_job_templates/50/',
  survey_enabled: false,
  related: {},
  summary_fields: {
    organization: {
      id: 1,
      name: 'Default',
      description: '',
    },
    labels: {
      count: 0,
      results: [],
    },
  },
};

class PersistingTaskRunner {
  private tasks: SchedulerServiceTaskInvocationDefinition[] = [];

  getTasks() {
    return this.tasks;
  }

  run(task: SchedulerServiceTaskInvocationDefinition): Promise<void> {
    this.tasks.push(task);
    return Promise.resolve(undefined);
  }
}

describe('AAPWorkflowJobTemplateProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch workflow job templates and emit Template entities', async () => {
    const config = new ConfigReader(MOCK_CONFIG);
    mockAnsibleService.syncWorkflowJobTemplates.mockResolvedValue([
      { workflow: MOCK_WF, survey: null as ISurvey | null },
    ]);

    const logger = mockServices.logger.mock();
    const schedule = new PersistingTaskRunner();

    const providers = AAPWorkflowJobTemplateProvider.fromConfig(
      config,
      mockAnsibleService,
      {
        logger,
        schedule,
      },
    );

    expect(providers).toHaveLength(1);
    expect(providers[0].getProviderName()).toBe(
      'AAPWorkflowJobTemplateProvider:development',
    );

    const applyMutation = jest.fn();
    const connection = {
      applyMutation,
      refresh: jest.fn(),
    } as unknown as EntityProviderConnection;

    await providers[0].connect(connection);

    const taskDef = schedule.getTasks()[0];
    expect(taskDef.id).toEqual(
      'AAPWorkflowJobTemplateProvider:development:run',
    );

    await taskDef.fn(new AbortController().signal);

    expect(mockAnsibleService.syncWorkflowJobTemplates).toHaveBeenCalledWith(
      undefined,
      [],
      [],
    );
    expect(applyMutation).toHaveBeenCalledWith({
      type: 'full',
      entities: [
        expect.objectContaining({
          entity: expect.objectContaining({
            kind: 'Template',
            metadata: expect.objectContaining({
              name: 'demo-workflow-wf-50',
              title: 'Demo Workflow',
              aapWorkflowJobTemplateId: 50,
            }),
            spec: expect.objectContaining({
              type: 'workflow-job-template',
              steps: [
                expect.objectContaining({
                  action: 'rhaap:launch-workflow-job-template',
                }),
              ],
            }),
          }),
          locationKey: 'AAPWorkflowJobTemplateProvider:development',
        }),
      ],
    });
  });
});
