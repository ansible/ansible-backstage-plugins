# Detailed Gap Analysis: `feature/aap-compliance-experience` vs. Content Experience Architecture

**Purpose of this document:** file-by-file, rule-by-rule evidence to seed a Cursor implementation
plan. Each gap below names the exact current file, the exact architecture rule it fails, and the
exact reference file in `workspaces/apme/plugins/backstage-apme` that already solves the same
problem for the same `content-quality-assessment` experience.

**Companion doc:** [`executive-summary.md`](./executive-summary.md)

**Sources:**

- Architecture: `~/Downloads/Content Experience Architecture.md` (local, 1596 lines) — cited as `§section`
- Implementation guide: `anstrat-2497-implementation-guide.md` (raw GitHub, `abhikdps/automation-portal-plugins@anstrat-2497-poc`) — cited as `IG §section`
- Reference implementation: `workspaces/apme/plugins/backstage-apme/` (merged to `main`)
- Subject: `workspaces/compliance/` as of commit `02ba68f7` on `feature/aap-compliance-experience`

---

## 0. Open design question — resolve before implementation work starts

**This blocks everything below and is not an engineering decision.** It needs the architecture
owner (Ganesh) and likely the ANSTRAT-1758 content team.

`EXPERIENCE_IDS` (`workspaces/portal-core/plugins/portal-extension-common/src/extensionPoints.ts:34-43`)
currently declares exactly three experiences, all scoped to **content** (collections, EEs,
playbooks):

```ts
export const EXPERIENCE_IDS = {
  CONTENT_QUALITY: 'content-quality-assessment', // "APME and future scanners contribute here"
  CONTENT_AUTHORING: 'content-authoring',
  CONTENT_MIGRATION: 'content-migration',
} as const;
```

And `CONTENT_TYPES` (same file, lines 7-22) declares exactly four content type IDs:
`collection`, `execution-environment-definition`, `execution-environment-image`,
`playbook-repository`.

Compliance's actual subject is **AAP-managed hosts and inventories** (OpenSCAP/STIG/CIS scans,
CVE findings, host-level remediation — see `workspaces/compliance/README.md` and ADR-001, ADR-003,
ADR-008). This is not content in the architecture's sense. It does not fit any of the four
existing type IDs, and "content quality" is arguably the wrong experience name for it even if a
type ID existed (scanning a _fleet of running machines_ is a different axis from scanning
_collections, playbooks, or EE definitions_).

**Two legitimate paths, both explicitly allowed by §6.1's cost table ("Add a host experience... Host
only" / "Add a first-party workspace... None"):**

| Option                                                                        | What it means                                                                                                                              | Cost                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **A. New experience** — e.g. `EXPERIENCE_IDS.INFRASTRUCTURE_COMPLIANCE`       | `portal-core` declares a new `ExperienceDefinition`; compliance contributes capabilities into it, same mechanics as APME → Content Quality | Host-only change, one new `ExperienceDefinition`, new slot names                                   |
| **B. New content type** — e.g. `CONTENT_TYPES.MANAGED_HOST` or `...INVENTORY` | Hosts/inventories become a content type; compliance becomes a Content Quality capability like APME, scoped to that type                    | Requires the content team to agree hosts are "content" — a bigger conceptual stretch than Option A |

**Recommendation:** Option A. Hosts are not artifacts with digests and provenance the way
collections/EEs are (§1.3's "primitives are computed and carry provenance" model doesn't map
cleanly onto "is this RHEL box STIG-compliant today"). Forcing it into the content axis to avoid
declaring a second experience would repeat the exact axis-collapse mistake §2.5 rules 3/4 exist to
catch, just one level up (an _experience_ that knows about a subject it wasn't designed for,
instead of a _module_ that knows about two axes).

**Everything below assumes Option A and names the new experience `INFRASTRUCTURE_COMPLIANCE`
(`'infrastructure-compliance'`) as a placeholder.** Swap in the real ID once this is settled —
nothing else in this document changes shape if Option B is chosen instead, only the
`experienceId` values.

---

## 1. Capability contribution model — not present at all

### 1.1 No manifest

**Current:** `workspaces/compliance/plugins/compliance/src/` has no `complianceManifest.ts` or
equivalent. No `PluginManifest`, `CapabilityContribution`, or `CapabilityEntryPoint` is declared
anywhere in the workspace.

**Rule violated:** `§6.3` — "Every plugin publishes a serialisable manifest."
`IG §4.1` — same requirement, portal-extension-common owns the schema.

**Reference to copy:** `workspaces/apme/plugins/backstage-apme/src/apmeManifest.ts` (291 lines).
Structure to replicate:

- One `capabilities[]` entry per cohesive feature area. APME has four: quality-assessment,
  quality-settings, repository-lifecycle, dependencies. Compliance's natural split, reading
  `ComplianceRouter.tsx`'s existing six tabs (`overview`, `scan`, `results`, `remediations`,
  `inventories`, `settings`), is closer to: **scan-and-assess** (overview, new scan, results),
  **remediation** (remediations tab + remediation execution flow), **inventory-management**
  (inventories tab), **settings** (profile settings tab).
- Every entry point needs `appliesToContentTypes` — this is where Decision 0 resolves concretely:
  if Option A, these become `'*'` or a new type constant; do not leave them unset.
- `minimumHostApiVersion` — match whatever `APME_API_VERSION` currently is
  (`apmeManifest.ts:17`) unless the host contract has moved since.

### 1.2 Core app imports the plugin page directly — the exact anti-pattern named in §1.3

**Current:** `workspaces/portal-core/packages/app/src/AppNfs.tsx:13,50`

```tsx
import compliancePlugin from '@ansible/plugin-compliance/alpha';
// ...
compliancePlugin,
```

And `workspaces/compliance/plugins/compliance/src/alpha.tsx` registers a bare `PageBlueprint` at
`path: '/compliance'` with its own `routeRef` and a hardcoded sidebar `title`/`icon` — no
`capabilityId`, no `entryPointId`, no `manifest` reference at all.

**Rule violated:** `§1.3` — _"Hardcoding a domain route into the core app is the thing the plugin
factory exists to stop."_ `§6.2` — _"The core app does not import plugin pages."_

**Reference to copy:** `workspaces/apme/plugins/backstage-apme/src/alpha.tsx`. Note what APME's
`alpha.tsx` does _not_ do: it is never imported by name anywhere in `portal-core`. It registers
blueprints (`EntityDetailTabBlueprint.make`, `CatalogTabBlueprint.make`, etc.) each carrying
`manifest`, `capabilityId`, `entryPointId`, and `attachment` — the host discovers and mounts it via
NFS dynamic plugin discovery, not a static import list. (APME does keep one standalone
`PageBlueprint` too — `alpha.tsx:203-219`, the `/self-service/content-quality` fleet page — so a
top-level route is not inherently wrong; what's wrong is _every_ compliance surface being
that shape, with zero capability-contributed surfaces, and the core app knowing the plugin by name.)

**Concrete fix:**

1. Remove `compliancePlugin` from `AppNfs.tsx`'s static imports/feature list.
2. Decide which of the six existing tabs become capability-contributed surfaces (tabs, catalog
   actions, overview cards — see §2 below for a mapping) vs. which legitimately stay a
   standalone landing page (precedent: APME keeps one fleet-level page).
3. Re-register the kept standalone page the same way APME does — a `PageBlueprint` the host
   discovers via NFS, not a name `portal-core` imports.

---

## 2. Dynamic Tab System (ADR-027) duplicates the host's extension mechanism, with a weaker security model

**Current:** `workspaces/compliance/docs/adrs/ADR-027-dynamic-tab-system.md`, implemented in
`workspaces/compliance/plugins/compliance/src/components/DynamicProfileTab/` and
`ComplianceRouter.tsx` (`DynamicTabRefreshContext`, `allTabs` construction).

Two tiers:

- **Tier 1** — profile declares `display.tab.layout`; `DynamicProfileTab` composes six predefined
  widgets. This is roughly equivalent to a very constrained slot system and is the less risky half.
- **Tier 2** — profile ships a prebuilt JS bundle (`backstage/dist/bundle.js`), served by
  `compliance-backend`'s `GET/PUT/DELETE /compliance-profiles/:id/bundle`, loaded via dynamic
  `import()` in the browser with full React context access. ADR-027's own "Consequences" section
  says: _"the bundle is executed in the browser with full access to the React context... no formal
  plugin API contract yet."_

**Rule violated:** `§6.2` bullet — _"Push-based lifecycle and isolation... The host wraps every
contribution in a React error boundary so one broken card does not take down the portal."_
`portal-extension-host` already has this (`ErrorBoundary.tsx`,
`workspaces/portal-core/plugins/portal-extension-host/src/ErrorBoundary.tsx`), plus manifest
validation (`validateManifest.ts`) that rejects incompatible `apiVersion`s before mount.
ADR-027 Tier 2 has none of that: no manifest, no version check, no error boundary mentioned, no
permission gate on who can upload a bundle beyond whatever `PUT /compliance-profiles/:id/bundle`'s
route guard does.

**This is the single highest-risk item in the branch**, not because Tier 2 is used in practice yet
necessarily, but because it is a second, independently-evolving extension surface with a materially
weaker trust model than the one the architecture was built to enforce everywhere else.

**Concrete fix options (need a decision, not just code):**

- **Retire Tier 2 before it has real users.** Express the same "profiles want bespoke dashboard
  views" need as capability contributions with `appliesToContentTypes` scoped per profile/framework,
  loaded through the host's existing slot/manifest/error-boundary machinery instead of a bespoke
  bundle endpoint.
- **If Tier 2 must stay** (e.g., because profile authors need to ship arbitrary charts and the
  slot vocabulary genuinely can't express that), write a new ADR that explicitly accepts the risk,
  states what compensating controls exist (who can author a profile, is the bundle endpoint gated
  by the same permission as profile mutation, is there any manifest/version check on load), and
  cross-references this gap analysis so it isn't silently inconsistent with the rest of the
  platform's trust model.
- Tier 1 (widget-based) is much easier to fold into the capability model: each of the six
  predefined widgets becomes (or maps onto) a `CapabilityEntryPoint` of `kind: 'overview-slot'` /
  `'page-tab'`, same shape APME uses for its five slot-launched entry points.

---

## 3. No registered operations — backend is a plain Express router

**Current:** `workspaces/compliance/plugins/compliance-backend/src/routes/` — ten route files
(`artifacts.ts`, `baseline.ts`, `controller.ts`, `dashboard.ts`, `findings.ts`, `health.ts`,
`inventory.ts`, `permissions.ts`, `profiles.ts`, `remediation.ts`, `scans.ts`), wired as standard
Express routers in `router.ts`. Permission checks exist (ADR references a permissions framework
integration) but there is no `OperationDescriptor`: no declared input/output JSON Schema, no
`auditCategory`, no `idempotent` flag, no `exposure: { rest, mcp }` gate.

**Rule violated:** `§9.2` (Finding) — _"Registering a capability as an endpoint... creates an
unrestricted proxy."_ `§1.3` — _"Operations are registered, not proxied."_ `IG §4.3` — _"Why no
`handler()`: Any server-side effect goes through `operationId`."_

**Reference to copy:** `workspaces/apme/plugins/backstage-apme-common/src/operations.ts`. Every
operation there follows one shape:

```ts
export const apmeQualityScanOperation = {
  organizationScope: 'shared' as const,
  requiredEntitlements: [apmeScanningEntitlement.id],
  id: 'apme.quality.scan',
  version: '1.0.0',
  permission: apmeQualityScanPermission,
  inputSchema: { type: 'object', additionalProperties: false },
  exposure: { rest: true },
  auditCategory: 'quality-scan',
  idempotent: false,
};
```

**Concrete fix — candidate operation list, one per compliance route file, as a starting point for
the actual design pass (exact IDs/schemas need real review, not a mechanical rename):**

| Route file                                                                     | Candidate `OperationDescriptor` id(s)                                                       | Notes                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `scans.ts`                                                                     | `compliance.scan.launch`, `compliance.scan.get`, `compliance.scan.list`                     | launch is the highest-value one to register first — it's the one write operation with real side effects     |
| `remediation.ts`                                                               | `compliance.remediation.launch`, `compliance.remediation.status`                            | mirrors `apmeQualityScanOperation` shape closely                                                            |
| `profiles.ts`                                                                  | `compliance.profile.register`, `compliance.profile.deregister`, `compliance.profile.update` | register/deregister map directly onto `apmeRepositoryRegisterOperation`/`apmeRepositoryDeregisterOperation` |
| `inventory.ts`                                                                 | `compliance.inventory.list`, `compliance.inventory.get`                                     | read-only, `idempotent: true`                                                                               |
| `baseline.ts`                                                                  | `compliance.baseline.pin`, `compliance.baseline.unpin`                                      |                                                                                                             |
| `findings.ts` (user-facing reads only — **not** `/findings/ingest`, see below) | `compliance.findings.list`, `compliance.findings.get`                                       |                                                                                                             |
| `artifacts.ts`                                                                 | `compliance.artifacts.get`                                                                  |                                                                                                             |
| `dashboard.ts`                                                                 | `compliance.dashboard.summary`                                                              |                                                                                                             |
| `health.ts`                                                                    | —                                                                                           | this should become a `pushHealthStatus()` call via `portal-plugin-node`, not its own operation (see §4)     |
| `controller.ts`, `permissions.ts`                                              | internal/infrastructure — likely stay as-is, not user-facing operations                     |                                                                                                             |

**Important carve-out — do not force everything through this model mechanically:**
`findings.ts`'s `/findings/ingest` endpoint is deliberately _not_ a Backstage-user-session
operation. It's called by an AAP Controller job using a static `externalAccess` token plus a
per-scan ingest token (ADR-010), which is a legitimate, independently-reasoned machine-to-machine
auth model for a case the architecture's operation descriptor (designed around interactive,
permission-checked, audited _user_ actions) doesn't obviously cover. **This is worth a short,
explicit conversation with the architecture owner** rather than a silent exception — either the
operation model has a documented "service-to-service" variant, or ingest stays a deliberately
separate, ADR-justified path. Don't paper over it either way.

---

## 4. No SDK usage — frontend and backend both bypass `portal-plugin-sdk` / `portal-plugin-node`

**Current:** `grep` across `workspaces/compliance/plugins/compliance/src` and
`.../compliance-backend/src` for `portal-plugin-sdk`, `portal-plugin-node`, `usePortalContext`,
`createPortalPlugin`, `organizationId` returns **zero matches** in all cases.

**Rule violated:** `IG §4.6` / `§6.4` — SDK is "the enforced path." Concretely missing:

- Frontend: no `usePortalContext()` — organization/user identity, if compliance ever needs it, is
  presumably read some other way (worth auditing during implementation).
- Backend: no `createPortalPlugin()` / identity middleware — `req.portalContext` is never
  populated, so there's no `organizationId`/`userId` attached to requests by the shared SDK.
- Backend: no `AuditEmitter` — findings ingestion, scan launches, and remediation launches (all
  security/compliance-relevant actions!) are not going through the structured audit log the rest
  of the platform uses.
- Backend: no `pushHealthStatus()` — `compliance-backend/src/routes/health.ts` presumably
  implements its own health check, invisible to the cross-plugin `PortalHealthStatus` aggregator
  in `portal-extension-host` that already polls every plugin that _does_ push via
  `portal-plugin-node`.

**Reference to copy:** `workspaces/apme/plugins/backstage-apme/` for the frontend hook usage
pattern (search for `usePortalContext` in that workspace); `createPortalPlugin.ts` in
`workspaces/portal-core/plugins/portal-plugin-node/src/` for the backend factory, used in whatever
APME's backend module is (`workspaces/apme/plugins/catalog-backend-module-apme` or
`scaffolder-backend-module-apme` — check which one, if any, calls `createPortalPlugin`; if none
do yet, this gap may also exist in APME's backend, worth confirming rather than assuming asymmetry).

**Concrete fix:**

1. Wrap `compliance-backend`'s plugin registration with `createPortalPlugin({ pluginId:
'compliance' })` per `IG §4.6`'s example.
2. Replace ad hoc health reporting in `health.ts` with `portalPlugin.pushHealthStatus(...)`.
3. Replace or supplement whatever logging currently happens around scan launch / remediation
   launch / findings ingest with `AuditEmitter.emit(...)`, using the `auditCategory` values chosen
   in §3's operation descriptors.
4. Audit `ComplianceDatabase.ts` (`workspaces/compliance/plugins/compliance-backend/src/database/ComplianceDatabase.ts`)
   for every table that should be keyed by organization once Decision 0 and multi-tenancy posture
   are settled — today there is no `organizationId` column anywhere in the migrations.
   This is the largest, highest-blast-radius item in this document if the product goal is
   multi-org deployment; if compliance is intentionally single-tenant per deployment (plausible,
   given it mirrors one AAP Controller), that needs to be an explicit, written decision, not a
   silent omission, since `§6.2` states this as a platform-wide invariant ("Each plugin backend
   owns its database and keys every row by organization") without a carve-out.

---

## 5. Conventions that _are_ already correct — do not "fix" these

To keep this document honest and not pattern-match-happy, these match the architecture and the
reference implementation and should be left alone:

- **Workspace layout.** `workspaces/compliance/plugins/{compliance,compliance-backend,
compliance-common}` matches the frontend/backend/common split used everywhere else
  (`§2.3`, `§2.4`). ✅
- **`backstage.role` fields** are correctly set: `frontend-plugin`, `backend-plugin`,
  `common-library` (`compliance/package.json`, `compliance-backend/package.json`,
  `compliance-common/package.json`). Matches `§2.5` rule 11. ✅
- **ADR discipline.** 38 ADRs under `workspaces/compliance/docs/adrs/` is more design-decision
  documentation than most other workspaces in this repo have. This is a genuine strength to
  preserve, not a process to cut corners on while doing the above remediation. ✅
- **`catalog-info.yaml` / per-workspace `.changeset/`** — absent from compliance, but also absent
  from every other workspace checked (`apme`, `content`, `portal-core`). This is a repo-wide gap
  against `§2.4`'s proposed target state, not something specific to this branch. **Do not treat as
  a compliance-specific action item**; flag separately if/when the repo takes on `§2.4` generally.

---

## 6. Suggested Cursor plan shape

Given the size, this should not be one PR. Suggested task breakdown, roughly in dependency order:

1. **Design spike (no code):** resolve §0 (new experience vs. new content type) with the
   architecture owner. Produce a short ADR in `workspaces/compliance/docs/adrs/` recording the
   decision, numbered after the existing 38.
2. **`complianceManifest.ts`**, modeled on `apmeManifest.ts`, covering the four capability areas
   identified in §1.1. No UI changes yet — just the manifest compiling and passing
   `validateManifest()`.
3. **Operation descriptors** per §3's table, in a new `workspaces/compliance/plugins/
compliance-common/src/operations.ts`, modeled on `backstage-apme-common/src/operations.ts`.
   Wire the highest-value ones first (scan launch, remediation launch) and leave read-only list
   endpoints for a follow-up if time-boxed.
4. **Backend SDK adoption**: `createPortalPlugin`, health push, audit emit, per §4 items 1-3.
   Independent of the manifest work; can land in parallel.
5. **Frontend capability wiring**: replace the `alpha.tsx` standalone `PageBlueprint`-only
   registration with the blueprint set chosen in step 2, mirroring APME's `alpha.tsx` structure.
   Keep `/compliance/*` URLs working (redirect or dual-mount) per `§7.7`'s "existing URLs keep
   working" constraint — this is a hard requirement, not a nice-to-have.
6. **ADR-027 decision and follow-through** per §2 — likely its own ADR plus either a retirement
   PR for Tier 2 or an explicit risk-acceptance writeup.
7. **Organization-keying** (§4 item 4) — scope this only after Decision 0 and a product
   conversation about multi-tenancy; this is the one item here that could be legitimately
   out-of-scope if compliance stays single-tenant-per-deployment by design.

Items 2-4 can proceed in parallel once item 1 is resolved; item 5 depends on item 2; item 6 and 7
are independent of the others and can be sequenced by risk/priority rather than dependency.
