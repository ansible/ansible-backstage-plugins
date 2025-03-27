import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { CleanUp, AnsibleConfig } from '../types';
import { AAPApiClient } from './helpers';

export const cleanUp = (ansibleConfig: AnsibleConfig) => {
  return createTemplateAction<{ token: string; values: CleanUp }>({
    id: 'rhaap:clean-up',
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
            properties: {
              project: {
                type: 'object',
                description: 'Project',
                required: ['id'],
                properties: {
                  id: {
                    type: 'number',
                    description: 'Project id',
                  },
                  name: {
                    type: 'string',
                    description: 'Project name',
                  },
                },
              },
              executionEnvironment: {
                type: 'object',
                description: 'Execution environment',
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
              template: {
                type: 'object',
                description: 'Job template',
                required: ['id'],
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
      try {
        await apiClient.cleanUp({
          project: input.values.project,
          executionEnvironment: input.values.executionEnvironment,
          template: input.values.template,
        });
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }

      ctx.output('cleanUp', 'Successfully removed data from RH AAP.');
    },
  });
};
