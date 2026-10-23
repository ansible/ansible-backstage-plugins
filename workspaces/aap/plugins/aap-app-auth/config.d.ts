export interface Config {
  auth?: {
    providers?: {
      rhaap?: {
        [authEnv: string]: {
          /** Public OAuth application identifier for RP-initiated logout.
           * @visibility frontend
           */
          clientId?: string;
          /** Browser-facing AAP OAuth issuer host, never the private token host.
           * @visibility frontend
           */
          host?: string;
        };
      };
    };
  };
  ansible?: {
    rhaap?: {
      /**
       * AAP gateway URL used to end its browser session on sign-out.
       * @visibility frontend
       */
      baseUrl?: string;
    };
  };
}
