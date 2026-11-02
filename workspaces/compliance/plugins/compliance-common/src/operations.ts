/**
 * Registered server-side operations for the compliance plugin.
 *
 * Per the Content Experience Architecture (§9.2), a plugin's only sanctioned
 * way to cause a server-side effect is a registered `OperationDescriptor` —
 * not a bare REST route. These descriptors declare input/output JSON Schema,
 * the permission that gates them, an audit category, and idempotency, so the
 * host (and any future MCP surface) can reason about them generically.
 *
 * Modeled on `@ansible/backstage-apme-common`'s `operations.ts`. Reuses the
 * existing `compliance.*` permissions from `./permissions` rather than
 * minting new ones. These descriptors are registered with the host's
 * `PortalOperations` service in `compliance-backend/src/operations.ts`'s
 * `registerComplianceOperations()` — the registered handler is what enforces
 * the permission, validates `inputSchema`/`outputSchema` via AJV, and emits
 * the audit event; `compliance-backend/src/routes/*.ts`'s POST/DELETE
 * handlers for these four operations are now thin legacy transport adapters
 * that call `operations.execute()` rather than reimplementing any of this.
 *
 * `organizationScope: 'shared'` on every descriptor reflects compliance's
 * single-tenant-per-deployment data model (see `.sdlc/research/
 * compliance-experience-alignment/detailed-gap-analysis.md` §2.1); without
 * it, `PortalOperations.execute()` would require a resolved `organizationId`
 * before dispatching.
 *
 * Priority order (write operations with real side effects first, per the
 * gap analysis §3 and §6 task breakdown):
 * 1. `complianceScanLaunchOperation` — launches an OpenSCAP/compliance scan.
 * 2. `complianceRemediationLaunchOperation` — launches a remediation job.
 * 3. `complianceProfileSaveOperation` / `complianceProfileDeleteOperation` —
 *    profile lifecycle (create, update, delete).
 *
 * Read-only operations (`scan.list`, `findings.list`, `inventory.list`,
 * `dashboard.summary`, etc.) are intentionally deferred — see the gap
 * analysis §3 table for the full candidate list.
 *
 * **Carve-out:** `POST /findings/ingest` is deliberately NOT modeled as an
 * `OperationDescriptor` here. It is called by an AAP Controller job using a
 * `backend.auth.externalAccess` static token plus a per-scan ingest token
 * (ADR-010) — a machine-to-machine auth model the operation descriptor
 * (designed around interactive, permission-checked, audited *user* actions)
 * does not cover. See `workspaces/compliance/README.md` for the ingest
 * security model.
 */
import {
  scanLaunchPermission,
  remediateLaunchPermission,
  profileManagePermission,
} from './permissions';

// ── Scan launch ────────────────────────────────────────────────────────────

/**
 * Launches a compliance scan against an inventory using a given profile.
 * Mirrors the request body validated in `compliance-backend/src/routes/scans.ts`'s
 * `POST /scan` handler and the `LaunchScanRequest` / `LaunchScanResponse` types.
 */
export const complianceScanLaunchOperation = {
  // Compliance has one deployment-wide AAP Controller, not per-organization
  // partitioning — see gap analysis §2.1; `PortalOperations.execute()` would
  // otherwise demand a resolved `organizationId` before dispatching.
  organizationScope: 'shared' as const,
  id: 'compliance.scan.launch',
  version: '1.0.0',
  description:
    'Launch a compliance scan for a profile against an AAP inventory.',
  permission: scanLaunchPermission,
  inputSchema: {
    type: 'object',
    required: ['profileId', 'inventoryId'],
    additionalProperties: false,
    properties: {
      profileId: { type: 'string', minLength: 1 },
      inventoryId: { type: 'integer', minimum: 1 },
      evaluateOnly: { type: 'boolean' },
      scanType: { type: 'string', enum: ['assessment', 'verification'] },
      limit: { type: 'string' },
      workflowTemplateId: { type: 'integer', minimum: 1 },
      gatherFacts: { type: 'boolean' },
      // Per-user AAP Controller OAuth token, forwarded by the legacy
      // transport adapter from the `x-aap-token` request header (see
      // `compliance-backend/src/routes/permissions.ts`'s `getUserAapToken`).
      // `OperationContext` has no raw Express request to read headers from,
      // so the token travels as operation input instead. Not logged: the
      // host's `AuditEmitter` only records `subject.entityRef`, never the
      // full `input` payload.
      aapToken: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['scanId', 'workflowJobId', 'status'],
    properties: {
      scanId: { type: 'string' },
      workflowJobId: { type: 'integer' },
      status: { type: 'string' },
    },
  },
  exposure: { rest: true },
  auditCategory: 'compliance-scan',
  idempotent: false,
};

// ── Remediation launch ────────────────────────────────────────────────────

/**
 * Launches a selective remediation job for the enabled findings on a scan.
 * Mirrors `compliance-backend/src/routes/remediation.ts`'s `POST /remediate`
 * handler and the `LaunchRemediationRequest` / `LaunchRemediationResponse` types.
 */
export const complianceRemediationLaunchOperation = {
  organizationScope: 'shared' as const,
  id: 'compliance.remediation.launch',
  version: '1.0.0',
  description: 'Launch remediation for the selected findings on an inventory.',
  permission: remediateLaunchPermission,
  inputSchema: {
    type: 'object',
    required: ['profileId', 'inventoryId', 'selections'],
    additionalProperties: false,
    properties: {
      profileId: { type: 'string', minLength: 1 },
      inventoryId: { type: 'integer', minimum: 1 },
      selections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ruleId', 'enabled'],
          properties: {
            ruleId: { type: 'string', minLength: 1 },
            enabled: { type: 'boolean' },
          },
        },
      },
      limit: { type: 'string' },
      scanId: { type: 'string' },
      remediationProfileId: { type: 'string' },
      // See `complianceScanLaunchOperation.inputSchema.properties.aapToken`.
      aapToken: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['remediationId', 'workflowJobId', 'status', 'executionId'],
    properties: {
      remediationId: { type: 'string' },
      workflowJobId: { type: 'integer' },
      status: { type: 'string' },
      allJobIds: { type: 'array', items: { type: 'integer' } },
      // Nullable: execution tracking (ADR-014) is only recorded when the
      // request carries a `remediationProfileId`; ad hoc launches without
      // one return `executionId: null`.
      executionId: { type: ['string', 'null'] },
    },
  },
  exposure: { rest: true },
  auditCategory: 'compliance-remediation',
  idempotent: false,
};

// ── Profile lifecycle ─────────────────────────────────────────────────────

/**
 * Creates or updates a compliance profile. Mirrors
 * `compliance-backend/src/routes/profiles.ts`'s `POST /compliance-profiles`
 * handler, which is an upsert (an `id` in the body updates that profile;
 * omitting it creates a new one) — not a pure "register new profile" call,
 * so this is named `.save`, not `.register`, to match actual route semantics.
 */
export const complianceProfileSaveOperation = {
  organizationScope: 'shared' as const,
  id: 'compliance.profile.save',
  version: '1.0.0',
  description: 'Create or update a compliance profile.',
  permission: profileManagePermission,
  inputSchema: {
    type: 'object',
    required: ['displayName', 'framework'],
    additionalProperties: true,
    properties: {
      id: { type: 'string' },
      displayName: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      framework: { type: 'string', minLength: 1 },
      version: { type: 'string' },
      platform: { type: 'string' },
      workflowTemplateId: { type: 'integer', minimum: 1 },
      remediateJtId: { type: 'integer' },
      eeId: { type: 'string' },
    },
  },
  exposure: { rest: true },
  auditCategory: 'compliance-profile',
  idempotent: false,
};

/**
 * Deletes a compliance profile. Mirrors `DELETE /compliance-profiles/:id`.
 */
export const complianceProfileDeleteOperation = {
  organizationScope: 'shared' as const,
  id: 'compliance.profile.delete',
  version: '1.0.0',
  description: 'Permanently delete a compliance profile.',
  permission: profileManagePermission,
  inputSchema: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  exposure: { rest: true },
  auditCategory: 'compliance-profile',
  idempotent: true,
};

export const complianceOperations = [
  complianceScanLaunchOperation,
  complianceRemediationLaunchOperation,
  complianceProfileSaveOperation,
  complianceProfileDeleteOperation,
];
