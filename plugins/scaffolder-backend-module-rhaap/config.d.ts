import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  /**
   * Configuration options for the Ansible backend plugin.
   */
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
       * Showcase generated templates
       *
       */
      : {
        /**
         * Showcase location type file (local) or url(gitHub)
         */
        type: string;
        /**
         * Showcase location
         *
         */
        target: string;
        /**
         * templates branch if type==url
         */
        githubBranch?: string;
        /**
         * used for commits templates  if type==url
         */
        githubUser?: string;
        /**
         * used for commits templates  if type==url
         */
        githubEmail?: string;
        /**
         * GitHub token
         *
         */
        githubToken?: string;
      };
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
      locations: [
        /**
         * Generic seed template
         * https://github.com/ansible/ansible-rhdh-templates/blob/main/seed.yaml
         */
        {
          type: 'file' | 'url';
          location: string;
          'https://github.com/ansible/ansible-rhdh-templates/blob/main/seed.yaml';
        },
        /**
         * If showcase location type is file
         * location is a path to created templates
         */
        {
          type: 'file';
          location: string;
        },
      ];
    };
  };
}
