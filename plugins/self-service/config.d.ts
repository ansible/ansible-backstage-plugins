export interface Config {
  /** Configurations for the Ansible plugin */
  ansible?: {
    /**
     * AAP base URL
     * @deepVisibility frontend
     */
    rhaap?: {
      /**
       * @visibility frontend
       */
      baseUrl?: string;
    };
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
    /**
     * APME (Ansible Policy & Modernization Engine) configuration
     * @deepVisibility frontend
     */
    apme?: {
      /**
       * Enable APME integration. When true, shows Content submenu with Git Repositories
       * and Content quality. Defaults to false.
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
