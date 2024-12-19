import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  ansible?: {
    /**
     * The devspaces baseUrl for Openshift Dev Spaces Dashboard.
     * @visibility backend
     */
    devSpaces?: {
      /**
       * @visibility backend
       */
      baseUrl?: string;
    };

    /**
     * @visibility backend
     */
    rhaap?: {
      /**
       * @visibility backend
       */
      baseUrl?: string;
      /**
       * @visibility backend
       */
      token?: string;
      /**
       * @visibility backend
       */
      checkSSL?: boolean;
    };
    /**
     * Base url for the creator-service
     */
    creatorService: {
      /**
       * Base url for the creator-service
       * @visibility secret
       */
      baseUrl: string;
      /**
       * Port at which the creator-service is exposed
       */
      port: string;
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
