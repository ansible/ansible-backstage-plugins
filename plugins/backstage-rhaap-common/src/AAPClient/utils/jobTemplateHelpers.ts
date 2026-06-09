import { LoggerService } from '@backstage/backend-plugin-api';
import { LaunchJobTemplate } from '../../types';

/**
 * Builds the launch payload data object from the LaunchJobTemplate payload.
 * Shared helper for both launchJobTemplate and launchJobTemplateNoWait.
 */
export function buildLaunchPayload(
  payload: Omit<LaunchJobTemplate, 'token'>,
  logger: LoggerService,
): {
  inventory?: number;
  job_type?: string;
  executionEnvironment?: number;
  execution_environment?: number;
  forks?: number;
  limit?: string;
  verbosity?: number;
  job_slice_count?: number;
  timeout?: number;
  diff_mode?: boolean;
  job_tags?: string;
  skip_tags?: string;
  extra_vars?: object | string;
  credentials?: number[];
} {
  const data = { extra_vars: payload?.extraVariables ?? '' } as {
    inventory?: number;
    job_type?: string;
    executionEnvironment?: number;
    execution_environment?: number;
    forks?: number;
    limit?: string;
    verbosity?: number;
    job_slice_count?: number;
    timeout?: number;
    diff_mode?: boolean;
    job_tags?: string;
    skip_tags?: string;
    extra_vars?: object | string;
    credentials?: number[];
  };

  if (payload?.inventory?.id) {
    data.inventory = payload.inventory.id;
  }
  if (payload?.jobType) {
    data.job_type = payload.jobType;
  }
  if (payload?.executionEnvironment?.id) {
    data.execution_environment = payload.executionEnvironment.id;
  }
  if (payload?.forks || payload.forks === 0) {
    data.forks = payload.forks;
  }
  if (payload?.limit) {
    data.limit = payload.limit;
  }
  if (payload?.verbosity?.id !== undefined) {
    data.verbosity = payload.verbosity.id;
  }
  if (payload?.jobSliceCount || payload.jobSliceCount === 0) {
    data.job_slice_count = payload.jobSliceCount;
  }
  if (payload?.timeout || payload.timeout === 0) {
    data.timeout = payload.timeout;
  }
  if (payload?.diffMode || payload.diffMode === false) {
    data.diff_mode = payload.diffMode;
  }
  if (payload?.jobTags) {
    data.job_tags = payload.jobTags;
  }
  if (payload?.skipTags) {
    data.skip_tags = payload.skipTags;
  }

  if (payload?.credentials?.length) {
    const seen = new Set();
    const duplicates: string[] = [];
    payload.credentials.some(currentObject => {
      if (!currentObject.credential_type) {
        return false;
      }
      if (seen.size === seen.add(currentObject.credential_type).size) {
        const credentialTypeName =
          currentObject.summary_fields?.credential_type?.name ||
          currentObject.name ||
          'Unknown';
        duplicates.push(credentialTypeName);
        return true;
      }
      return false;
    });
    if (duplicates.length) {
      logger.error(
        `Cannot assign multiple credentials of the same type. Duplicated credential types are: ${duplicates.join(', ')}`,
      );
      throw new Error(
        `Cannot assign multiple credentials of the same type. Duplicated credential types are: ${duplicates.join(
          ', ',
        )}`,
      );
    }
    data.credentials = payload.credentials
      .filter(c => c.id !== undefined && c.id !== null)
      .map(c => c.id);
  }

  return data;
}
