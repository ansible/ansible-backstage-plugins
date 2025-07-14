import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';

export type AapConfig = {
  id: string;
  baseUrl: string;
  token: string;
  checkSSL: boolean;
  schedule?: SchedulerServiceTaskScheduleDefinition;
  orgSync?: string;
  surveyEnabled?: boolean | undefined;
  jobTemplateLabels?: string[];
};
