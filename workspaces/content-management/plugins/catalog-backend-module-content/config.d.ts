import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

/**
 * Operator migration: copy PAH/Git sync sections from `catalog.providers.rhaap.<env>`
 * to `catalog.providers.content.<env>`. Legacy `rhaap` keys remain supported
 * as fallback until content is retired (content L2/L3).
 */
export interface Config {
  catalog?: {
    providers?: {
      /** @visibility frontend */
      content?: {
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
              providers?: {
                github?: Array<{
                  /** @visibility frontend */
                  name: string;
                  /** @visibility frontend */
                  host?: string;
                  checkSSL?: boolean;
                  orgs: Array<{
                    /** @visibility frontend */
                    name: string;
                    branches?: Array<string>;
                    tags?: Array<string>;
                    galaxyFilePaths?: Array<string>;
                    crawlDepth?: number;
                    schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
                  }>;
                }>;
                gitlab?: Array<{
                  /** @visibility frontend */
                  name: string;
                  /** @visibility frontend */
                  host?: string;
                  checkSSL?: boolean;
                  orgs: Array<{
                    /** @visibility frontend */
                    name: string;
                    branches?: Array<string>;
                    tags?: Array<string>;
                    galaxyFilePaths?: Array<string>;
                    crawlDepth?: number;
                    schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
                  }>;
                }>;
              };
            };
          };
        };
      };
      /** Legacy fallback — prefer `content` for split deployments */
      rhaap?: Record<string, unknown>;
    };
  };
  /**
   * Optional for Git-only content. `baseUrl` and `token` are required at
   * runtime when an enabled PAH repository is configured.
   */
  ansible?: {
    rhaap?: {
      baseUrl?: string;
      token?: string;
      checkSSL?: boolean;
    };
  };
}
