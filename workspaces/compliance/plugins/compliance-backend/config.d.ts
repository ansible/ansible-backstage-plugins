export interface Config {
  ansible?: {
    compliance?: {
      /**
       * Enables or disables the compliance plugin (Plugin Factory requirement).
       * @visibility frontend
       */
      enabled?: boolean;

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
       * Max age (minutes) of a per-scan ingest token (ADR-010) before the
       * findings-ingest and scan-artifact registration routes reject it,
       * even if it otherwise matches. Default: 60.
       * @visibility backend
       */
      ingestTokenTtlMinutes?: number;

      /**
       * Private Automation Hub registry hostname for EE image pulls.
       * Falls back to AAP_HOST_URL env var if not set.
       * @visibility backend
       */
      pahRegistry?: string;
    };
  };
}
