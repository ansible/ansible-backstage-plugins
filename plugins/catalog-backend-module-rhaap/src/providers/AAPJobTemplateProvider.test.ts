import { ConfigReader } from '@backstage/config';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { AAPJobTemplateProvider } from './AAPJobTemplateProvider';
import { mockAnsibleService } from '../mock/mockIAAPService';
import {
  IJobTemplate,
  ISurvey,
  InstanceGroup,
} from '@ansible/backstage-rhaap-common';

// Mock config for job template provider
const MOCK_JOB_TEMPLATE_CONFIG = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
          sync: {
            jobTemplates: {
              enabled: true,
              surveyEnabled: true,
              labels: ['test-label', 'production'],
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

// Mock job template data
const MOCK_JOB_TEMPLATE: IJobTemplate = {
  id: 1,
  type: 'job_template',
  url: '/api/v2/job_templates/1/',
  related: {
    callback: '',
    named_url: '',
    created_by: '',
    modified_by: '',
    labels: '',
    inventory: '',
    project: '',
    organization: '',
    credentials: '',
    last_job: '',
    jobs: '',
    schedules: '',
    activity_stream: '',
    launch: '',
    webhook_key: '',
    webhook_receiver: '',
    notification_templates_started: '',
    notification_templates_success: '',
    notification_templates_error: '',
    access_list: '',
    survey_spec: '',
    object_roles: '',
    instance_groups: '',
    slice_workflow_jobs: '',
    copy: '',
  },
  summary_fields: {
    organization: {
      id: 1,
      name: 'Default',
      description: 'Default organization',
    },
    inventory: {
      id: 1,
      name: 'Demo Inventory',
      description: 'Demo inventory description',
      has_active_failures: false,
      total_hosts: 0,
      hosts_with_active_failures: 0,
      total_groups: 0,
      has_inventory_sources: false,
      total_inventory_sources: 0,
      inventory_sources_with_failures: 0,
      organization_id: 1,
      kind: 'inventory',
    },
    project: {
      id: 1,
      name: 'Demo Project',
    },
    execution_environment: {
      id: 1,
      name: 'Default EE',
    },
    credentials: [],
    labels: {
      count: 2,
      results: [
        {
          id: 1,
          name: 'test-label',
          organization: 1,
          type: 'label',
          url: '/api/v2/labels/1/',
          created: '2023-01-01T00:00:00Z',
          modified: '2023-01-01T00:00:00Z',
          summary_fields: {
            created_by: {
              username: 'admin',
              first_name: 'Admin',
              last_name: 'User',
              id: 1,
            },
            modified_by: {
              username: 'admin',
              first_name: 'Admin',
              last_name: 'User',
              id: 1,
            },
            organization: {
              id: 1,
              name: 'Default',
              description: 'Default organization',
            },
          },
        },
        {
          id: 2,
          name: 'production',
          organization: 1,
          type: 'label',
          url: '/api/v2/labels/2/',
          created: '2023-01-01T00:00:00Z',
          modified: '2023-01-01T00:00:00Z',
          summary_fields: {
            created_by: {
              username: 'admin',
              first_name: 'Admin',
              last_name: 'User',
              id: 1,
            },
            modified_by: {
              username: 'admin',
              first_name: 'Admin',
              last_name: 'User',
              id: 1,
            },
            organization: {
              id: 1,
              name: 'Default',
              description: 'Default organization',
            },
          },
        },
      ],
    },
    last_job: {
      id: 1,
      name: 'Test Job',
      description: 'Test job description',
      finished: '2023-01-01T00:00:00Z',
      status: 'successful',
      failed: false,
    },
    last_update: {
      id: 1,
      name: 'Test Update',
      description: 'Test update description',
      status: 'successful',
      failed: false,
    },
    created_by: {
      id: 1,
      username: 'admin',
      first_name: 'Admin',
      last_name: 'User',
    },
    modified_by: {
      id: 1,
      username: 'admin',
      first_name: 'Admin',
      last_name: 'User',
    },
    object_roles: {
      admin_role: {
        description: 'Admin role',
        name: 'Admin',
        id: 1,
      },
      execute_role: {
        description: 'Execute role',
        name: 'Execute',
        id: 2,
      },
      read_role: {
        description: 'Read role',
        name: 'Read',
        id: 3,
      },
    },
    user_capabilities: {
      edit: true,
      delete: true,
      start: true,
      schedule: true,
      copy: true,
    },
    resolved_environment: {
      id: 1,
      name: 'Default EE',
      description: 'Default execution environment',
      image: 'quay.io/ansible/creator-ee:latest',
    },
    recent_jobs: [],
    webhook_credential: {
      id: 1,
      name: 'Test Webhook Credential',
      description: 'Test webhook credential',
      kind: 'github_token',
      cloud: false,
    },
  },
  created: '2023-01-01T00:00:00.000000Z',
  modified: '2023-01-01T00:00:00.000000Z',
  name: 'Test Job Template',
  description: 'A test job template for unit testing',
  job_type: 'run',
  inventory: 1,
  project: 1,
  playbook: 'hello_world.yml',
  scm_branch: '',
  forks: 0,
  limit: '',
  verbosity: 0,
  extra_vars: '{}',
  job_tags: '',
  skip_tags: '',
  timeout: 0,
  use_fact_cache: false,
  organization: 1,
  last_job_run: null,
  last_job_failed: false,
  next_job_run: '2023-01-02T00:00:00.000000Z',
  status: 'successful',
  host_config_key: '',
  ask_scm_branch_on_launch: false,
  ask_diff_mode_on_launch: false,
  ask_variables_on_launch: false,
  ask_limit_on_launch: false,
  ask_tags_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_job_type_on_launch: false,
  ask_verbosity_on_launch: false,
  ask_inventory_on_launch: false,
  ask_credential_on_launch: false,
  ask_execution_environment_on_launch: false,
  ask_labels_on_launch: false,
  ask_forks_on_launch: false,
  ask_job_slice_count_on_launch: false,
  ask_timeout_on_launch: false,
  ask_instance_groups_on_launch: false,
  allow_simultaneous: false,
  job_slice_count: 1,
  webhook_service: 'github',
  webhook_credential: 1,
  prevent_instance_group_fallback: false,
  diff_mode: false,
  execution_environment: 1,
  become_enabled: false,
  survey_enabled: false,
  webhook_url: '',
  webhook_key: '',
};

// Mock survey data
const MOCK_SURVEY: ISurvey = {
  name: 'Test Survey',
  description: 'A test survey for job template',
  spec: [
    {
      question_name: 'Environment',
      question_description: 'Select target environment',
      required: true,
      type: 'multiplechoice',
      variable: 'target_env',
      min: 0,
      max: 1,
      default: 'dev',
      choices: ['dev', 'staging', 'production'],
      new_question: true,
    },
    {
      question_name: 'Number of Instances',
      question_description: 'How many instances to deploy?',
      required: false,
      type: 'integer',
      variable: 'instance_count',
      min: 1,
      max: 10,
      default: 1,
      choices: '',
      new_question: false,
    },
  ],
};

class PersistingTaskRunner implements SchedulerServiceTaskRunner {
  private tasks: SchedulerServiceTaskInvocationDefinition[] = [];

  getTasks() {
    return this.tasks;
  }

  run(task: SchedulerServiceTaskInvocationDefinition): Promise<void> {
    this.tasks.push(task);
    return Promise.resolve(undefined);
  }
}

describe('AAPJobTemplateProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fromConfig', () => {
    it('should create provider instances from config', () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const providers = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      );

      expect(providers).toHaveLength(1);
      expect(providers[0].getProviderName()).toEqual(
        'AAPJobTemplateProvider:development',
      );
    });

    it('should throw error when no schedule is provided', () => {
      const configWithoutSchedule = {
        ...MOCK_JOB_TEMPLATE_CONFIG,
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  jobTemplates: {
                    surveyEnabled: true,
                    labels: ['test-label', 'production'],
                  },
                },
              },
            },
          },
        },
      };

      const config = new ConfigReader(configWithoutSchedule);
      const logger = mockServices.logger.mock();

      expect(() =>
        AAPJobTemplateProvider.fromConfig(config, mockAnsibleService, {
          logger,
        }),
      ).toThrow('No schedule provided via config');
    });
  });

  describe('getProviderName', () => {
    it('should return correct provider name', () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      expect(provider.getProviderName()).toEqual(
        'AAPJobTemplateProvider:development',
      );
    });
  });

  describe('run', () => {
    it('should fetch and process job templates successfully', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      // Mock the service response
      mockAnsibleService.syncJobTemplates.mockResolvedValue([
        {
          job: MOCK_JOB_TEMPLATE,
          survey: MOCK_SURVEY,
          instanceGroup: [],
        },
      ]);

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      expect(taskDef.id).toEqual('AAPJobTemplateProvider:development:run');

      // Execute the task
      await (taskDef.fn as () => Promise<void>)();

      expect(mockAnsibleService.syncJobTemplates).toHaveBeenCalledWith(
        true, // surveyEnabled
        ['test-label', 'production'], // jobTemplateLabels
      );

      expect(entityProviderConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: [
          {
            entity: expect.objectContaining({
              apiVersion: 'scaffolder.backstage.io/v1beta3',
              kind: 'Template',
              metadata: expect.objectContaining({
                name: 'test-job-template',
                title: 'Test Job Template',
                aapJobTemplateId: 1,
              }),
            }),
            locationKey: 'AAPJobTemplateProvider:development',
          },
        ],
      });
    });

    it('should handle multiple job templates', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const secondJobTemplate = {
        ...MOCK_JOB_TEMPLATE,
        id: 2,
        name: 'Second Job Template',
        description: 'Another test job template',
      };

      // Mock the service response with multiple job templates
      mockAnsibleService.syncJobTemplates.mockResolvedValue([
        {
          job: MOCK_JOB_TEMPLATE,
          survey: MOCK_SURVEY,
          instanceGroup: [],
        },
        {
          job: secondJobTemplate,
          survey: null,
          instanceGroup: [],
        },
      ]);

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      await (taskDef.fn as () => Promise<void>)();

      expect(entityProviderConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              metadata: expect.objectContaining({
                name: 'test-job-template',
                aapJobTemplateId: 1,
              }),
            }),
            locationKey: 'AAPJobTemplateProvider:development',
          }),
          expect.objectContaining({
            entity: expect.objectContaining({
              metadata: expect.objectContaining({
                name: 'second-job-template',
                aapJobTemplateId: 2,
              }),
            }),
            locationKey: 'AAPJobTemplateProvider:development',
          }),
        ]),
      });

      expect(
        (entityProviderConnection.applyMutation as jest.Mock).mock.calls[0][0]
          .entities,
      ).toHaveLength(2);
    });

    it('should handle errors gracefully', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      // Mock the service to throw an error
      mockAnsibleService.syncJobTemplates.mockRejectedValue(
        new Error('API Error: Failed to fetch job templates'),
      );

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      await (taskDef.fn as () => Promise<void>)();

      // Should not call applyMutation when there's an error
      expect(entityProviderConnection.applyMutation).not.toHaveBeenCalled();

      //   // Should log the error
      //   expect(logger.error).toHaveBeenCalledWith(
      //     expect.stringContaining('Error while fetching job templates'),
      //   );
    });

    it('should throw error when not initialized', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      // Try to run without connecting first
      await expect(provider.run()).rejects.toThrow('Not initialized');
    });
  });

  describe('connect', () => {
    it('should connect and schedule the task', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      expect(schedule.getTasks()).toHaveLength(1);
      expect(schedule.getTasks()[0].id).toEqual(
        'AAPJobTemplateProvider:development:run',
      );
    });
  });

  describe('configuration options', () => {
    it('should handle disabled survey configuration', async () => {
      const configWithDisabledSurvey = {
        ...MOCK_JOB_TEMPLATE_CONFIG,
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  jobTemplates: {
                    surveyEnabled: false,
                    labels: [],
                  },
                },
              },
            },
          },
        },
      };

      const config = new ConfigReader(configWithDisabledSurvey);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      mockAnsibleService.syncJobTemplates.mockResolvedValue([
        {
          job: MOCK_JOB_TEMPLATE,
          survey: null,
          instanceGroup: [],
        },
      ]);

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      await (taskDef.fn as () => Promise<void>)();

      expect(mockAnsibleService.syncJobTemplates).toHaveBeenCalledWith(
        false, // surveyEnabled = false
        [], // empty jobTemplateLabels
      );
    });

    it('should handle empty job templates response', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      // Mock empty response
      mockAnsibleService.syncJobTemplates.mockResolvedValue([]);

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      await (taskDef.fn as () => Promise<void>)();

      expect(entityProviderConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: [],
      });
    });

    it('should handle job templates with instance groups', async () => {
      const config = new ConfigReader(MOCK_JOB_TEMPLATE_CONFIG);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      const mockInstanceGroups: InstanceGroup[] = [
        {
          id: 1,
          name: 'default',
          capacity: 100,
          consumed_capacity: 0,
          max_concurrent_jobs: 0,
          max_forks: 0,
          pod_spec_override: '',
          percent_capacity_remaining: 100.0,
          is_container_group: false,
          policy_instance_list: [],
          results: [],
          summary_fields: {
            object_roles: {
              admin_role: { description: 'Admin', name: 'Admin', id: 1 },
              update_role: { description: 'Update', name: 'Update', id: 2 },
              adhoc_role: { description: 'Adhoc', name: 'Adhoc', id: 3 },
              use_role: { description: 'Use', name: 'Use', id: 4 },
              read_role: { description: 'Read', name: 'Read', id: 5 },
            },
            user_capabilities: { edit: true, delete: false },
          },
        },
        {
          id: 2,
          name: 'production',
          capacity: 200,
          consumed_capacity: 0,
          max_concurrent_jobs: 0,
          max_forks: 0,
          pod_spec_override: '',
          percent_capacity_remaining: 100.0,
          is_container_group: false,
          policy_instance_list: [],
          results: [],
          summary_fields: {
            object_roles: {
              admin_role: { description: 'Admin', name: 'Admin', id: 1 },
              update_role: { description: 'Update', name: 'Update', id: 2 },
              adhoc_role: { description: 'Adhoc', name: 'Adhoc', id: 3 },
              use_role: { description: 'Use', name: 'Use', id: 4 },
              read_role: { description: 'Read', name: 'Read', id: 5 },
            },
            user_capabilities: { edit: true, delete: false },
          },
        },
      ];

      // Mock the service response with instance groups
      mockAnsibleService.syncJobTemplates.mockResolvedValue([
        {
          job: MOCK_JOB_TEMPLATE,
          survey: MOCK_SURVEY,
          instanceGroup: mockInstanceGroups,
        },
      ]);

      const provider = AAPJobTemplateProvider.fromConfig(
        config,
        mockAnsibleService,
        {
          logger,
          schedule,
        },
      )[0];

      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      await provider.connect(entityProviderConnection);

      const taskDef = schedule.getTasks()[0];
      expect(taskDef.id).toEqual('AAPJobTemplateProvider:development:run');

      // Execute the task
      await (taskDef.fn as () => Promise<void>)();

      expect(mockAnsibleService.syncJobTemplates).toHaveBeenCalledWith(
        true, // surveyEnabled
        ['test-label', 'production'], // jobTemplateLabels
      );

      expect(entityProviderConnection.applyMutation).toHaveBeenCalledWith({
        type: 'full',
        entities: [
          {
            entity: expect.objectContaining({
              kind: 'Template',
              metadata: expect.objectContaining({
                name: 'test-job-template',
              }),
            }),
            locationKey: 'AAPJobTemplateProvider:development',
          },
        ],
      });
    });
  });
});
