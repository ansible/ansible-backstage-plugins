import type {
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';

export function resolveTaskRunner(
  options: {
    logger: LoggerService;
    schedule?: SchedulerServiceTaskRunner;
    scheduler?: SchedulerService;
  },
  schedule: { frequency: object; timeout: object } | undefined,
  pluginLogName: string,
  providerId: string,
): SchedulerServiceTaskRunner {
  const { logger } = options;
  let taskRunner: SchedulerServiceTaskRunner | undefined;
  if ('scheduler' in options && schedule) {
    taskRunner = options.scheduler!.createScheduledTaskRunner(schedule);
  } else if ('schedule' in options) {
    taskRunner = options.schedule;
  }
  if (!taskRunner) {
    logger.info(
      `[${pluginLogName}]:No schedule provided via config for AAP Resource Entity Provider:${providerId}.`,
    );
    throw new InputError(
      `No schedule provided via config for AapResourceEntityProvider:${providerId}.`,
    );
  }
  return taskRunner;
}

export function normalizeTags(tags: string[]): string[] {
  return tags.map(tag =>
    tag
      .toLowerCase()
      .replaceAll(/[^a-z0-9+#-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, ''),
  );
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replaceAll(/\/$/g, '');
}
