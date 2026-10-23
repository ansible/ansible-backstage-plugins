import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  ansible?: {
    /** @visibility backend */
    rhaap?: {
      /** @visibility backend */
      baseUrl?: string;
      /** @visibility backend */
      token?: string;
      /** @visibility backend */
      checkSSL?: boolean;
    };
  };
  catalog?: {
    providers?: {
      /** @visibility frontend */
      rhaap?: {
        [authEnv: string]: {
          schedule: SchedulerServiceTaskScheduleDefinitionConfig;
        };
      };
    };
  };
}
