import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  IAAPService,
  LaunchJobTemplate,
  TERMINAL_JOB_STATUSES,
} from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { launchJobTemplateFieldsSchema } from './schemas/rhaapActionSchemas';
import { normalizeTemplateLaunchValues } from './schemas/rhaapActionPayloadUtils';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 720;

function createAbortError(): Error {
  const error = Object.assign(new Error('The operation was aborted'), {
    name: 'AbortError',
  });
  error.stack = '';
  return error;
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {};
    const onAbort = () => {
      if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    timeoutRef.id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

async function pollJobCompletion(
  service: IAAPService,
  initialResult: Record<string, any>,
  token: string,
  signal: AbortSignal | undefined,
  logger: LoggerService,
): Promise<Record<string, any>> {
  let pollCount = 0;
  let currentStatus = initialResult.status?.toLowerCase();
  let result = { ...initialResult };

  try {
    while (currentStatus && !TERMINAL_JOB_STATUSES.has(currentStatus)) {
      if (signal?.aborted) throw createAbortError();

      if (pollCount >= MAX_POLLS) {
        const error = new Error(
          `Job ${result.id} polling timeout after ${MAX_POLLS * (POLL_INTERVAL_MS / 1000)} seconds. Last status: ${currentStatus}`,
        );
        logger.error(error.message);
        throw error;
      }

      await sleepMs(POLL_INTERVAL_MS, signal);
      pollCount++;

      const statusUpdate = await service.getJobStatus(result.id, token);
      currentStatus = statusUpdate.status?.toLowerCase();
      logger.debug(`Job ${result.id} status: ${currentStatus}`);
      result = { ...result, ...statusUpdate };
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      logger.info(
        `Task cancelled - sending cancel request to AAP for job ${result.id}`,
      );
      try {
        await service.cancelJob(result.id, token);
      } catch (cancelError) {
        logger.warn(`Failed to cancel AAP job ${result.id}: ${cancelError}`);
      }
    }
    throw e;
  }

  logger.info(`Job ${result.id} completed with status: ${currentStatus}`);
  logger.debug(
    `Polling completed after ${pollCount} polls (${pollCount * (POLL_INTERVAL_MS / 1000)}s)`,
  );

  if (currentStatus !== 'successful') {
    throw new Error(
      `Job ${result.id} finished with status "${currentStatus ?? 'unknown'}"`,
    );
  }

  return result;
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

        if (signal?.aborted) {
          throw createAbortError();
        }

        jobResult = await ansibleServiceRef.launchJobTemplateNoWait(
          launchPayload,
          token,
        );

        if (waitForCompletion) {
          logger.info(
            `Waiting for result of the executed job template (job ID: ${jobResult.id}).`,
          );

          const serviceToken = config.getOptionalString('ansible.rhaap.token');
          const pollingToken = serviceToken || token;
          if (!serviceToken) {
            logger.warn(
              'ansible.rhaap.token not configured - falling back to user token for polling. Long-running jobs may fail due to token expiry.',
            );
          }
          logger.debug(
            `Polling job ${jobResult.id} with ${serviceToken ? 'service' : 'user'} token`,
          );

          jobResult = await pollJobCompletion(
            ansibleServiceRef,
            jobResult,
            pollingToken,
            signal,
            logger,
          );
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
          throw e;
        }
        rethrowPreservingInputError(e);
      }

      ctx.output('data', jobResult);
    },
  });
};
