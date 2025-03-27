import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { UseCaseMaker, AAPApiClient } from './helpers';
import { Organization, UseCase, AnsibleConfig } from '../types';

export const createShowCases = (ansibleConfig: AnsibleConfig) => {
  return createTemplateAction<{
    token: string;
    values: {
      organization: Organization;
      scmType: string;
      useCases: UseCase[];
    };
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
              scmType: {
                title: 'Source control type',
                description:
                  'The source control source type. For example, “Github”.',
                type: 'string',
              },
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
      const useCaseMaker = new UseCaseMaker({
        ansibleConfig: ansibleConfig,
        logger: logger,
        organization: input.values.organization,
        scmType: input.values.scmType,
        apiClient: apiClient,
        useCases: input.values.useCases,
      });
      try {
        await useCaseMaker.makeTemplates();
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
      ctx.output(
        'showCase',
        'Successfully created RH AAP show case templates.',
      );
    },
  });
};
