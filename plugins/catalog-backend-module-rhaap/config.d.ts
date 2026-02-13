import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      /** @visibility frontend */
      rhaap?: {
        [authEnv: string]: {
          orgs?: string;
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
            ansibleGitContents?: {
              /** @default true */
              enabled?: boolean;
              /**
               * Default schedule for all providers if not specified at the org level
               * This is used as a fallback when an org doesn't have its own schedule defined
               */
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
              providers?: {
                github?: Array<{
                  /**
                   * Canonical name for easy identification of this source host
                   * @visibility frontend
                   */
                  name: string;
                  /**
                   * The host URL for the SCM provider
                   * @default 'github.com'
                   * @visibility frontend
                   */
                  host?: string;
                  orgs: Array<{
                    /** @visibility frontend */
                    name: string;
                    branches?: Array<string>;
                    tags?: Array<string>;
                    galaxyFilePaths?: Array<string>;
                    /** @default 5 */
                    crawlDepth?: number;
                    /**
                     * Schedule for syncing this organization
                     * If not provided, falls back to the common schedule at ansibleGitContents level
                     */
                    schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
                  }>;
                }>;
                gitlab?: Array<{
                  /**
                   * Canonical name for easy identification of this source host
                   * @visibility frontend
                   */
                  name: string;
                  /**
                   * The host URL for the SCM provider
                   * @default 'gitlab.com'
                   * @visibility frontend
                   */
                  host?: string;
                  orgs: Array<{
                    /** @visibility frontend */
                    name: string;
                    branches?: Array<string>;
                    tags?: Array<string>;
                    galaxyFilePaths?: Array<string>;
                    /** @default 5 */
                    crawlDepth?: number;
                    /**
                     * Schedule for syncing this group
                     * If not provided, falls back to the common schedule at ansibleGitContents level
                     */
                    schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
                  }>;
                }>;
              };
            };
          };
        };
      };
    };
  };
  ansible: {
    /**
     * Ansible Automation Platform (AAP) configuration.
     */
    rhaap: {
      /**
       * Base URL of Ansible Controller.
       */
      baseUrl: string;
      /**
       * Token for authentication.
       */
      token: string;
      /**
       * Check SSL certificate.
       */
      checkSSL?: boolean;
      showCaseLocation?: {
        /**
         * Generated showcase location type
         * url: gitHub
         * file: local filesystem
         */
        type: 'url' | 'file';
        /**
         * Generated showcase location
         * gitHub url if type === url
         * folder location if type === file
         */
        target: string;
        /**
         * Target branch
         * Used when type === 'url'
         * if branch does not exist plugin will create one
         */
        githubBranch?: string;
        /**
         * User who commits to gitHub
         * Used when type === 'url'
         * if branch does not exist plugin will create one
         */
        githubUser?: string;
        /**
         * Email of the user who commits to gitHub
         * Used when type === 'url'
         * if branch does not exist plugin will create one
         */
        githubEmail: string;
      };
    };
  };
}
