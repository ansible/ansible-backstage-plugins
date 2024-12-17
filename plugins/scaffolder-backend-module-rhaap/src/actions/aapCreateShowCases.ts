import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AAPApiClient } from './utils';
import { UseCaseMaker } from './utils/useCaseMaker';
import { Organization, UseCase, AnsibleConfig } from '../types';

export const createShowCases = (
  ansibleConfig: AnsibleConfig,
  logger: LoggerService,
) => {
  return createTemplateAction<{
    token: string;
    values: { organization: Organization; useCases: UseCase[] };
  }>({
    id: 'rhaap:create-show-cases',
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
              organization: {
                title: 'Organization',
                type: 'object',
                description: 'Organization ID',
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
              templateNames: {
                type: 'array',
                description: 'Execution environment id',
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
      const useCaseMaker = new UseCaseMaker({
        ansibleConfig: ansibleConfig,
        logger: logger,
        organization: input.values.organization,
        apiClient: apiClient,
        useCases: input.values.useCases,
        winstonLogger: winstonLogger,
      });
      try {
        await useCaseMaker.makeTemplates();
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
    },
  });
};
