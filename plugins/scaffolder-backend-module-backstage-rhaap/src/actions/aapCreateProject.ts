import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  aapApiRecordOutputSchema,
  projectInputSchema,
} from './schemas/rhaapActionSchemas';

export const createProjectAction = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-project',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({ description: 'Delete project if exist' }),
        values: () => projectInputSchema,
      },
      output: {
        project: () => aapApiRecordOutputSchema,
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
      let projectData;
      try {
        projectData = await ansibleServiceRef.createProject(
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
      ctx.output('project', projectData);
    },
  });
};
