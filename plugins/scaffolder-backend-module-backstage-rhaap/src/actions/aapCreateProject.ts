import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { normalizeProjectInputValues } from './schemas/rhaapActionPayloadUtils';
import {
  launchJobTemplateValuesLooseSchema,
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
        values: () => launchJobTemplateValuesLooseSchema,
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
        const normalized = normalizeProjectInputValues(input.values);
        const parsedData = parseAapActionValues(
          projectInputSchema,
          normalized,
          'rhaap:create-project',
        );
        projectData = await ansibleServiceRef.createProject(
          parsedData,
          input.deleteIfExist,
          input.token,
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      ctx.output('project', projectData);
    },
  });
};
