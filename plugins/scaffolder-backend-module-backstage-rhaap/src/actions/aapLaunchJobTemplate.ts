import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AAPApiClient } from './helpers';
import { LaunchJobTemplate, AnsibleConfig } from '../types';

export const launchJobTemplate = (
  ansibleConfig: AnsibleConfig,
  logger: LoggerService,
) => {
  return createTemplateAction<{ token: string; values: LaunchJobTemplate }>({
    id: 'rhaap:launch-job-template',
    schema: {
      input: {
        type: 'object',
        required: ['token', 'values'],
        properties: {
          token: {
            type: 'string',
          },
          values: {
            type: 'object',
            required: ['template'],
            properties: {
              template: {
                type: 'object',
                properties: {
                  id: {
                    type: 'number',
                    description: 'Job template id',
                  },
                  name: {
                    type: 'string',
                    description: 'Job template name',
                  },
                },
              },
              inventory: {
                title: 'Inventory',
                type: 'object',
                properties: {
                  id: {
                    type: 'number',
                    description: 'Inventory id',
                  },
                  name: {
                    type: 'string',
                    description: 'Inventory name',
                  },
                },
              },
              credentials: {
                title: 'Credentials',
                type: 'array(object)',
                description:
                  'Credentials for accessing the nodes this job will be ran against.',
              },
              extraVariables: {
                title: 'Extra variables',
                type: 'object',
                description:
                  'Optional extra variables to be applied to job execution.',
              },
              limit: {
                title: 'Limit',
                type: 'string',
                description:
                  'Provide a host pattern to further constrain the list of hosts that will be managed or affected by the playbook. Multiple patterns are allowed. Refer to Ansible documentation for more information and examples on patterns.',
              },
              jobType: {
                title: 'Job type',
                type: 'string',
                description: ' Job type for this job template: run | check',
              },
              executionEnvironment: {
                title: 'Execution environment',
                type: 'Object',
                description: 'Execution environment',
                properties: {
                  id: {
                    type: 'number',
                    description: 'Execution environment id',
                  },
                  name: {
                    type: 'string',
                    description: 'Execution environment name',
                  },
                },
              },
              verbosity: {
                title: 'Verbosity',
                type: 'object',
                description:
                  'Control the level of output Ansible will produce as the playbook executes',
                properties: {
                  id: {
                    type: 'number',
                    description: 'Verbosity id',
                  },
                  name: {
                    type: 'string',
                    description: 'Verbosity name',
                  },
                },
              },
              forks: {
                title: 'Forks',
                type: 'number',
                description:
                  'The number of parallel or simultaneous processes to use while executing the playbook. An empty value, or a value less than 1 will use the Ansible default which is usually 5. The default number of forks can be overwritten with a change to ansible.cfg. Refer to the Ansible documentation for details about the configuration file.',
              },
              jobSliceCount: {
                title: 'Job slice count',
                type: 'number',
                description:
                  'Divide the work done by this job template into the specified number of job slices, each running the same tasks against a portion of the inventory.',
              },
              timeout: {
                title: 'Timeout',
                type: 'number',
                description:
                  'The amount of time (in seconds) to run before the job is canceled. Defaults to 0 for no job timeout.',
              },
              diffMode: {
                title: 'Diff mode',
                type: 'boolean',
                description:
                  "If enabled, show the changes made by Ansible tasks, where supported. This is equivalent to Ansible's --diff mode.",
              },
              jobTags: {
                title: 'Job tags',
                type: 'string',
                description:
                  'Tags are useful when you have a large playbook, and you want to run a specific part of a play or task. Use commas to separate multiple tags. Refer to the documentation for details on the usage of tags.',
              },
              skipTags: {
                title: 'Skip tags',
                type: 'string',
                description:
                  'Skip tags are useful when you have a large playbook, and you want to skip specific parts of a play or task. Use commas to separate multiple tags. Refer to the documentation for details on the usage of tags.',
              },
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              id: {
                title: 'Job id',
                type: 'number',
              },
              status: {
                title: 'Status',
                type: 'string',
              },
              url: {
                title: 'Job url',
                type: 'string',
              },
            },
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger: winstonLogger } = ctx;
      const token = input.token;
      if (!token?.length) {
        const error = new Error('Authorization token not provided.');
        error.stack = '';
        throw error;
      }
      const apiClient = new AAPApiClient({
        ansibleConfig,
        logger,
        token,
        winstonLogger,
      });
      let jobResult;
      try {
        jobResult = await apiClient.launchJobTemplate(input.values);
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
      ctx.output('data', jobResult);
    },
  });
};
