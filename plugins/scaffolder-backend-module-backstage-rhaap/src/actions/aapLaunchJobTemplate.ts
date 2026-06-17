import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  IAAPService,
  LaunchJobTemplate,
} from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { launchJobTemplateFieldsSchema } from './schemas/rhaapActionSchemas';
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
        values: () => launchJobTemplateFieldsSchema.passthrough(),
        waitForCompletion: z =>
          z
            .boolean({
              description: 'Wait for job to complete (default: true)',
            })
            .optional()
            .default(true),
      },
      output: {
        data: () => launchJobTemplateFieldsSchema.passthrough(),
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

          logger.info(
            `Waiting for result of the executed job template (job ID: ${jobResult.id}).`,
          );

          // Poll with service token (doesn't expire) instead of user token
          const pollingToken = serviceToken || token;
          if (!serviceToken) {
            logger.warn(
              'ansible.rhaap.token not configured - falling back to user token for polling. Long-running jobs may fail due to token expiry.',
            );
          }
          logger.debug(
            `Polling job ${jobResult.id} with ${serviceToken ? 'service' : 'user'} token`,
          );

          const POLL_INTERVAL_MS = 5000; // 5 seconds
          const MAX_POLLS = 720; // 720 * 5s = 1 hour max
          let pollCount = 0;
          let currentStatus = jobResult.status?.toLowerCase();
          while (
            currentStatus &&
            !['successful', 'failed', 'error', 'canceled'].includes(
              currentStatus,
            )
          ) {
            if (pollCount >= MAX_POLLS) {
              const error = new Error(
                `Job ${jobResult.id} polling timeout after ${MAX_POLLS * (POLL_INTERVAL_MS / 1000)} seconds. Last status: ${currentStatus}`,
              );
              logger.error(error.message);
              throw error;
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            pollCount++;

            const statusUpdate = await ansibleServiceRef.getJobStatus(
              jobResult.id,
              pollingToken,
            );

            currentStatus = statusUpdate.status?.toLowerCase();
            logger.debug(`Job ${jobResult.id} status: ${currentStatus}`);
            jobResult = { ...jobResult, ...statusUpdate };
          }

          logger.info(
            `Job ${jobResult.id} completed with status: ${jobResult.status}`,
          );
          logger.debug(
            `Polling completed after ${pollCount} polls (${pollCount * (POLL_INTERVAL_MS / 1000)}s)`,
          );

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
