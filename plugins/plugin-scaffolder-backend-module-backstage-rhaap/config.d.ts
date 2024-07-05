export interface Config {
  ansible?: {
    /**
     * Url of the hub cluster developer hub instance
     */
    devSpaces: {
      baseUrl?: string;
    }

    aap: {
      baseUrl?: string;
      token?: string;
    }
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
