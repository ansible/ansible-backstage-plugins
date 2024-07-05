export interface Config {
  ansible?: {
    /**
     * The devspaces baseUrl for Openshift Dev Spaces Dashboard.
     * @deepVisibility backend
     */
    devSpaces?: {
      /**
      * @deepVisibility backend
      */
      baseUrl?: string;
    }

    /**
    * @deepVisibility backend
    */
    aap?: {
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
}