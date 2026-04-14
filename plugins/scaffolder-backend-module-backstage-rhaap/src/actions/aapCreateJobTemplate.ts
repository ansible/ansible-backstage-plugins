import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { normalizeJobTemplateInputValues } from './schemas/rhaapActionPayloadUtils';
import {
  launchJobTemplateValuesLooseSchema,
  aapApiRecordOutputSchema,
  jobTemplateInputSchema,
} from './schemas/rhaapActionSchemas';

export const createJobTemplate = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({ description: 'Delete project if exist' }),
        values: () => launchJobTemplateValuesLooseSchema,
      },
      output: {
        template: () => aapApiRecordOutputSchema,
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
        const normalized = normalizeJobTemplateInputValues(input.values);
        const parsedData = parseAapActionValues(
          jobTemplateInputSchema,
          normalized,
          'rhaap:create-job-template',
        );
        jobTemplateData = await ansibleServiceRef.createJobTemplate(
          parsedData,
          input.deleteIfExist,
          input.token,
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      ctx.output('template', jobTemplateData);
    },
  });
};
