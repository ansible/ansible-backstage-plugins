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

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        }),
      );
      return;
    }
    const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {};
    const onAbort = () => {
      if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id);
      signal?.removeEventListener('abort', onAbort);
      reject(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        }),
      );
    };
    timeoutRef.id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

export const launchJobTemplate = (
  ansibleServiceRef: IAAPService,
  config: { getOptionalString: (key: string) => string | undefined },
) => {
  return createTemplateAction({
    id: 'rhaap:launch-job-template',
    schema: {
      input: {
        token: z => z.string({ description: 'Authorization token' }),
        values: z => z.record(z.string(), z.unknown()),
        waitForCompletion: z =>
          z
            .boolean({
              description: 'Wait for job to complete (default: true)',
            })
            .optional()
            .default(true),
      },
      output: {
        data: z => z.record(z.string(), z.unknown()),
      },
    },
    async handler(ctx) {
      const {
        input: { token, values, waitForCompletion = true },
        logger,
        signal,
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
          try {
            while (
              currentStatus &&
              !['successful', 'failed', 'error', 'canceled'].includes(
                currentStatus,
              )
            ) {
              if (signal?.aborted) {
                throw Object.assign(new Error('The operation was aborted'), {
                  name: 'AbortError',
                });
              }

              if (pollCount >= MAX_POLLS) {
                const error = new Error(
                  `Job ${jobResult.id} polling timeout after ${MAX_POLLS * (POLL_INTERVAL_MS / 1000)} seconds. Last status: ${currentStatus}`,
                );
                logger.error(error.message);
                throw error;
              }

              await sleepMs(POLL_INTERVAL_MS, signal);
              pollCount++;

              const statusUpdate = await ansibleServiceRef.getJobStatus(
                jobResult.id,
                pollingToken,
              );

              currentStatus = statusUpdate.status?.toLowerCase();
              logger.debug(`Job ${jobResult.id} status: ${currentStatus}`);
              jobResult = { ...jobResult, ...statusUpdate };
            }
          } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
              logger.info(
                `Task cancelled — sending cancel request to AAP for job ${jobResult.id}`,
              );
              try {
                await ansibleServiceRef.cancelJob(jobResult.id, pollingToken);
              } catch (cancelError) {
                logger.warn(
                  `Failed to cancel AAP job ${jobResult.id}: ${cancelError}`,
                );
              }
              throw e;
            }
            throw e;
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
