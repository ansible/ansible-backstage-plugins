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
     * Base url for the creator-service
     * @visibility backend
     */
    creatorService?: {
      /**
       * Base url for the creator-service
       * @visibility secret
       */
      baseUrl?: string;
      /**
       * Port at which the creator-service is exposed
       * @visibility backend
       */
      port?: string;
    };
  };
}
