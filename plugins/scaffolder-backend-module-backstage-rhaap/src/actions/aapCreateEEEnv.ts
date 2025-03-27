import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { AAPApiClient } from './helpers';
import { ExecutionEnvironment, AnsibleConfig } from '../types';

export const createExecutionEnvironment = (ansibleConfig: AnsibleConfig) => {
  return createTemplateAction<{
    token: string;
    deleteIfExist: boolean;
    values: ExecutionEnvironment;
  }>({
    id: 'rhaap:create-execution-environment',
    schema: {
      input: {
        type: 'object',
        required: ['token', 'values'],
        properties: {
          token: {
            type: 'string',
            description: 'Oauth2 token',
          },
          deleteIfExist: {
            type: 'boolean',
            description: 'Delete project if exist',
          },
          values: {
            type: 'object',
            required: ['environmentName', 'image', 'organization'],
            environmentName: {
              title: 'Name',
              type: 'string',
              description: 'Execution environment name',
            },
            environmentDescription: {
              title: 'Description',
              type: 'string',
              description: 'Execution environment description',
            },
            organization: {
              title: 'Organization',
              type: 'object',
              description: 'Organization',
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
            image: {
              title: 'Image',
              type: 'string',
              description:
                'The full image location, including the container registry, image name, and version tag.',
            },
            pull: {
              title: 'Image pull policy',
              type: 'string',
              description:
                'Image pull policy. Allowed values: "always", "missing", "never".',
              default: 'missing',
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          executionEnvironment: {
            type: 'object',
            properties: {
              id: {
                title: 'Execution environment id',
                type: 'number',
              },
              name: {
                title: 'Execution environment name',
                type: 'string',
              },
              description: {
                title: 'Execution environment description',
                type: 'string',
              },
              url: {
                title: 'Execution environment url',
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
      let eeData;
      try {
        eeData = await apiClient.createExecutionEnvironment(
          input.values,
          input.deleteIfExist,
        );
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
      ctx.output('executionEnvironment', eeData);
    },
  });
};
