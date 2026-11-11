import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  ansible?: {
    /** @visibility backend */
    devSpaces?: {
      /** @visibility backend */
      baseUrl?: string;
    };
    /** @visibility backend */
    creatorService?: {
      /** @visibility secret */
      baseUrl?: string;
      /** @visibility backend */
      port?: string;
    };
    /**
     * Transitional read dependency; AAP owns these settings.
     * @visibility backend
     */
    rhaap?: {
      /** @visibility backend */
      baseUrl?: string;
      /** @visibility secret */
      token?: string;
      /** @visibility backend */
      checkSSL?: boolean;
    };
  };
  catalog?: {
    providers?: {
      /**
       * Transitional read dependency; the AAP catalog provider owns this configuration.
       * @visibility frontend
       */
      rhaap?: {
        [authEnv: string]: {
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
          sync?: {
            pahCollections?: {
              enabled?: boolean;
              repositories?: Array<{ name: string }>;
            };
            ansibleGitContents?: {
              providers?: {
                [provider: string]: Array<{
                  name: string;
                  host?: string;
                }>;
              };
            };
          };
        };
      };
    };
  };
}
