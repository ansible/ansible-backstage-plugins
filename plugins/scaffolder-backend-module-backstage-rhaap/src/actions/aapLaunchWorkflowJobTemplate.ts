import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  IAAPService,
  LaunchWorkflowJobTemplate,
} from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import {
  aapApiRecordOutputSchema,
  launchWorkflowJobTemplateFieldsSchema,
  launchJobTemplateValuesLooseSchema,
} from './schemas/rhaapActionSchemas';
import { normalizeWorkflowTemplateLaunchValues } from './schemas/rhaapActionPayloadUtils';

export const launchWorkflowJobTemplate = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:launch-workflow-job-template',
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
        const normalized = normalizeWorkflowTemplateLaunchValues(values);
        const launchPayload = parseAapActionValues(
          launchWorkflowJobTemplateFieldsSchema.passthrough(),
          normalized,
          'rhaap:launch-workflow-job-template',
        ) as LaunchWorkflowJobTemplate;
        jobResult = await ansibleServiceRef.launchWorkflowJobTemplate(
          launchPayload,
          token,
          ({ id, url }) => {
            logger.info(
              `RHAAP_WORKFLOW_LAUNCH_DATA ${JSON.stringify({ id, url })}`,
            );
          },
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      ctx.output('data', jobResult);
    },
  });
};
