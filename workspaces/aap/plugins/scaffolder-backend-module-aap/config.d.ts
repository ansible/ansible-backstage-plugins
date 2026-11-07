export interface Config {
  ansible?: {
    /** @visibility backend */
    rhaap?: {
      /** @visibility backend */
      baseUrl?: string;
      /** @visibility secret */
      token?: string;
      /** @visibility backend */
      checkSSL?: boolean;
    };
  };
}
