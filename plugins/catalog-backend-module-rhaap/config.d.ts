import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      /** @visibility frontend */
      rhaap?: {
        [authEnv: string]: {
          orgs: string;
          sync: {
            orgsUsersTeams: {
              schedule: SchedulerServiceTaskScheduleDefinitionConfig;
            };
            jobTemplates: {
              enabled: boolean;
              labels?: Array<string>;
              excludeLabels?: Array<string>;
              surveyEnabled?: boolean;
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
            };
            pahCollections: {
              enabled: boolean;
              repositories: Array<{
                /** Name of the PAH repository to sync collections from */
                name: string;
                /** Optional repository-specific schedule. Falls back to top-level schedule if not provided */
                schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
              }>;
              /** Default schedule for all repositories that don't have their own schedule */
              schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
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
