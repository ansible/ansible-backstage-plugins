import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

/**
 * Operator migration: copy `catalog.providers.rhaap.<env>` sections to
 * `catalog.providers.aap.<env>` (AAP identity + job templates only).
 * Legacy `rhaap` keys remain supported as fallback until the shim is removed.
 */
export interface Config {
  catalog?: {
    providers?: {
      /** @visibility frontend */
      aap?: {
        [authEnv: string]: {
          multiOrgEnabled?: boolean;
          orgs?: string | string[];
          sync?: {
            orgsUsersTeams?: {
              schedule: SchedulerServiceTaskScheduleDefinitionConfig;
            };
            jobTemplates?: {
              enabled: boolean;
              labels?: Array<string>;
              excludeLabels?: Array<string>;
              surveyEnabled?: boolean;
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
            };
          };
        };
      };
      /** Legacy fallback — prefer `aap` for split deployments */
      rhaap?: Record<string, unknown>;
    };
  };
  ansible: {
    rhaap: {
      baseUrl: string;
      token: string;
      checkSSL?: boolean;
    };
  };
}
