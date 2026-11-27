# Compliance Experience vs. Content Experience Architecture — Executive Summary (Revision 3)

**Branch assessed:** `feature/aap-compliance-experience`
**Diff base:** `main`
**Assessed against:**

- "Automation Content Management Framework: Architecture" (canonical doc, `~/Downloads/Content Experience Architecture.md`, 1596 lines)
- ANSTRAT-2497 Implementation Guide (`abhikdps/automation-portal-plugins@anstrat-2497-poc`)
- The actual, merged-to-`main` reference implementation: `workspaces/apme/plugins/backstage-apme*`
- The actual, in-progress content-management implementation: `workspaces/content/plugins/*`

**Date:** 2026-11-02
**Reviewer framing:** Staff Engineer review, architecture-conformance lens
**Relationship to prior reviews:** This supersedes the Revision 2 assessment (~70% conformance) in
this same directory. Revision 1 (~15%) found compliance bolted onto the shell with no manifest.
Revision 2 found the manifest/experience/NFS/backend-SDK work landed, but the one structural piece
that makes an `OperationDescriptor` load-bearing — registration with `PortalOperations` — was
still missing. **Revision 2's remediation plan (all 10 tasks) has since been implemented in full**
on this branch. This revision re-assesses after that work.

---

## Bottom line

**Compliance conformance score: ~95%**, up from ~70% in Revision 2 and ~15% in Revision 1. The
structural gap that Revision 2 flagged as "the one that matters" is closed:

- `compliance-backend/src/operations.ts`'s `registerComplianceOperations()` registers all four
  `OperationDescriptor`s (`compliance.scan.launch`, `compliance.remediation.launch`,
  `compliance.profile.save`, `compliance.profile.delete`) with the host's `PortalOperations`
  service, mirroring `catalog-backend-module-apme/src/operations.ts`'s `registerApmeOperations()`.
- The real business logic (`handleScanLaunch`, `handleRemediationLaunch`, `handleProfileSave`,
  `handleProfileDelete`) now lives inside those registered handlers, not inside Express routes.
- `scans.ts`'s `POST /scan`, `remediation.ts`'s `POST /remediate`, and `profiles.ts`'s
  `POST`/`DELETE /compliance-profiles` are now legacy transport adapters: in production auth mode
  they call `operations.execute()`, which runs the host's permission check, AJV schema validation,
  and audit emission generically — the same pipeline APME's operations run through. Existing URLs
  and response shapes are unchanged (§7.7 compatibility preserved).
- All four descriptors carry `organizationScope: 'shared'` (single-tenant-per-deployment data
  model; see [`detailed-gap-analysis.md`](./detailed-gap-analysis.md) §2.1).
- `complianceManifest.ts` now has two `CapabilityLaunch.type === 'operation'` entry points
  (`compliance.scan-and-assess.launch-scan-action`, `compliance.remediation.launch-remediation-action`),
  so the manifest declares the operations as actual invokable triggers, not just permission
  references — closing Revision 2's §2 finding, which was explicitly gated on §1 landing first.
- The now-redundant `req.portalContext` / `createMiddleware()` / manual `emitAuditEvent()` call
  sites were removed from `router.ts` and all three route files once nothing read them anymore —
  audit emission is now a single code path (`PortalOperations.execute()`'s built-in
  `AuditEmitter`), not two.
- A `development`-auth-mode fallback (direct handler call, no `operations.execute()`) was added
  deliberately, because `execute()` requires an authenticated Backstage principal that the
  guest-auth standalone dev shell does not provide — the same bypass `requirePermission()` already
  had. This preserves the dev shell without reintroducing a second permission-check code path in
  production.

**What is left is small, and none of it blocks calling this branch architecture-conformant:**

1. **Entitlements are still undeclared** (`entitlements: []`). This was already flagged in
   Revision 2 as legitimately low priority — entitlements model org-scoped feature toggles, and
   compliance remains single-tenant at the data layer (§2.1 in the detailed doc). Action only if/when multi-org work begins.
2. **Database rows are still not `organizationId`-keyed.** Documented deferral in
   [`detailed-gap-analysis.md`](./detailed-gap-analysis.md) §2.1, not a silent omission.
3. **Three repo-wide, not-compliance-specific gaps remain untouched**, because nobody in the
   monorepo has built them yet for _any_ plugin: the `portal-plugin.yaml` install-manifest layer
   (§8.5, proposed), per-workspace `catalog-info.yaml` (§2.2, proposed), and MCP tool exposure
   (`exposure.mcp` — no `mcp-backend-module-*` package exists anywhere yet).

---

## Scorecard: compliance vs. the two reference points

| Architecture requirement                                                                                                                              | APME (reference, merged)                                                            | `workspaces/content` (in progress)                                                                            | Compliance (this branch, now)                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declares a `PluginManifest`                                                                                                                           | ✅ `apmeManifest.ts`                                                                | ❌ none yet — `automation-content` is still a legacy `plugin.ts`/`routes.ts` frontend plugin                  | ✅ `complianceManifest.ts`                                                                                                                                            |
| Contributes to a host-owned experience (`experienceId`)                                                                                               | ✅ `content-quality-assessment` / `content-authoring`                               | — (content doesn't contribute via this contract yet; it _is_ a content-type axis, a different layer entirely) | ✅ `compliance` (`EXPERIENCE_IDS` entry)                                                                                                                              |
| NFS-discovered, not statically imported by the core app                                                                                               | ✅                                                                                  | n/a (no NFS entry point yet)                                                                                  | ✅ loads via `optionalContributorLoader`                                                                                                                              |
| `OperationDescriptor`s declared (schema, permission, audit category)                                                                                  | ✅ `backstage-apme-common/operations.ts`                                            | ❌                                                                                                            | ✅ `compliance-common/operations.ts`                                                                                                                                  |
| Operations **registered** with `PortalOperations` (`operations.register()`), so the host's permission/schema/entitlement/audit pipeline actually runs | ✅ `registerApmeOperations()`                                                       | ❌                                                                                                            | ✅ **(closed this revision)** `registerComplianceOperations()` in `compliance-backend/src/operations.ts`                                                              |
| Entry points that _launch_ an operation (`CapabilityLaunch.type === 'operation'`)                                                                     | ✅ (`apme.quality-assessment.scan-action`)                                          | n/a                                                                                                           | ✅ **(closed this revision)** `compliance.scan-and-assess.launch-scan-action`, `compliance.remediation.launch-remediation-action`                                     |
| Legacy REST routes are thin adapters over `operations.execute()`, not a second validation/audit path                                                  | ✅ `manualRepositories/router.ts`                                                   | n/a                                                                                                           | ✅ **(closed this revision)** `scans.ts`, `remediation.ts`, `profiles.ts`                                                                                             |
| Backend SDK: `createPortalPlugin`, `pushHealthStatus`                                                                                                 | ✅                                                                                  | ❌ (uses its own health endpoint)                                                                             | ✅                                                                                                                                                                    |
| Backend SDK: identity middleware (`req.portalContext`)                                                                                                | — (not used; relies on `PortalOperations.execute()`'s built-in identity resolution) | ❌                                                                                                            | — **(now matches APME's pattern)** removed once the operations path made it redundant; `resolvePortalContext()` is called fresh per-request by each adapter instead   |
| Backend SDK: audit emission                                                                                                                           | ✅ (automatic, inside `PortalOperations.execute()`)                                 | ❌                                                                                                            | ✅ **(now a single code path, not two)** automatic, inside `execute()` — the manual `emitAuditEvent()` calls were removed as part of this revision's work             |
| Entitlements registered (`entitlements.register()`)                                                                                                   | ✅ `apme.scanning`                                                                  | ❌                                                                                                            | ❌ (`entitlements: []` — low priority, deferred, see above)                                                                                                           |
| Database rows keyed by `organizationId`                                                                                                               | ❌ (not actually keyed either, despite the architecture's platform-wide invariant)  | ❌                                                                                                            | ❌ — deferred; see detailed gap analysis §2.1                                                                                                                         |
| Dynamic/legacy tab mechanism retired in favor of host slots                                                                                           | n/a                                                                                 | n/a                                                                                                           | ✅ [ADR-040](../../../workspaces/compliance/docs/adrs/ADR-040-retiring-dynamic-tab-system.md) retires ADR-027 Tier 2; Tier 1 re-expressed as a `CapabilityEntryPoint` |
| `portal-plugin.yaml` / per-workspace `catalog-info.yaml` (§2.2, §8.5 proposals)                                                                       | ❌                                                                                  | ❌                                                                                                            | ❌ — **repo-wide gap, not a compliance action item.**                                                                                                                 |
| MCP tool exposure (`exposure.mcp`)                                                                                                                    | ❌ (declared capability exists, no MCP backend module consumes it)                  | n/a                                                                                                           | ❌ — **repo-wide gap.** No `mcp-backend-module-*` package exists anywhere in the monorepo yet.                                                                        |

**Reading this table honestly:** compliance has gone from "ahead of `workspaces/content` on the L4
contract, but behind APME on the piece that makes it load-bearing" (Revision 2) to **at parity with
APME** on every item in compliance's control. The only rows where compliance isn't at parity with
APME are either (a) a deliberate, written, lower-priority deferral specific to compliance
(entitlements, org-keying — both tied to the same single-tenant deferral in §2.1), or (b) a
repo-wide gap that affects APME too, not something compliance did wrong.

---

## What changed since Revision 2, concretely

| File                                                             | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compliance-common/src/operations.ts`                            | Added `organizationScope: 'shared' as const` to all four descriptors; added an optional `aapToken` input property to the two launch operations (the AAP Controller per-user token has no other path into a registered handler, since `OperationContext` carries no raw request); widened `executionId` in the remediation output schema to `['string', 'null']` (execution tracking is optional, per ADR-014).                                                                                               |
| `compliance-backend/src/operations.ts` (new, 409 lines)          | `handleScanLaunch`, `handleRemediationLaunch`, `handleProfileSave`, `handleProfileDelete` — the actual business logic, extracted verbatim from the former route handlers. `registerComplianceOperations()` registers all four with `PortalOperations`. `ComplianceOperationError` + `sendOperationError()` preserve every historical HTTP status code and response shape (409 conflict detail, 422 host-validation, 404 not-found) across both the registered-operation path and the dev-mode fallback path. |
| `compliance-backend/src/plugin.ts`                               | Injects `portalOperationsServiceRef`; calls `registerComplianceOperations()` unconditionally (registration has no auth-mode dependency, same as `permissionsRegistry.addPermissions()`); passes `operations` into the router only in `production` auth mode, alongside `httpAuth`/`permissions`.                                                                                                                                                                                                             |
| `compliance-backend/src/router.ts`, `routes/types.ts`            | `operations`, `userInfo`, `organizations` threaded through `RouterDependencies`. The `identity` bundle and its `createMiddleware()` call are removed — nothing reads `req.portalContext` anymore.                                                                                                                                                                                                                                                                                                            |
| `routes/scans.ts`, `routes/remediation.ts`, `routes/profiles.ts` | The four mutating handlers are now legacy transport adapters: production mode resolves credentials, calls `resolvePortalContext()`, and dispatches through `operations.execute()`; development mode (no real Backstage identity available) calls the same extracted handler function directly, preserving the guest-auth dev shell exactly as `requirePermission()`'s existing no-op-when-unauthenticated behavior already did.                                                                              |
| `compliance/src/complianceManifest.ts`                           | Added `compliance.scan-and-assess.launch-scan-action` and `compliance.remediation.launch-remediation-action`, both `type: 'operation'` with a `followOn` slot, matching `apmeManifest.ts`'s pattern.                                                                                                                                                                                                                                                                                                         |

Full before/after detail, including the two design decisions made to close the gap (the synthetic
`component:default/compliance-plugin` subject `entityRef`, and the `aapToken`-via-input-schema
approach), is in [`detailed-gap-analysis.md`](./detailed-gap-analysis.md).

---

## Recommendation

**This branch no longer needs a remediation plan for the plugin-factory contract.** The one
structural gap Revision 2 identified is closed, tested (355 backend + 260 frontend tests passing,
`tsc --noEmit` clean across all three compliance packages), and verified not to regress the
existing REST contract.

What remains is explicitly optional, not blocking:

1. **Entitlements** — only becomes relevant if/when the multi-org program in
   [`detailed-gap-analysis.md`](./detailed-gap-analysis.md) §2.1 is in scope. Do not action speculatively.
2. **Database organization-keying** — same trigger condition as (1); §2.1 documents the deferral;
   revisit together when product requires isolation.
3. **`portal-plugin.yaml` / `catalog-info.yaml` / MCP exposure** — these are not compliance's to
   fix. They don't exist for APME either. Raising them as compliance action items would be
   penalizing this branch for a repo-wide sequencing gap it has no control over.

If a follow-up pass is wanted purely for completeness, see
[`detailed-gap-analysis.md`](./detailed-gap-analysis.md)'s closing section for what a minimal,
optional entitlements PR would look like — but nothing in this document should be read as blocking
merge or further feature work on this branch.
