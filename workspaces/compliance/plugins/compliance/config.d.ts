export interface Config {
  ansible?: {
    compliance?: {
      /**
       * Enables or disables the compliance plugin (Plugin Factory requirement).
       *
       * Re-declared here (also declared in plugin-compliance-backend's
       * config.d.ts) because Backstage's config schema collector only
       * walks each package's own dependency tree. The frontend app
       * package depends on this plugin, not on plugin-compliance-backend,
       * so the backend package's visibility annotation for this key is
       * never seen by the frontend build. Without this declaration,
       * `ansible.compliance.enabled` is treated as not-visible-to-frontend,
       * and useComplianceEnabled() fails closed (renders nothing).
       *
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
