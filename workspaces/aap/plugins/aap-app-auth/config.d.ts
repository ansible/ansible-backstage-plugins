export interface Config {
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
