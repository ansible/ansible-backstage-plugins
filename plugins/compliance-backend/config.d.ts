export interface Config {
  ansible?: {
    compliance?: {
      /**
       * Enables or disables the compliance plugin (Plugin Factory requirement).
       * @visibility frontend
       */
      enabled?: boolean;

      /**
       * Data source: 'mock' for sample data, 'live' for real AAP.
       * @visibility backend
       */
      dataSource?: string;

      /**
       * Auth mode: 'production' for RBAC, 'development' for guest access.
       * @visibility backend
       */
      authMode?: string;

      /**
       * Days to retain scan findings before cleanup.
       * @visibility backend
       */
      retentionDays?: number;

      /**
       * Private Automation Hub registry hostname for EE image pulls.
       * Falls back to AAP_HOST_URL env var if not set.
       * @visibility backend
       */
      pahRegistry?: string;
    };
  };
}
