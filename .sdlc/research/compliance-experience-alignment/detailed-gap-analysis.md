# Detailed Gap Analysis (Revision 3): `feature/aap-compliance-experience` vs. Content Experience Architecture

**Purpose of this document:** (1) record, with file-and-line evidence, that Revision 2's one
structural gap (operations declared but never registered) is now closed; (2) give a complete,
honest accounting of what remains; and (3) **hand over** the compliance feature on
`feature/aap-compliance-experience` to the engineer driving it next — what is done, what is
deliberately deferred, and what triggers the next wave of work. **§2.1** documents the
single-tenant data model and deployer constraints for handover (no separate ADR — keep that
context in this file). Dynamic tab retirement remains documented in
[`ADR-040`](../../../workspaces/compliance/docs/adrs/ADR-040-retiring-dynamic-tab-system.md).

Unlike Revision 2, this document does **not** end with a Cursor-plan-shaped remediation list for
the plugin-factory contract — that work is complete. Pending items are product-gated or
repo-wide (§1, §2).

**Companion doc:** [`executive-summary.md`](./executive-summary.md)

**Sources:**

- Architecture: `~/Downloads/Content Experience Architecture.md` (local, 1596 lines) — cited as `§section`
- Implementation guide: `anstrat-2497-implementation-guide.md` (raw GitHub,
  `abhikdps/automation-portal-plugins@anstrat-2497-poc`) — cited as `IG §section`
- Reference implementation: `workspaces/apme/plugins/backstage-apme*` (merged to `main`)
- Comparison baseline: `workspaces/content/plugins/*` (in-progress ANSTRAT-1758 work, unchanged
  since Revision 2 — reconfirmed by grep, see §4)
- Subject: `workspaces/compliance/` on `feature/aap-compliance-experience`, current working-tree
  state (uncommitted)

---

## Handover snapshot (done vs pending)

Use this as the entry point; §0 is evidence for the “done” column, §2.1 covers tenancy.

| Area                                                                    | Status                      | Where to look                                                                                                                          |
| ----------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Host-owned experience (`EXPERIENCE_IDS.COMPLIANCE`), manifest, NFS load | **Done**                    | `complianceManifest.ts`, `alpha.tsx`, `AppNfs.tsx` / `composition.ts`                                                                  |
| ADR-027 dynamic tab retirement (Tier 2 removed; Tier 1 as entry point)  | **Done**                    | [ADR-040](../../../workspaces/compliance/docs/adrs/ADR-040-retiring-dynamic-tab-system.md), `compliance.scan-and-assess.profile-tab`   |
| Four operations declared + registered + legacy REST adapters            | **Done**                    | `compliance-common/src/operations.ts`, `compliance-backend/src/operations.ts`, `routes/scans.ts`, `remediation.ts`, `profiles.ts` (§0) |
| Manifest `type: 'operation'` entry points (scan + remediation launch)   | **Done**                    | `complianceManifest.ts` (§0.5)                                                                                                         |
| Backend health via `createPortalPlugin` / `pushHealthStatus`            | **Done**                    | `compliance-backend/src/plugin.ts`                                                                                                     |
| **Single-tenant persisted data (no `organizationId` on DB rows)**       | **Done (decision)**         | §2.1; `organizationScope: 'shared'` on all four operations (§0.3)                                                                      |
| Org in **audit** trail for mutating ops (production)                    | **Done (attribution only)** | `resolvePortalContext()` → `operations.execute()` → host `AuditEmitter` (§2.1); not a DB partition key                                 |
| Entitlements (`entitlements.register`)                                  | **Pending**                 | Product/org-axis deferred with §2.1; §1.1                                                                                              |
| DB partition by `organizationId` (architecture §6.6)                    | **Pending**                 | Requires product decision + follow-up design; §2.1                                                                                     |
| `portal-plugin.yaml`, workspace `catalog-info.yaml`, MCP exposure       | **Out of scope**            | Repo-wide; §2.2–§2.3                                                                                                                   |

**Deployer note (§2.1):** On a portal where **multiple organizations share one
compliance-backend**, compliance data is **not** isolated by organization today — only by
Backstage permissions, which are not org-scoped. Do not enable compliance for orgs that must not
see each other's scans/findings/profiles until §2.1's pending work lands.

---

## 0. What Revision 2's remediation plan closed — evidence

All four steps of Revision 2's recommendation (register the four operations; add
`organizationScope: 'shared'`; convert the Express handlers to legacy transport adapters; remove
redundant manual audit calls) have landed. This section is the evidence trail; §1 and §2 of
Revision 2 are **struck through as resolved** below rather than restated as open findings.

### 0.1 Operations are now registered with `PortalOperations`

`workspaces/compliance/plugins/compliance-backend/src/operations.ts` (409 lines, new file):

```35:40:workspaces/compliance/plugins/compliance-backend/src/operations.ts
export const COMPLIANCE_OPERATION_SUBJECT = 'component:default/compliance-plugin';
```

```371:409:workspaces/compliance/plugins/compliance-backend/src/operations.ts
export function registerComplianceOperations(options: {
  operations: PortalOperations;
  service: ComplianceService;
  database: ComplianceDatabase;
  logger: LoggerService;
}): void {
  const { operations, service, database, logger } = options;
  const deps = { service, database, logger };

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceScanLaunchOperation,
    handler: request =>
      handleScanLaunch(
        request.input as unknown as LaunchScanRequest & { aapToken?: string },
        deps,
      ),
  });

  operations.register({
    pluginId: 'compliance',
    descriptor: complianceRemediationLaunchOperation,
    // ...similar shape for remediation launch, profile save, profile delete
  });
}
```

`registerComplianceOperations()` is called unconditionally from `plugin.ts`'s `init()` — not
gated on `authMode`, the same way `permissionsRegistry.addPermissions()` already was:

```171:171:workspaces/compliance/plugins/compliance-backend/src/plugin.ts
registerComplianceOperations({ operations, service, database: complianceDb, logger });
```

This closes Revision 2 §1 in full: the descriptors in `compliance-common/src/operations.ts` are no
longer "accurate documentation of intent" — `PortalOperations.execute()` now actually runs AJV
schema validation against `complianceScanLaunchOperation.inputSchema`/`.outputSchema` and the
others, runs the Backstage `permissions.authorize()` check, resolves organization scope, and emits
the audit event, for every one of the four operations, exactly as it does for APME's.

### 0.2 The `subject.entityRef` design decision (Revision 2 §1.4's "wrinkle") — resolved

Revision 2 flagged, correctly, that `OperationRequest.subject.entityRef` is modeled around
catalog-entity-scoped operations and asked for an explicit decision rather than a guess.
**Decision made and applied:** option 1 from Revision 2 — a synthetic, fixed subject,
`component:default/compliance-plugin`, used identically across all four operations (§0.1 above).
This is the lowest-effort, architecture-compatible choice and was applied consistently; no
compliance-specific second dispatch path was invented (Revision 2's explicit warning against that
is respected).

### 0.3 `organizationScope: 'shared'` added to all four descriptors

`workspaces/compliance/plugins/compliance-common/src/operations.ts` — every one of
`complianceScanLaunchOperation`, `complianceRemediationLaunchOperation`,
`complianceProfileSaveOperation`, `complianceProfileDeleteOperation` now carries
`organizationScope: 'shared' as const`, consistent with the single-tenant-per-deployment
decision documented in §2.1. Without
this, `PortalOperations.execute()` would reject every compliance operation call with "no resolved
organization" in a single-tenant deployment with no organization catalog entities. This closes
Revision 2 §1's step 2.

A second, smaller fix was made in the same pass, proactively, not previously flagged by Revision
2: `complianceRemediationLaunchOperation.outputSchema.properties.executionId` was `{ type: 'string'
}` (required, non-nullable), but `handleRemediationLaunch()` legitimately returns `executionId:
null` when the request has no `remediationProfileId` (execution tracking is optional per ADR-014).
Left as-is, this would have failed AJV output validation inside `execute()` on every untracked
remediation launch in production — a latent bug the registration work itself would have surfaced
immediately. Fixed to `{ type: ['string', 'null'] }` before the handler was wired up.

### 0.4 Express handlers converted to legacy transport adapters

`scans.ts`, `remediation.ts`, `profiles.ts` now split on auth mode:

```399:452:workspaces/compliance/plugins/compliance-backend/src/routes/scans.ts
router.post('/scan', async (req, res) => {
  // ...manual shape validation (unchanged — this validates the *wire* body
  // before it becomes an OperationRequest.input, not a duplicate of the
  // registered operation's inputSchema)
  if (operations && httpAuth && permissions && userInfo && organizations) {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const context = await resolvePortalContext({ credentials, userInfo, organizations });
    const result = await operations.execute(
      complianceScanLaunchOperation.id,
      { subject: { entityRef: COMPLIANCE_OPERATION_SUBJECT }, input: input as unknown as Record<string, unknown> },
      { ...context, credentials },
      permissions,
    );
    res.json(result);
    return;
  }
  // Development auth mode: no authenticated Backstage principal to run
  // operations.execute() against, so call the same handler directly.
  const result = await handleScanLaunch(input, { service, database, logger });
  res.json(result);
});
```

`remediation.ts`'s `POST /remediate` and `profiles.ts`'s `POST`/`DELETE /compliance-profiles*`
follow the identical production/dev-mode branch shape. This closes Revision 2 §1's step 4 (legacy
transport adapters, URLs and response shapes unchanged — verified by `router.test.ts`'s existing
HTTP-contract tests, which pass unmodified except for one stale assertion removed, see §0.6) and
makes the production path for every mutating compliance operation go through the exact same
permission/schema/audit pipeline APME's operations use.

**Dev-mode fallback — a deliberate, scoped exception, not a second production path.**
`PortalOperations.execute()` requires an authenticated `'user'`-type Backstage principal
(`resolvePortalContext()` throws `NotAllowedError` otherwise). Compliance's standalone
guest-auth dev shell has no such principal, so `operations.execute()` cannot run there at all —
the same reason `requirePermission()` has always been a documented no-op when `httpAuth`/
`permissions` are undefined. The dev-mode branch calls the identical extracted handler function
(`handleScanLaunch`, etc.) directly, so there is exactly one implementation of the business logic,
not two — only the dispatch path differs, and only in a mode that never runs in production.

### 0.5 Manifest entry points now launch operations, not just reference their permission

`workspaces/compliance/plugins/compliance/src/complianceManifest.ts` (276 lines):

```110:123:workspaces/compliance/plugins/compliance/src/complianceManifest.ts
{
  id: 'compliance.scan-and-assess.launch-scan-action',
  kind: 'overlay',
  surface: 'experience-slot',
  appliesToContentTypes: ['*'],
  label: 'Launch compliance scan',
  order: 21,
  requiredPermission: complianceScanLaunchOperation.permission,
  launches: {
    type: 'operation',
    operationId: complianceScanLaunchOperation.id,
    followOn: { type: 'slot', targetSlot: 'compliance.results' },
  },
},
```

and the equivalent `compliance.remediation.launch-remediation-action` entry point
(lines 189–202) for `complianceRemediationLaunchOperation`. This closes Revision 2 §2 in full —
which was explicitly gated on §1 landing first, and is now meaningful because the operation IDs
these entry points reference are dispatchable through `PortalOperations`/
`portal-operations-backend`, not inert.

### 0.6 Redundant manual audit path removed

`router.ts`'s `identity.portalPlugin.createMiddleware(...)` wiring and the `portalPlugin?:
PortalPlugin` field in `RouterDependencies` are deleted — confirmed by exhaustive grep that nothing
under `compliance-backend/src` reads `req.portalContext` or calls `emitAuditEvent()` anymore.
Audit emission is now a single code path: `PortalOperations.execute()`'s internal `AuditEmitter`,
identical to APME's. One stale test assertion (`expect(body.plan).toBeDefined()` in
`router.test.ts`) was removed because the `plan` field — never part of the declared
`outputSchema`, never consumed by any frontend code (confirmed by grep) — was intentionally
dropped from `handleRemediationLaunch()`'s return value when it was extracted, since
`outputSchema` has `additionalProperties: false`.

### 0.7 Verification

`npx tsc --noEmit` clean across `compliance`, `compliance-backend`, `compliance-common`. ESLint
clean. 355 backend tests + 260 frontend tests passing (615 total), including the full existing
`router.test.ts` HTTP-contract suite for `/scan`, `/remediate`, `/compliance-profiles*` unmodified
except the one stale assertion noted above.

---

## 1. What is genuinely still open

### 1.1 No entitlements registered (LOW, unchanged from Revision 2 — not actioned, correctly)

**Current:** `complianceManifest.ts`'s `entitlements: []` (line 268). Nothing in
`compliance-backend/src/plugin.ts` calls `entitlements.register('compliance', [...])`, and no
`portalEntitlementsServiceRef` dependency is injected.

**Reference:** APME declares `apmeScanningEntitlement` (`scope: 'organization'`,
`permissionName: apmeScanningPermission.name`) and registers it via
`entitlements.register('apme', [apmeScanningEntitlement])`.

**Why this remains correctly deferred, not merely incomplete:** entitlements model an
organization-scoped feature toggle independent of RBAC permission — "is this feature turned on for
this org's tier," not "can this user invoke it." Compliance today has one deployment-wide
`ansible.compliance.enabled` config boolean, and compliance deliberately remains
single-tenant at the data layer (§2.1). Introducing an entitlement now would be modeling an organization axis that doesn't
exist yet in compliance's product requirements — i.e. it would be speculative, not corrective.
**Recommendation: do not action this until/unless §2.1's multi-org program is in scope** (product
decision + a new ADR or design doc for partitioning). If and when that happens, the shape to follow is a one-file addition
(`complianceEnabledEntitlement` in `compliance-common/src/operations.ts` + one
`entitlements.register()` call in `plugin.ts`, mirroring APME's) — small enough that pre-building
it now would add surface area without a consumer.

---

## 2. Accepted, written gaps (not action items for merge)

### 2.1 Single-tenant data model — decision, what we implemented, what you inherit

This subsection is the **handover record** for tenancy (architecture §6.6 vs compliance's
current schema). It is intentionally kept here rather than in a separate ADR.

#### Why this section exists

The Content Experience Architecture (§6.6) states a platform invariant: plugin database rows should
be keyed by `organizationId`, queries without that key are bugs, and the design should stay honest
even when a deployment has only one organization today.

Compliance **did not** match that when the architecture-alignment pass started, and it **still
does not** at the persistence layer — on purpose, not by omission. The alignment pass chose **not**
to add org-keying because multi-org compliance isolation is a **product** decision with large blast
radius (below). Documenting that here avoids the gap analysis reading like unfinished conformance
work; single-tenant-per-deployment is an explicit, reversible deferral.

#### Two different “organization” questions (do not conflate them)

| Question                                                                  | Meaning                                                                         | Status on this branch                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can the host know **which org the user was acting under** for audit?      | Attribution in audit events when someone launches a scan, saves a profile, etc. | **Addressed in production** — mutating routes call `resolvePortalContext()` and pass the result into `operations.execute()`; the host's `AuditEmitter` records user/org context. Identity middleware (`req.portalContext`) was **removed** after operation registration (§0.6); audit attribution now follows the same path as APME, not a parallel middleware attachment. |
| Must **compliance data** be partitioned so org A cannot see org B's rows? | Every table row scoped by `organizationId`; every query filters by it           | **Explicitly deferred** — no `organizationId` column on any compliance table; all authenticated users in the deployment see the same scan/finding/profile data subject to RBAC permissions only.                                                                                                                                                                           |

Host/org context for **audit** is not the same as org as a **data partition key** in
`ComplianceDatabase`.

#### Current data model (status quo)

`ComplianceDatabase` has nine tables; **none** carry `organizationId` or filter reads by org:

- `compliance_scans`
- `compliance_findings`
- `compliance_posture_snapshots`
- `compliance_remediation_executions`
- `compliance_remediation_profiles`
- `compliance_baseline_targets`
- `compliance_rule_metadata`
- `compliance_profile_registry`
- `compliance_scan_artifacts`

Visibility is **per deployment**: every scan, finding, and profile is visible to every
authenticated user of that deployment, scoped by Backstage permissions
(`compliance.scan.read`, `compliance.scan.launch`, etc.), **not** by organization membership.

#### Decision (recorded in this handover, 2026-11-02)

**Compliance remains single-tenant-per-deployment.** No `organizationId` column is added to any
`ComplianceDatabase` table as part of the alignment effort that produced this branch. Multi-org
partitioning is the right design **once product** requires multiple organizations on one portal
with data isolation between them — that is not decided here.

#### What alignment **did** implement to stay consistent with this decision

These are **done**; do not “fix” them without an explicit superseding design for multi-org:

1. **`organizationScope: 'shared'`** on all four `OperationDescriptor`s in
   `compliance-common/src/operations.ts` (§0.3). Required so `PortalOperations.execute()` does
   not demand a resolved active organization before dispatch — which would fight a DB that is not
   org-partitioned and deployments with no org catalog entities.
2. **No `withOrganization()`-style DB helpers** on compliance tables — intentionally not started,
   to avoid a half-partitioned schema.
3. **`entitlements: []`** and no `entitlements.register()` (§1.1) — org-scoped feature toggles
   assume an org product axis; deferred together with DB partitioning.

#### What is **pending** for the next engineer (trigger: product multi-org requirement)

Do **not** start this work speculatively. When product decides compliance must support multiple
organizations sharing one compliance-backend with **data isolation**, capture the design in a
**new ADR** (or equivalent SDP) that at least covers:

1. **Schema** — `organizationId` on all nine tables (nullable → backfill → likely non-nullable).
2. **Queries** — organization filter on every read/write in `ComplianceDatabase` (~80+
   `this.db('compliance_*')` call sites in that file alone).
3. **Operations layer** — revisit `organizationScope: 'shared'` → likely `'organization'` on
   mutating operations; entitlements if org-scoped “compliance enabled” is needed (§1.1).
4. **Cross-org views** — explicit design if tenant admins need rollups; “filter every query by org”
   and “platform admin sees all orgs” conflict unless designed up front.
5. **Ingest path (ADR-010)** — AAP job callback + per-scan token has **no user session** and no
   `resolvePortalContext()` at ingest time. Multi-org must **store** `organizationId` on the scan
   row at **launch** time and have ingest honor that row — not infer org when findings arrive.

Until that design is approved, treat §2.1 as binding for schema and operations scope.

#### Consequences you should carry into reviews and docs

- **Positive:** Avoids inconsistent partial partitioning (some tables keyed, some not) and a
  security model that is harder to fix later.
- **Positive:** Production mutating paths already produce audit events with org/user context via
  `operations.execute()`, giving a trail to extend when DB rows become org-keyed.
- **Negative / deployer:** Multi-org portal + one compliance-backend ⇒ **shared compliance data
  across orgs** (RBAC only). Document this for operators until partitioning lands.
- **Neutral:** This deferral did not block manifest, NFS, operations registration, or
  [ADR-040](../../../workspaces/compliance/docs/adrs/ADR-040-retiring-dynamic-tab-system.md)
  work — all of that landed independently.

#### Related ADRs (context only)

- **ADR-040** — retire ADR-027 dynamic tabs; Tier 1 profile tab as `CapabilityEntryPoint`.
- **ADR-010** — ingest design; org inheritance is the hard part when multi-org partitioning lands.

### 2.2 `portal-plugin.yaml` / per-workspace `catalog-info.yaml` (§2.2, §8.5 proposals)

Repo-wide gap. Nobody — including APME, the reference implementation — has built this proposed
install-manifest layer. Not a compliance action item.

### 2.3 MCP tool exposure (`exposure.mcp`)

Repo-wide gap. No `mcp-backend-module-*` package exists anywhere in the monorepo for any plugin.
`exposure.mcp` fields on compliance's `OperationDescriptor`s (if ever added) would be inert for the
same reason they'd be inert on APME's today. Not a compliance action item.

---

## 3. What `workspaces/content` shows, and what it does not (unchanged from Revision 2, reconfirmed)

Reconfirmed by direct grep this revision: `workspaces/content/plugins/` still has zero matches for
`PluginManifest`, `registerManifest`, `OperationDescriptor`, or `operations.register`. Content has
not moved on the L4 plugin-factory contract since Revision 2 — expected, since ANSTRAT-1758
(content primitives) and ANSTRAT-2497 (the plugin contract compliance now fully implements) are
deliberately sequenced, separately-owned efforts per the architecture's own phasing
(`IG §1`). Compliance's correct reference point for the layer it operates at remains
`workspaces/apme`, not `workspaces/content` — and compliance is now at parity with APME on that
layer (§0).

---

## 4. Conclusion (for handover)

**Plugin-factory / Content Experience alignment on this branch:** complete for items in compliance's
control (§0, handover table). No Cursor plan is required to “finish conformance” before you
continue feature work.

**Your pending queue (only when product asks for it):**

1. **Multi-org data isolation** — full program in §2.1 (new ADR or SDP; schema, queries,
   operations scope, ingest, entitlements together).
2. **Entitlements alone** — §1.1; do not implement until (1) is in scope.

**Not your compliance queue:** §2.2–§2.3 repo-wide install manifest and MCP (APME is in the same
boat).

**Suggested first read for the new owner:** handover table → §2.1 → §0 if you need file-level
proof of operations registration. For dynamic tabs / ADR-027 retirement, read
[ADR-040](../../../workspaces/compliance/docs/adrs/ADR-040-retiring-dynamic-tab-system.md) and
[ADR-027](../../../workspaces/compliance/docs/adrs/ADR-027-dynamic-tab-system.md) (superseded).
