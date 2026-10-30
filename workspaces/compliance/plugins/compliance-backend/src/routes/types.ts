import type express from 'express';
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import type { ComplianceService } from '../service/ComplianceService';
import type { ComplianceDatabase } from '../database/ComplianceDatabase';

export interface SharedState {
  retentionDays: number;
  /**
   * Max age (minutes) of a per-scan ingest token (ADR-010) before it is
   * rejected, even if it otherwise matches. Configurable via
   * `ansible.compliance.ingestTokenTtlMinutes` (default: 60).
   */
  ingestTokenTtlMinutes: number;
  staleScanThrottle: Map<string, number>;
  parseInProgress: Set<string>;
  executionReconcileThrottle: Map<string, number>;
  STALE_CHECK_INTERVAL_MS: number;
}

export interface RouterDependencies {
  logger: LoggerService;
  service: ComplianceService;
  database: ComplianceDatabase;
  httpAuth?: HttpAuthService;
  permissions?: PermissionsService;
  state: SharedState;
}

export type ScanResolution = {
  resolvedScanId: string | undefined;
  workflowJobId: number | undefined;
  dbScan: Awaited<ReturnType<ComplianceDatabase['getScanByWorkflowJobId']>> | undefined;
};

export type RegisterRoutes = (
  router: express.Router,
  deps: RouterDependencies,
) => void;
