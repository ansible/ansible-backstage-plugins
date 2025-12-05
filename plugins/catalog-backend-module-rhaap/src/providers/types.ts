import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';

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
};
