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

export const launchJobTemplate = (
  ansibleServiceRef: IAAPService,
  config: { getOptionalString: (key: string) => string | undefined },
) => {
  return createTemplateAction({
    id: 'rhaap:launch-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Authorization token' }),
        values: () => launchJobTemplateValuesLooseSchema,
        waitForCompletion: z =>
          z
            .boolean({
              description: 'Wait for job to complete (default: true)',
            })
            .optional()
            .default(true),
      },
      output: {
        data: () => aapApiRecordOutputSchema,
      },
    },
    async handler(ctx) {
      const {
        input: { token, values, waitForCompletion = true },
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

        // Get service token for polling (prevents token expiry during long jobs)
        const serviceToken = config.getOptionalString('ansible.rhaap.token');

        // Use blocking or non-blocking based on input flag
        if (waitForCompletion) {
          // Launch job with user token (for RBAC)
          jobResult = await ansibleServiceRef.launchJobTemplateNoWait(
            launchPayload,
            token,
          );

          // Poll with service token (doesn't expire) instead of user token
          const pollingToken = serviceToken || token;

          let currentStatus = jobResult.status?.toLowerCase();
          while (
            currentStatus &&
            !['successful', 'failed', 'error', 'canceled'].includes(
              currentStatus,
            )
          ) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const statusUpdate = await ansibleServiceRef.getJobStatus(
              jobResult.id,
              pollingToken,
            );

            currentStatus = statusUpdate.status?.toLowerCase();
            jobResult = { ...jobResult, ...statusUpdate };
          }

          // Output final result
          ctx.output('data', jobResult);
        } else {
          // Opt-in: non-blocking behavior (returns immediately with job ID)
          jobResult = await ansibleServiceRef.launchJobTemplateNoWait(
            launchPayload,
            token,
          );
        }
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }

      // Ensure output is always set (for non-blocking case)
      if (!waitForCompletion) {
        ctx.output('data', jobResult);
      }
    },
  });
};
