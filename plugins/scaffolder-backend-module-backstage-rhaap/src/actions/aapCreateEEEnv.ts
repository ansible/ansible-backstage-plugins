import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  aapApiRecordOutputSchema,
  executionEnvironmentInputSchema,
} from './schemas/rhaapActionSchemas';

export const createExecutionEnvironment = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-execution-environment',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({ description: 'Delete project if exist' }),
        values: () => executionEnvironmentInputSchema,
      },
      output: {
        executionEnvironment: () => aapApiRecordOutputSchema,
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
      let eeData;
      try {
        eeData = await ansibleServiceRef.createExecutionEnvironment(
          input.values,
          input.token,
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
