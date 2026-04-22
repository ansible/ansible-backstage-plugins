import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  IAAPService,
  LaunchJobTemplate,
} from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import {
  aapApiRecordOutputSchema,
  launchJobTemplateFieldsSchema,
  launchJobTemplateValuesLooseSchema,
} from './schemas/rhaapActionSchemas';
import { normalizeTemplateLaunchValues } from './schemas/rhaapActionPayloadUtils';

export const launchJobTemplate = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:launch-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Authorization token' }),
        values: () => launchJobTemplateValuesLooseSchema,
      },
      output: {
        data: () => aapApiRecordOutputSchema,
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
        const normalized = normalizeTemplateLaunchValues(values);
        const launchPayload = parseAapActionValues(
          launchJobTemplateFieldsSchema.passthrough(),
          normalized,
          'rhaap:launch-job-template',
        ) as LaunchJobTemplate;
        jobResult = await ansibleServiceRef.launchJobTemplate(
          launchPayload,
          token,
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      ctx.output('data', jobResult);
    },
  });
};
