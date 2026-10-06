# Scaffolder Re-Architecture — Implementation Guide

> **Canonical architecture:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (§2.2 workspace layout, §7.3–7.5 content/self-service boundary, §6.3 `scaffolder-field` contribution kind)
> **Related Jira:** [ANSTRAT-2497](https://redhat.atlassian.net/browse/ANSTRAT-2497) (portal SDK, `portal-scaffolder`), [ANSTRAT-1758](https://redhat.atlassian.net/browse/ANSTRAT-1758) (content operations)
> **Companion docs:** [ANSTRAT-2497 implementation guide](./anstrat-2497-implementation-guide.md), [Picker operation contract (draft)](./anstrat-1758-picker-contract-proposal.md)
> **Status:** Planning — no code split started for backend modules
> **Branch baseline:** `main` / `anstrat-2497-poc` in `ansible-backstage-plugins` (frontend rename to `@ansible/portal-scaffolder` done in PoC)
>
> This document is the ordered plan to align the scaffolder stack with the target
> `workspaces/self-service/` and `workspaces/aap/` layout. It describes what exists today,
> what moves where, which contracts block parallel work, and phased deliverables.

---

## 1. What This Effort Owns

From the canonical architecture (§7.1), **self-service and portal core** own scaffolder UX;
**AAP integration** owns Controller/Hub automation actions; **content management** owns
the data those pickers display.

This guide covers **scaffolder-specific** deliverables:

| Deliverable | Owner team | Purpose |
| ----------- | ---------- | ------- |
| `@ansible/portal-scaffolder` (frontend) | Self-service | Templates, tasks, history, EE **definition** catalog, scaffolder field extensions |
| `self-service-react` (new web-library) | Self-service | Reusable scaffolder fields **without** content imports (`AAPResourcePicker`, `ScmSelector`, …) |
| `scaffolder-backend-module-self-service` | Self-service | EE definition lifecycle actions, `EEEntityProvider` route, publish prep — **no AAP REST** |
| `scaffolder-backend-module-content-operations` | Self-service (bridge) | Invokes ANSTRAT-1758 `operationId`s from scaffolder autocomplete/actions; **no content DB** |
| `scaffolder-backend-module-aap` | AAP integration | `rhaap:*` template actions, AAP autocomplete resources, template filters |
| Picker → `automation-content-client` migration | Self-service + 1758 | Replace catalog-backed autocomplete for collections / base images (§7.5) |

**Out of scope for this guide (other teams / tickets):**

- Splitting `catalog-backend-module-rhaap` (PAH, git sources, AAP entity providers) — see architecture §7.4
- `ansible:content:create` creator-service integration — stays automation-path until explicitly moved
- Repo rename to `automation-portal-plugins` and `workspaces/self-service/` physical move — coordinate with ANSTRAT-2497 Phase 7

---

## 2. Current Baseline (What Ships Today)

### 2.1 Frontend — `@ansible/portal-scaffolder` (`plugins/self-service`)

Single Backstage frontend plugin (`id: portal-scaffolder`) that still bundles content
browsing, shell pieces, and the full scaffolder surface.

**Eleven scaffolder field extensions** (registered via `scaffolderPlugin.provide(createScaffolderFieldExtension(...))` and re-exported from `src/index.ts`):

| Field extension | Data at runtime | Architecture bucket |
| --------------- | --------------- | ------------------- |
| `CollectionsPicker` | `scaffolderApi.autocomplete` → provider `aap-api-cloud`, resources `collections` / `collection_sources` / `collection_versions` | **Content boundary (§7.5)** — must move to `automation-content-client` |
| `BaseImagePicker` | Static template schema / hardcoded recommended image | **Content boundary** — becomes dynamic via `content.executionEnvironments.listBaseImages` |
| `AAPResourcePicker`, `AAPTokenField` | AAP APIs via plugin `apis` | `self-service-react` |
| `ScmSelector`, `FileUploadPicker` | SCM / upload UX | `self-service-react` |
| `PackagesPicker`, `AdditionalBuildStepsPicker`, `EEFileNamePicker`, `EETagsPicker`, `MCPServersPicker` | Pure form UX (enum/schema driven) | `self-service-react` (no content client) |

**Coupling to fix:** `CollectionsPicker` ultimately loads collection entities via the
scaffolder autocomplete path → `getCollections()` in the backend module, which queries
the **catalog** (`discovery` + catalog API). That ties template forms to catalog
projection and the monolithic `catalog-backend-module-rhaap`, which violates §7.5
(operations + client, not catalog search).

### 2.2 Backend — `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`

One `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` registers
**everything** in `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`:

**Template actions**

| Action ID | File | Target module |
| --------- | ---- | ------------- |
| `ansible:content:create` | `actions/ansible.ts` | **TBD** — creator-service; not AAP; keep with self-service until creator ownership is clear |
| `ansible:create:ee-definition` | `actions/createEEDefinition.ts` | `scaffolder-backend-module-self-service` |
| `ansible:prepare:publish` | `actions/prepareForPublish.ts` | `scaffolder-backend-module-self-service` |
| `rhaap:create-project` | `actions/aapCreateProject.ts` | `scaffolder-backend-module-aap` |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts` | `scaffolder-backend-module-aap` |
| `rhaap:create-job-template` | `actions/aapCreateJobTemplate.ts` | `scaffolder-backend-module-aap` |
| `rhaap:launch-job-template` | `actions/aapLaunchJobTemplate.ts` | `scaffolder-backend-module-aap` |
| `rhaap:clean-up` | `actions/aapCleanUp.ts` | `scaffolder-backend-module-aap` |

**Template filters:** `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter` → AAP templates → `scaffolder-backend-module-aap`.

**Autocomplete provider:** `id: 'aap-api-cloud'` → `handleAutocompleteRequest` in `src/autocomplete/autocomplete.ts`:

- `collections` → catalog entity query (`getCollections` in `autocomplete/utils.ts`) — **move to content-operations bridge**
- `verbosity`, `aaphostname` → config / static — split by consumer (AAP vs self-service)
- All other `resource` strings → `ansibleService.getResourceData` — **AAP module**

**Dependencies:** `@ansible/backstage-rhaap-common` (`ansibleServiceRef`, DTOs), Backstage scaffolder extension points, config, auth, discovery.

### 2.3 Catalog — `EEEntityProvider` (today in `catalog-backend-module-rhaap`)

`POST /ansible/ee` registers execution environment **definitions** pushed from the scaffolder
(architecture §7.4). The provider itself is ~50 lines and does not touch OCI/registries.

**Target:** HTTP route stays reachable; provider implementation lives in
`scaffolder-backend-module-self-service` (or `self-service` backend plugin) and is **wired**
into catalog via a thin registration module — not left inside the content catalog module.

### 2.4 PoC alignment already done (ANSTRAT-2497)

- Plugin package renamed to `@ansible/portal-scaffolder`, manifest `portal-scaffolder`
- Extension host capabilities for detail/list tabs (not scaffolder fields yet)
- `portal-plugin-node` / `portal-extension-*` packages exist for non-scaffolder SDK work

**Not done:** backend module split, `self-service-react`, content-operation bridge, picker client migration, `scaffolder-field` entries in `PluginManifest`.

---

## 3. Target Package Layout

Per architecture §2.2 (within future `workspaces/self-service/` and `workspaces/aap/`):

```
workspaces/self-service/plugins/
├── portal-scaffolder/                    # frontend-plugin (today: plugins/self-service)
│   Routes: /self-service/*, templates, tasks, history, EE definition catalog
│   Registers scaffolder fields (imports from self-service-react)
│   PluginManifest: SELF_SERVICE experience + future scaffolder-field capabilities
│
├── self-service-common/                  # common-library (extract shared types/constants)
├── self-service-react/                   # web-library
│   All field extensions except CollectionsPicker/BaseImagePicker data layer
│   Depends on: @backstage/plugin-scaffolder-react, @ansible/portal-plugin-sdk
│   Must NOT depend on catalog APIs or content-type packages
│
├── scaffolder-backend-module-self-service/
│   Actions: ansible:create:ee-definition, ansible:prepare:publish
│   Optional: ansible:content:create until moved
│   HTTP: POST /ansible/ee (+ build route if still owned here)
│   EEEntityProvider registration
│   portal-plugin.yaml — installGroup: self-service
│
└── scaffolder-backend-module-content-operations/
    Autocomplete provider(s) that map scaffolder resources → operationId invocations
    Uses: @ansible/automation-content-client (peer), @ansible/portal-plugin-node
    No direct catalog/database imports — only typed operations from content backend
    portal-plugin.yaml — installGroup: self-service, featureGate: content.enabled

workspaces/aap/plugins/
└── scaffolder-backend-module-aap/
    Actions: rhaap:*
    Autocomplete: aap-api-cloud (AAP resource branch only)
    Template filters for AAP use cases
    Depends on: aap-node / ansibleServiceRef (renamed when aap workspace lands)
```

**Naming migration (when splitting packages):**

| Current | Target |
| ------- | ------ |
| `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` | Split into three modules above |
| `moduleId: 'ansible'` | `self-service`, `content-operations`, `aap` (separate backend modules, same `pluginId: 'scaffolder'`) |

**Backward compatibility:** Keep registering all three modules in dev `packages/backend` until RHDH dynamic plugin manifests list them separately. Action IDs and autocomplete provider IDs **must not change** in Phase 1 split (only package boundaries move).

---

## 4. Design Decisions (Architecture-Aligned)

### 4.1 Scaffolder fields are capabilities (optional Phase 5+)

Architecture §6.3 defines `ContributionKind: 'scaffolder-field'` and `ExperienceId: SELF_SERVICE`.
Long term, field extensions can be declared on `PluginManifest` and discovered by the host.
**Near term:** keep Backstage `createScaffolderFieldExtension` registration in `portal-scaffolder`
to avoid blocking on host RJSF/scaffolder integration. Track manifest entries as a follow-up
once `portal-extension-host` can mount scaffolder fields.

### 4.2 No handler URLs in manifests (security invariant)

Picker data fetching must use `usePortalContext().apiClient` (typed
`automation-content-client`) or scaffolder autocomplete that calls
**registered operations** on the server — not `catalogApi.getEntities` from field components.

The content-operations module is the adapter:

```
CollectionsPicker (UI)
  → scaffolderApi.autocomplete({ provider: 'portal-content-operations', resource: 'collections.search', ... })
  → bridge resolves resource string → operationId → content backend handler
  → audit + permission pipeline on content side
```

Provider ID can remain `aap-api-cloud` for one release with a deprecation log, or switch to
`portal-content-operations` with a parallel provider during migration (prefer **new provider**
to make misconfiguration obvious).

### 4.3 Definition vs built image (do not conflate)

- Scaffolder templates author **`execution-environment-definition`** content (yaml in git).
- `BaseImagePicker` after migration lists **`execution-environment-image`** candidates
  (built images), not definition catalog rows (architecture §7.2 table).

### 4.4 EE entity registration stays on the definition path

`EEEntityProvider` + `POST /ansible/ee` remain self-service-owned (§7.4). Content team
does not absorb this endpoint when PAH/git providers move out of `catalog-backend-module-rhaap`.

### 4.5 Workspace dependency rule

`workspaces/self-service/**` may depend on content packages **by published version only**
(architecture §2.3). `self-service-react` depends on `@ansible/automation-content-client`
for picker hooks; it must not import `content-type-*` or backend modules.

---

## 5. Ordered Work Packages

Phases are sequenced by dependency. Phases 1–3 can start without ANSTRAT-1758 shipping;
Phase 4 hard-depends on published operations.

### Phase 0 — Contract freeze (prerequisite)

**Output:** Machine-readable list of scaffolder action IDs, autocomplete resources, and field extension names (extend WP-001 inventory in `tools/wp-001`).

| Item | Status |
| ---- | ------ |
| Register all `ansible:*` and `rhaap:*` action IDs | ❌ |
| Register autocomplete resources (`collections`, `collection_sources`, …) | ❌ |
| Document template YAML dependencies on provider id `aap-api-cloud` | ❌ |

---

### Phase 1 — Split backend module (no behaviour change)

**Output:** Three packages replacing one; same action/filter/autocomplete behaviour; all existing tests green.

**Work:**

| Item | Source | Notes |
| ---- | ------ | ----- |
| Create `scaffolder-backend-module-aap` | Move `aap*.ts`, AAP branch of `autocomplete.ts`, filters, `ansibleService` deps | `moduleId: 'aap'` |
| Create `scaffolder-backend-module-self-service` | `createEEDefinition`, `prepareForPublish`, `ansible:content:create` (if kept) | `moduleId: 'self-service'` |
| Create `scaffolder-backend-module-content-operations` | `getCollections` + catalog autocomplete resources only (temporary) | Thin wrapper; catalog coupling explicit |
| Deprecate `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` | Re-export shim or delete after backend wiring updated | Coordinate RHDH `dynamicPlugins.backend` entries |
| Update `packages/backend/src/index.ts` | Add three `backend.add(import(...))` | Remove monolithic import |
| Split unit tests per package | Mirror `src/actions/*.test.ts` layout | |

**Verification:** Run scaffolder module tests; smoke-test EE template end-to-end in dev app.

---

### Phase 2 — Extract `self-service-react`

**Output:** `@ansible/self-service-react` web-library; `portal-scaffolder` imports fields from it.

| Item | Source | Status |
| ---- | ------ | ------ |
| Move `plugins/self-service/src/components/Scaffolder/*` except picker-specific data hooks | `self-service-react/src/scaffolder/` | ❌ |
| Keep `CollectionsPicker` / `BaseImagePicker` in portal-scaffolder or `self-service-react` with injectable `dataSource` prop | Enables Phase 4 swap without file churn | ❌ |
| Peer deps: `scaffolder-react`, `portal-plugin-sdk`, MUI v4 | Match portal-scaffolder | ❌ |
| Re-export shims from `portal-scaffolder` for external dynamic plugin consumers | Same pattern as portal-plugin-sdk extraction | ❌ |

---

### Phase 3 — Move `EEEntityProvider` to self-service backend

**Output:** Catalog mutation for EE definitions owned by self-service module; `catalog-backend-module-rhaap` delegates or drops route.

| Item | Notes |
| ---- | ----- |
| Move `EEEntityProvider` class + `POST /ansible/ee` handler | Register router from `scaffolder-backend-module-self-service` or small `self-service-backend` plugin |
| Keep URL path stable | Architecture §7.7 — no URL regression |
| Update `createEEDefinition` catalog registration path | Still uses discovery + service token; only provider location changes |
| Tests from `catalog-backend-module-rhaap/src/router.test.ts` (`POST /ansible/ee`) | Move with route |

---

### Phase 4 — Content operation bridge + picker migration (blocked on ANSTRAT-1758)

**Dependency:** Published `@ansible/automation-content-client` with operations agreed in
[anstrat-1758-picker-contract-proposal.md](./anstrat-1758-picker-contract-proposal.md).

**Output:** Collection and base-image pickers use operations; content-operations module stops calling catalog.

| Item | Notes |
| ---- | ----- |
| Implement operation handlers in content backend (`content.collections.search`, `listSources`, `listVersions`, `content.executionEnvironments.listBaseImages`) | ANSTRAT-1758 |
| `scaffolder-backend-module-content-operations`: map autocomplete resources → `operationId` | Uses `portal-plugin-node` identity on server |
| `CollectionsPicker`: call new provider or `usePortalContext().apiClient` directly | Prefer client from field if scaffolder autocomplete is redundant |
| `BaseImagePicker`: dynamic list + recommended badge from operation | Remove hardcoded `RECOMMENDED_BASE_IMAGE_VALUE` as sole source |
| Remove `getCollections` catalog scan from bridge | Delete catalog dependency from self-service workspace |
| Feature gate: degrade gracefully when `content.enabled` false | Show message in picker per appliance constraints (architecture §8.3) |

**Contract checklist (from ANSTRAT-2497 §7):**

1. Operation IDs + JSON schemas for all collection picker steps  
2. `listBaseImages` schema + permissions  
3. Client package surface (`automation-content-client` vs picker-only API)  
4. Permission names per operation  
5. Pagination/cursor semantics for large collection lists  

---

### Phase 5 — AAP workspace extraction

**Output:** `scaffolder-backend-module-aap` lives under `workspaces/aap/` with `aap-node` dependency only (no `backstage-rhaap-common` long term).

| Item | Notes |
| ---- | ----- |
| Move package physically with `catalog-backend-module-aap` split | Architecture §7.4 |
| Align autocomplete `aap-api-cloud` naming with AAP plugin id | Document in AAP scaffolder README |
| `AAPResourcePicker` uses same AAP client as module | Frontend in `aap-frontend` or `self-service-react` |

---

### Phase 6 — Manifest and host integration (portal core)

**Output:** Scaffolder fields discoverable as capabilities where useful.

| Item | Notes |
| ---- | ----- |
| Add `scaffolder-field` entry points to `selfServiceManifest.ts` for first-party fields | `experienceId: SELF_SERVICE`, `appliesToContentTypes: '*'` |
| Document partner pattern: third-party fields via dynamic plugin + manifest | §6.3 walkthrough / `workflowId` for golden paths |
| Optional: scaffolder tasks invoke content operations via bridge only | Partner actions = thin `createTemplateAction` + `operationId` (see `content-experience-refactor-and-sdk.md` WP-026) |

---

### Phase 7 — Physical workspace move + rename

Coordinate with [ANSTRAT-2497 Phase 7](./anstrat-2497-implementation-guide.md#phase-7--rename-and-restructure):

- `plugins/self-service` → `workspaces/self-service/plugins/portal-scaffolder`
- Backend modules under `workspaces/self-service/plugins/` and `workspaces/aap/plugins/`
- `portal-plugin.yaml` per shippable backend module (architecture §8.5)

---

## 6. Contracts Published for Other Teams

| Consumer | Contract | Provided by |
| -------- | -------- | ----------- |
| ANSTRAT-1758 | Operation IDs + schemas in picker proposal | Content backend + client |
| Self-service bridge | Stable autocomplete `resource` string → `operationId` map | `scaffolder-backend-module-content-operations` README |
| AAP team | Stable `rhaap:*` action schemas | `scaffolder-backend-module-aap` |
| Template authors | Action IDs unchanged across split | Changelog entry per Phase 1 |
| RHDH / operator | Three backend dynamic plugin entries instead of one | `portal-plugin.yaml` installGroup |

**Semver:** Backend module split is **internal packaging** if action IDs stable — minor bump on `@ansible/plugin-scaffolder-backend-module-*` packages. Breaking action schema changes require changelog + template repo coordination (`ansible-rhdh-templates`).

---

## 7. Boundary Agreement Needed Now

Same as ANSTRAT-2497 §7 — the scaffolder split is blocked on **picker operations**, not on EE actions.

**Minimum to unblock Phase 4:**

1. Agree on [picker contract proposal](./anstrat-1758-picker-contract-proposal.md) (or revised IDs)
2. Content team ships handlers + client release
3. Self-service ships bridge + UI switch behind config flag `ansible.scaffolder.useContentOperations: true`

Until then, **Phase 1–3** can proceed (module split, react library, EE provider move) without content team delivery.

---

## 8. Open Questions

| Question | Owner | Blocking |
| -------- | ----- | -------- |
| Does `ansible:content:create` stay self-service or move to a creator plugin? | Self-service + devtools | Phase 1 package list |
| Keep autocomplete provider id `aap-api-cloud` for collections during migration? | Self-service | Phase 4 UX |
| Should `POST /ansible/ee/build` move with EE provider or stay in catalog module? | Self-service | Phase 3 |
| Partner scaffolder actions: only via content-operations bridge or also direct `portal-plugin-node`? | Portal core | Phase 6 |
| Register scaffolder fields in `PluginManifest` before host can render them? | Portal core | Phase 6 vs Backstage-only registration |

---

## 9. Suggested Sequencing with ANSTRAT-2497

| ANSTRAT-2497 phase | Scaffolder work |
| ------------------ | --------------- |
| Phase 6 (content extraction) | Phase 4 pickers + remove catalog autocomplete |
| Phase 7 (rename / workspaces) | Phase 7 physical layout |
| SDK (`usePortalContext`) | Required for direct client calls from pickers; bridge still works without it |

---

## 10. Documentation Deliverables

| Document | Location | Status |
| -------- | -------- | ------ |
| This guide | `docs/next/scaffolder-rearchitecture-implementation-guide.md` | ✅ This file |
| Picker operation contract | `docs/next/anstrat-1758-picker-contract-proposal.md` | Draft |
| Per-module README after split | `plugins/scaffolder-backend-module-*/README.md` | ❌ |
| Dynamic plugin registration (3 modules) | `docs/plugins/scaffolder.md` | Update after Phase 1 |
| Migration: monolithic → split imports | `docs/sdk/migration-scaffolder-modules.md` | ❌ |

---

## Appendix A — Autocomplete resource map (current → target)

| Resource (today) | Implementation today | Target |
| ---------------- | -------------------- | ------ |
| `collections` | Catalog entity filter via `getCollections` | `content.collections.search` |
| `collection_sources` | Catalog-derived | `content.collections.listSources` |
| `collection_versions` | Catalog-derived | `content.collections.listVersions` |
| `verbosity` | Static list | `scaffolder-backend-module-aap` or self-service |
| `aaphostname` | Config | `scaffolder-backend-module-aap` |
| `*` (AAP resources) | `ansibleService.getResourceData` | `scaffolder-backend-module-aap` |

---

## Appendix B — Reference map to source files

| Concern | Path |
| ------- | ---- |
| Module registration | `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` |
| Catalog-backed collections | `plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/utils.ts` |
| EE definition action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts` |
| Field extensions | `plugins/self-service/src/components/Scaffolder/` |
| EE push registration | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `router.ts` |
| Backend wiring | `packages/backend/src/index.ts` |
