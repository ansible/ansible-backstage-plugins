import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

/**
 * Operator migration: copy PAH/Git sync sections from `catalog.providers.rhaap.<env>`
 * to `catalog.providers.interim-content.<env>`. Legacy `rhaap` keys remain supported
 * as fallback until interim-content is retired (content L2/L3).
 */
export interface Config {
  catalog?: {
    providers?: {
      /** @visibility frontend */
      'interim-content'?: {
        [authEnv: string]: {
          multiOrgEnabled?: boolean;
          orgs?: string | string[];
          sync?: {
            pahCollections?: {
              enabled: boolean;
              repositories: Array<{
                name: string;
                schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
              }>;
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
            };
            ansibleGitContents?: {
              enabled?: boolean;
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
              providers?: Record<string, unknown>;
            };
          };
        };
      };
      /** Legacy fallback — prefer `interim-content` for split deployments */
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
