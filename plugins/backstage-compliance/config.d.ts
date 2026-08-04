export interface Config {
  /** Configurations for the Ansible plugin */
  ansible?: {
    /**
     * Compliance scanning configuration
     * @deepVisibility frontend
     */
    compliance?: {
      /**
       * Enable or disable compliance scanning. Defaults to false.
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
