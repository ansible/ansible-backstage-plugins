import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { UseCaseMaker } from './helpers';
import { IAAPService, AnsibleConfig } from '@ansible/backstage-rhaap-common';
import { createShowCasesValuesSchema } from './schemas/rhaapActionSchemas';

export const createShowCases = (
  ansibleServiceRef: IAAPService,
  ansibleConfig: AnsibleConfig,
) => {
  return createTemplateAction({
    id: 'rhaap:create-show-cases',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        values: () => createShowCasesValuesSchema,
      },
      output: {
        showCase: z => z.string(),
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
      ansibleServiceRef.setLogger(logger);
      const useCaseMaker = new UseCaseMaker({
        ansibleConfig: ansibleConfig,
        logger: logger,
        organization: input.values.organization,
        scmType: input.values.scmType,
        apiClient: ansibleServiceRef,
        useCases: input.values.useCases,
        token: input.token,
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
