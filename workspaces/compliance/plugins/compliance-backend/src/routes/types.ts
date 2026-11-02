import type express from 'express';
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type {
  ActiveOrganizationResolver,
  PortalOperations,
} from '@ansible/portal-plugin-node';
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
  /**
   * The host's operation registry (`@ansible/portal-plugin-node`). The
   * legacy transport adapters for compliance's four registered operations
   * (`routes/scans.ts`'s `POST /scan`, `routes/remediation.ts`'s
   * `POST /remediate`, `routes/profiles.ts`'s `POST`/`DELETE
   * /compliance-profiles`) call `operations.execute()` when this — along
   * with `httpAuth` and `permissions` above — is present. `execute()`
   * enforces the operation's permission, validates its `inputSchema` via
   * AJV, and emits the SUCCESS/FAILURE audit event; this replaces the
   * route-level `requirePermission()` + manual validation + manual
   * `emitAuditEvent()` those four handlers used before. Like `httpAuth`/
   * `permissions`, omitted in `development` auth mode — `execute()`
   * requires an authenticated Backstage user, which the guest-auth dev
   * shell does not provide — so those adapters fall back to calling the
   * extracted handler function (`compliance-backend/src/operations.ts`)
   * directly, with permission/audit skipped exactly as `requirePermission()`
   * already does for every other route today.
   */
  operations?: PortalOperations;
  /**
   * Always present regardless of auth mode (see `RouterOptions.userInfo`/
   * `organizations`' doc comment). Needed alongside `httpAuth` to resolve a
   * fresh `OperationContext` via `resolvePortalContext()` immediately
   * before each `operations.execute()` call, mirroring
   * `portal-operations-backend`'s generic REST router.
   */
  userInfo?: UserInfoService;
  organizations?: ActiveOrganizationResolver;
}

export type ScanResolution = {
  resolvedScanId: string | undefined;
  workflowJobId: number | undefined;
  dbScan:
    | Awaited<ReturnType<ComplianceDatabase['getScanByWorkflowJobId']>>
    | undefined;
};

export type RegisterRoutes = (
  router: express.Router,
  deps: RouterDependencies,
) => void;
