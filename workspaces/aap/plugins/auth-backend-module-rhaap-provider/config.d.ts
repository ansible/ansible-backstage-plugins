export interface Config {
  auth?: {
    providers?: {
      /** @visibility frontend */
      rhaap?: {
        [authEnv: string]: {
          clientId: string;
          /**
           * @visibility secret
           */
          clientSecret: string;
          host: string;
          /** Backend-reachable OAuth token host; defaults to the browser-facing host. */
          tokenHost?: string;
          callbackUrl?: string;
          checkSSL?: boolean;
        };
      };
    };
  };
}
