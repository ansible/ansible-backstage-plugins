import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { CleanUp, IAAPService } from '@ansible/backstage-rhaap-common';
import { cleanUpInputSchema } from './schemas/rhaapActionSchemas';

export const cleanUp = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:clean-up',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        values: () => cleanUpInputSchema,
      },
      output: {
        cleanUp: z => z.string(),
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
      try {
        await ansibleServiceRef.cleanUp(input.values as CleanUp, input.token);
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
