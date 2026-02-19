import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';

export type PAHRepositoryConfig = {
  name: string;
  schedule: SchedulerServiceTaskScheduleDefinition | undefined;
};

export type AapConfig = {
  id: string;
  baseUrl: string;
  token: string;
  checkSSL: boolean;
  schedule?: SchedulerServiceTaskScheduleDefinition;
  organizations: string[];
  surveyEnabled?: boolean | undefined;
  jobTemplateLabels?: string[];
  jobTemplateExcludeLabels?: string[];
  /** When set, this config is for a PAH collection sync for the given repository name. */
  pahRepositories?: PAHRepositoryConfig[];
};
