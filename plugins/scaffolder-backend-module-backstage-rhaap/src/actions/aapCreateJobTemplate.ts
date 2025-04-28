import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { AAPApiClient } from './helpers';
import { AnsibleConfig, JobTemplate } from '../types';

export const createJobTemplate = (ansibleConfig: AnsibleConfig) => {
  return createTemplateAction<{
    token: string;
    deleteIfExist: boolean;
    values: JobTemplate;
  }>({
    id: 'rhaap:create-job-template',
    schema: {
      input: {
        type: 'object',
        required: ['token', 'values'],
        properties: {
          token: {
            type: 'string',
          },
          deleteIfExist: {
            type: 'boolean',
            description: 'Delete project if exist',
          },
          values: {
            type: 'object',
            required: ['templateName', 'project', 'jobInventory', 'playbook'],
            properties: {
              templateName: {
                title: 'Name',
                type: 'string',
                description: 'Job template name',
              },
              templateDescription: {
                title: 'Description',
                type: 'string',
                description: 'Job template description',
              },
              scmType: {
                title: 'Source control type',
                description:
                  'The source control source type. For example, “Github”.',
                type: 'string',
              },
              project: {
                title: 'Project',
                type: 'object',
                description: 'Project data',
                required: ['id'],
                properties: {
                  id: {
                    type: 'number',
                    description: 'ID of the project',
                  },
                  name: {
                    type: 'string',
                    description: 'Name of the project',
                  },
                },
              },
              organization: {
                title: 'Organization',
                type: 'object',
                description: 'Organization',
                required: ['id'],
                properties: {
                  id: {
                    type: 'number',
                    description: 'Organization id',
                  },
                  name: {
                    type: 'string',
                    description: 'Organization name',
                  },
                },
              },
              credentials: {
                title: 'Credentials',
                type: 'object',
                description: 'Credentials',
                required: ['id'],
                properties: {
                  id: {
                    type: 'number',
                    description: 'Credential id',
                  },
                  name: {
                    type: 'string',
                    description: 'Credential name',
                  },
                  kind: {
                    type: 'string',
                    description: 'Credential Type',
                  },
                  inputs: {
                    type: 'object',
                    description: 'Credential Inputs',
                    required: ['username'],
                    properties: {
                      username: {
                        type: 'string',
                        description: 'SCM User',
                      },
                    },
                  },
                },
              },
              jobInventory: {
                title: 'Inventory',
                type: 'object',
                description:
                  'Select the inventory containing the playbook you want this job to execute.',
                required: ['id'],
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
              playbook: {
                title: 'Playbook',
                type: 'string',
                description: 'Select the playbook to be executed by this job.',
              },
              executionEnvironment: {
                title: 'Execution environment',
                type: 'object',
                description: 'Select execution environment',
                required: ['id'],
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
              extraVariables: {
                title: 'Extra variables',
                type: 'object',
                description:
                  'Optional extra variables to be applied to job template.',
              },
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          template: {
            type: 'object',
            properties: {
              id: {
                title: 'Job template id',
                type: 'number',
              },
              name: {
                title: 'Job template name',
                type: 'string',
              },
              description: {
                title: 'Job template description',
                type: 'string',
              },
              url: {
                title: 'Job template url',
                type: 'string',
              },
            },
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
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
      });
      let jobTemplateData;
      try {
        jobTemplateData = await apiClient.createJobTemplate(
          input.values,
          input.deleteIfExist,
        );
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
      ctx.output('template', jobTemplateData);
    },
  });
};
