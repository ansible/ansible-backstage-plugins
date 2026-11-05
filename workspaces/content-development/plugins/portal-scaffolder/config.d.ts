export interface Config {
  /** Configurations for the Ansible plugin */
  ansible?: {
    /**
     * Feedback form configuration
     * @deepVisibility frontend
     */
    feedback?: {
      /**
       * Enable or disable the feedback form. Defaults to true.
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
