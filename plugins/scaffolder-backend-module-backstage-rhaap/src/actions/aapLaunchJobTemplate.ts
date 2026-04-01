import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  IAAPService,
  LaunchJobTemplate,
} from '@ansible/backstage-rhaap-common';

export const launchJobTemplate = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:launch-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Authorization token' }),
        values: z => z.custom<LaunchJobTemplate>(),
      },
      output: {
        data: z => z.any(),
      },
    },
    async handler(ctx) {
      const {
        input: { token, values },
        logger,
      } = ctx;
      if (!token?.length) {
        const error = new Error('Authorization token not provided.');
        error.stack = '';
        throw error;
      }
      ansibleServiceRef.setLogger(logger);
      let jobResult;
      try {
        jobResult = await ansibleServiceRef.launchJobTemplate(values, token);
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
