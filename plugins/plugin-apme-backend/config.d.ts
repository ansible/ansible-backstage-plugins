export interface Config {
  apme?: {
    gateway?: {
      /**
       * Base URL of the APME Gateway HTTP API.
       * @visibility backend
       * @example http://apme-gateway:8080
       */
      baseUrl?: string;
    };
  };
}
