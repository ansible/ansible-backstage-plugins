import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService, JobTemplate } from '@ansible/backstage-rhaap-common';

export const createJobTemplate = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({ description: 'Delete project if exist' }),
        values: z => z.custom<JobTemplate>(),
      },
      output: {
        template: z => z.any(),
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
      let jobTemplateData;
      try {
        jobTemplateData = await ansibleServiceRef.createJobTemplate(
          input.values,
          input.deleteIfExist,
          input.token,
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
