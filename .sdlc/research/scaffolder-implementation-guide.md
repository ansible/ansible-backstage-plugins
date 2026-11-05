# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 covers workspace layout, §7.3–§7.4 covers backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` by functional
> ownership. AAP actions belong to an AAP workspace plugin; actions tied to the creator CLI /
> ADT belong to a content-development workspace plugin. Autocomplete providers follow the
> system they query. Phase 1 PRs implement the initial split; this guide records the intended
> content-development placement and follow-up migration.

---

## 1. Current State: What Lives in the Monolith Today

The scaffolder backend module today is a single package that registers AAP Controller actions, EE definition authoring actions, publish actions, template filters, and an autocomplete provider — all under one `moduleId: 'ansible'`. These concerns belong to different domains and should be independently deployable.

### 1.1 Repository layout (main branch)

```
workspaces/
├── aap/plugins/
│   ├── backstage-rhaap/                          # AAP frontend plugin
│   ├── backstage-rhaap-common/                   # AAP and shared backend contracts
│   ├── catalog-backend-module-rhaap/             # Catalog providers (PAH, git, AAP, EE)
│   ├── auth-backend-module-rhaap-provider/       # AAP auth
│   └── scaffolder-backend-module-backstage-rhaap/ # Monolithic scaffolder backend module
├── portal-scaffolder/plugins/portal-scaffolder/ # Frontend plugin
└── portal-core/packages/backend/                 # Backend wiring
```

### 1.2 Module registration and backend wiring

`workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` — a single `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` that registers everything.

`workspaces/portal-core/packages/backend/src/index.ts` has one entry:

```ts
backend.add(
  import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap'),
);
```

### 1.3 Config schema (single `config.d.ts`)

| Config path               | Belongs to                 |
| ------------------------- | -------------------------- |
| `ansible.rhaap`           | AAP module                 |
| `ansible.creatorService`  | Content-development module |
| `ansible.devSpaces`       | Content-development module |
| `catalog.providers.rhaap` | AAP module                 |

Backstage validates against the union of installed schemas — a mismatch is a startup failure.

### 1.4 String contract between autocomplete and EE definition

`autocomplete/utils.ts:formatSource()` emits display strings (`"Private Automation Hub / <repo>"`, `"<Provider> / <host> / <org> / <repo>"`) that `createEEDefinition.ts` parses back into structured data. The split puts a package boundary between producer and consumer. This format must be preserved as a tested contract.

---

## 2. Target State

Workspaces group packages by functional ownership; they do not map one-to-one to UI experiences. The target separates AAP integrations from content-development authoring functions so the portal can compose those capabilities into experiences independently:

```
workspaces/
├── aap/plugins/
│   ├── aap-common/  aap-node/  aap/  aap-backend/     # renamed from backstage-rhaap-*
│   ├── auth-backend-module-aap-provider/
│   ├── catalog-backend-module-aap/
│   └── scaffolder-backend-module-aap/                   # AAP actions + AAP autocomplete
│
└── content-development/plugins/
    ├── content-development-common/                      # shared creator and EE lifecycle contracts
    ├── catalog-backend-module-content-development/     # content-owned EE catalog provider
    └── scaffolder-backend-module-content-development/  # creator CLI / ADT actions + autocomplete
```

**Workspace note.** The team distinguishes content management from content development and moves creator CLI / ADT authoring workflows into content development. “Scaffolder” remains the Backstage term for template creation; it does not define the workspace that owns every action. The backend module follows functional ownership, so creator-dependent actions live with content development. Whether manifests must declare an `experience` remains a separate open decision; this guide assumes no change to that requirement.

### Module identity

| Before                             | After                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'content-development'` (two modules, same `pluginId: 'scaffolder'`) |

**Breaking migration.** Action IDs and template filter names remain stable, but the monolithic package is removed. Operators must load the AAP scaffolder module and both content-development backend modules (catalog provider and scaffolder actions), and migrate `aap-api-cloud` references to `aap-api` for AAP resources or `portal-catalog` for collections. No compatibility shim is retained.

---

## 3. What Moves, What Stays, and What Remains Transitional

### 3.1 Actions, filters, and autocomplete

| Action ID                            | File                              | Target module       |
| ------------------------------------ | --------------------------------- | ------------------- |
| `ansible:content:create`             | `actions/ansible.ts`              | content-development |
| `ansible:create:ee-definition`       | `actions/createEEDefinition.ts`   | content-development |
| `ansible:prepare:publish`            | `actions/prepareForPublish.ts`    | content-development |
| `rhaap:create-project`               | `actions/aapCreateProject.ts`     | aap                 |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts`       | aap                 |
| `rhaap:create-job-template`          | `actions/aapCreateJobTemplate.ts` | aap                 |
| `rhaap:launch-job-template`          | `actions/aapLaunchJobTemplate.ts` | aap                 |
| `rhaap:clean-up`                     | `actions/aapCleanUp.ts`           | aap                 |

**Template filters** → aap: `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`

**Autocomplete providers** follow the data source: AAP Controller lookups use `id: 'aap-api'` in the AAP module; collection and other content/catalog lookups use `id: 'portal-catalog'` in the content-development module. Keep each provider implementation beside the backend that owns the queried system. Keep provider IDs and request/response types as explicit contracts for picker and template consumers; extract shared types only if a second package needs them.

### 3.2 `backstage-rhaap-common` dependency edge and config reads

The Phase 1 portal-scaffolder module and `eeEntityLifecycleAdapter.ts` import `ScmClientFactory`, `EEEntityLifecycleService`, `EEEntityProviderService`, and both service refs from `@ansible/backstage-rhaap-common`. That package also exports AAP clients and services, so moving only `ScmClientFactory` would leave a package dependency on AAP internals.

**Target ownership:** move the creator/SCM client and EE lifecycle contracts (`EEEntityLifecycleService`, `EEEntityProviderService`, and their service refs) into a content-development shared package, proposed as `@ansible/content-development-common`. Move the lifecycle adapter with the content-development scaffolder backend module. Move the EE catalog provider and its factory/registration out of `catalog-backend-module-rhaap` into a content-development-owned catalog module, proposed as `@ansible/catalog-backend-module-content-development`. Keep AAP clients, AAP services, and AAP catalog providers in AAP packages. These target package names are proposals for the follow-up migration.

`createEEDefinition.ts` is ~1240 lines containing PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. It depends on creator-service / ADT configuration and belongs in content development. Move it without behavior changes first; extract its AAP/catalog reads behind a content-side contract as follow-up work.

**Its config dependency is wider than `ansible.creatorService` + `ansible.devSpaces`.** The file also reads:

- `ansible.rhaap.baseUrl` — to build `galaxy_server` entries for the creator service payload
- `catalog.providers.rhaap.<envId>.sync.pahCollections.repositories` — PAH repository identifiers
- `catalog.providers.rhaap.<envId>.sync.ansibleGitContents.providers.<provider>` — SCM canonical-source resolution

These are AAP/catalog config keys, not content-development's own. During the initial split, `createEEDefinition` still reads them from the portal-scaffolder module. After moving the action to content development, its `config.d.ts` must continue to declare those read dependencies until the PAH/SCM resolution logic is extracted behind a content-side contract. §1.3's config table describes ownership, not every transitional read. Track this as follow-up work.

### 3.3 EE entity registration

PR #999 replaces the EE HTTP calls with a lifecycle service. The current implementation uses two service references with different scopes:

- `eeEntityProviderServiceRef` is root-scoped. In Phase 1, `catalog-backend-module-rhaap` provides it by wrapping and registering `EEEntityProvider` with the catalog.
- `eeEntityLifecycleServiceRef` is plugin-scoped. The portal scaffolder backend module provides it through `EEEntityLifecycleAdapter`, which coordinates catalog permission checks, catalog operations, and the provider service.

`createEEDefinition.ts` obtains initiator credentials once and passes them to both unregister and register operations. Registration requires catalog create permission; replacement also requires delete permission for the existing entity. Unregister requires delete permission. The adapter uses those credentials for catalog requests, and skips provider-managed entity cleanup only after authorization. The action and adapter are in the portal scaffolder backend module in Phase 1; the follow-up moves them into content development.

Pinned implementation references at PR #999 head [`af7a46a`](https://github.com/ansible/ansible-backstage-plugins/commit/af7a46a9a5532423048c58012a360c3f73c605f0): [`EEEntityLifecycle.ts`](https://github.com/ansible/ansible-backstage-plugins/blob/af7a46a9a5532423048c58012a360c3f73c605f0/workspaces/aap/plugins/backstage-rhaap-common/src/EEEntityLifecycle.ts), [`eeEntityLifecycleAdapter.ts`](https://github.com/ansible/ansible-backstage-plugins/blob/af7a46a9a5532423048c58012a360c3f73c605f0/workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/eeEntityLifecycleAdapter.ts), [`createEEDefinition.ts`](https://github.com/ansible/ansible-backstage-plugins/blob/af7a46a9a5532423048c58012a360c3f73c605f0/workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/actions/createEEDefinition.ts), and [`catalog-backend-module-rhaap/src/module.ts`](https://github.com/ansible/ansible-backstage-plugins/blob/af7a46a9a5532423048c58012a360c3f73c605f0/workspaces/aap/plugins/catalog-backend-module-rhaap/src/module.ts).

**Historical HTTP design, before PR #999.** The earlier route implementation used different credential flows:

| Route                      | Credentials used in `createEEDefinition.ts`                                       | Router `allow`        | Effective RBAC                                       |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `POST /ansible/ee`         | `auth.getOwnServiceCredentials()` — pure service-to-service                       | `['service']`         | No per-user check; scaffolder's own service identity |
| `DELETE /ansible/ee/:name` | `getInitiatorCredentials()` forwarded via `onBehalfOf` — the calling user's token | `['user', 'service']` | Catalog's own delete-permission RBAC, per user       |

PR #999 removes both routes and their route-specific tests. The service-level tests now cover create/replace/delete authorization and provider cleanup, rather than preserving the historical service-only POST flow.

### 3.4 Autocomplete providers follow the queried system

`handleAutocompleteRequest` currently branches on `resource === 'collections'` _before_ any Controller call — it queries the Backstage catalog via `getCollections()`, not AAP's Controller API. Portal's `CollectionsPicker` field currently reaches this branch through the same `aap-api-cloud` provider used by every other AAP resource.

The provider implementations belong beside the system they query:

- `scaffolder-backend-module-aap` registers `aap-api` for Controller-backed AAP resources.
- `scaffolder-backend-module-content-development` registers `portal-catalog` for `collections` and other content/catalog lookups used by creator workflows.
- `getCollections()` and `buildCollectionsFromCatalogEntities()` move with the content provider. They use auth, discovery, and logger, but do not call the Controller.
- `CollectionsPickerExtension.tsx` uses `portal-catalog`; AAP picker and template references use `aap-api`.

Keep provider registration and query implementation in the owning backend plugin. Keep picker UI in the workspace that owns the authoring workflow. Treat provider IDs and schemas as the API boundary; avoid making content development depend on AAP merely to access an autocomplete implementation.

CEA §7.5 still describes a longer-term option: a registered content operation with a declared schema and permission (e.g. `content.collections.list`), called through a typed client rather than a direct provider lookup. Keep that as a future architecture decision; the immediate split places the catalog-backed provider in content development and AAP-backed providers in AAP.

---

## 4. New Packages and Compatibility Package

### 4.1 `scaffolder-backend-module-aap`

Located at `workspaces/aap/plugins/scaffolder-backend-module-aap/`.

Package: `@ansible/plugin-scaffolder-backend-module-aap`.

- Actions: `rhaap:create-project`, `rhaap:create-execution-environment`, `rhaap:create-job-template`, `rhaap:launch-job-template`, `rhaap:clean-up`
- Autocomplete: `aap-api` for AAP resources
- Filters: `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`
- Config: `ansible.rhaap`, `catalog.providers.rhaap`
- `moduleId: 'aap'`

### 4.2 `scaffolder-backend-module-content-development`

Located at `workspaces/content-development/plugins/scaffolder-backend-module-content-development/`.

Proposed package: `@ansible/plugin-scaffolder-backend-module-content-development`.

- Actions: `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish`
- Autocomplete: `portal-catalog` for collection and content/catalog lookups
- Config: `ansible.creatorService`, `ansible.devSpaces`
- `moduleId: 'content-development'` (`pluginId: 'scaffolder'`)

The target also includes `@ansible/content-development-common` for the creator client and EE lifecycle contracts/service refs, plus `@ansible/catalog-backend-module-content-development` (`pluginId: 'catalog'`) for the EE entity provider and its root-scoped provider service. The scaffolder module owns the lifecycle adapter and consumes those contracts. This keeps all three packages in content-development without making the AAP workspace a package dependency.

### 4.3 Breaking package migration

`scaffolder-backend-module-backstage-rhaap` is removed as part of this migration. It is not retained as a compatibility shim. The Phase 1 PR series adds the AAP and portal-scaffolder packages; the follow-up replaces the transitional portal-scaffolder backend package with the content-development packages. Consumers of the final split install the AAP scaffolder module, the content-development catalog provider module, and the content-development scaffolder module. Keep the old and replacement packages from registering the same actions or autocomplete provider at the same time.

---

## 5. Action Plan

### Phase 0 — Contract freeze

Capture a machine-readable inventory before changing anything.

| Item                                                                               | Status |
| ---------------------------------------------------------------------------------- | ------ |
| Register all `ansible:*` and `rhaap:*` action IDs                                  | ✅     |
| Register autocomplete resources (`collections`, `collection_sources`, …)           | ✅     |
| Document provider migration from `aap-api-cloud` to `aap-api` and `portal-catalog` | ✅     |
| Capture the picker↔action source-string format as an explicit contract (§1.4)     | ✅     |

### Phase 1 PR series — Initial split and EE lifecycle replacement (#992–#999)

The eight-PR sequence freezes contracts, adds and wires the AAP module, adds and wires the portal/content actions, and switches the backend harness to the split modules. The initial implementation placed creator-dependent actions and the catalog autocomplete provider in the portal-scaffolder backend module. Treat that as the migration starting point; the target below moves those responsibilities into content development per the workspace decision.

| Item                                                                                      | Notes                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/`                            | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'`                                                                                                                                                                                                           |
| Initial package: `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/` | Phase 1 package for `createEEDefinition`, `prepareForPublish`, `ansible.ts`, and `portal-catalog`; follow-up moves creator-dependent actions and provider to content development.                                                                                                    |
| Split `config.d.ts` per module                                                            | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; the initial portal-scaffolder package reads creator config, while the target content-development package owns `ansible.creatorService` + `ansible.devSpaces` and temporarily declares AAP/catalog read dependencies — see §3.2 |
| Each module gets its own `src/dynamic/index.ts`                                           | One dynamic plugin installer per shippable module                                                                                                                                                                                                                                    |
| Update backend wiring                                                                     | Two `backend.add(import(...))` replacing one                                                                                                                                                                                                                                         |
| Migrate autocomplete-provider references                                                  | Use `aap-api` for AAP resources and `portal-catalog` for collections; follow-up moves the content provider implementation to content development while preserving its ID                                                                                                             |
| Replace EE HTTP routes with lifecycle services                                            | PR #999 removes both routes. The root-scoped provider ref is supplied by the catalog provider; the plugin-scoped lifecycle ref is implemented by the adapter. Create, replacement, and delete operations use initiator credentials and permission checks (§3.3).                     |
| Remove original package                                                                   | No compatibility shim; release migration notes cover the required package, dynamic-plugin, and provider-reference changes                                                                                                                                                            |
| Split unit tests and shared `src/mock/` fixtures                                          | Shared fixtures duplicated or extracted to a test-util                                                                                                                                                                                                                               |

**Verification:** service and scaffolder tests cover authorization and cleanup; compose the catalog provider and scaffolder module in the dev app and run an EE template end-to-end.

### Phase 2 — Move creator-dependent actions into content development

| Item                                                                                           | Notes                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `workspaces/content-development/plugins/scaffolder-backend-module-content-development/` | Register actions that use the creator CLI / ADT, including content creation, EE definition, and publish preparation. Confirm each action’s actual runtime dependencies before moving it.       |
| Move catalog/content autocomplete implementation                                               | Move `portal-catalog` and collection lookup helpers beside content-development actions; retain the provider ID and picker contract.                                                            |
| Update backend registration and dynamic-plugin configuration                                   | Register the content-development module and remove migrated registrations from the transitional portal-scaffolder module without duplicate action or provider IDs.                             |
| Move lifecycle contracts and provider ownership                                                | Put lifecycle types and refs in `@ansible/content-development-common`; move the EE provider service/factory and catalog registration to `@ansible/catalog-backend-module-content-development`. |
| Move the lifecycle adapter                                                                     | Keep `EEEntityLifecycleAdapter` in the content-development scaffolder module; update its imports to use content-development contracts.                                                         |
| Preserve creator and EE behavior                                                               | Keep configuration, authorization, and lifecycle behavior stable; update tests and operator documentation for package ownership.                                                               |

### Phase 3 — Remove the AAP dependency from content development

| Item                                                                               | Notes                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Move `ScmClientFactory` and EE lifecycle contracts out of `backstage-rhaap-common` | Keep SCM and EE content contracts out of AAP-only packages                                                                                                                                                                                                                     |
| Replace transitional AAP/catalog config reads with a content-side contract         | `createEEDefinition` should not own AAP configuration just to resolve content sources                                                                                                                                                                                          |
| Update backend/dynamic-plugin installation                                         | Register and install the content-development catalog provider and scaffolder module together; remove their `backstage-rhaap-common` imports and dependency                                                                                                                     |
| Add composition and dependency checks                                              | Compose both modules in the backend harness; verify the catalog module registers the EE provider, the scaffolder module resolves both refs, and missing provider registration fails startup. Assert content-development packages no longer depend on `backstage-rhaap-common`. |

---

## 6. Key Constraints and Contracts

| Consumer         | Contract                                                                                                                  | Provided by                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Template authors | Action IDs and template filter names unchanged; autocomplete provider references migrate to `aap-api` or `portal-catalog` | Changelog entry and migration note |
| RHDH / operator  | AAP scaffolder module plus content-development catalog and scaffolder modules                                             | Updated `dynamic-plugins.yaml`     |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Post-Split Backend Surface

| Package                                                         | Registers                                                          | Owns                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `@ansible/plugin-scaffolder-backend-module-aap`                 | `rhaap:*` actions, template filters, `aap-api`                     | AAP actions and AAP Controller autocomplete                          |
| `@ansible/content-development-common`                           | Creator client and EE lifecycle interfaces/service refs            | Content-development contracts shared by its backend modules          |
| `@ansible/catalog-backend-module-content-development`           | Catalog EE provider and root-scoped provider service               | Content-owned EE entity registration and provider lifecycle          |
| `@ansible/plugin-scaffolder-backend-module-content-development` | Content actions, `portal-catalog`, plugin-scoped lifecycle adapter | Creator CLI / ADT actions, autocomplete, and authorized EE lifecycle |

---

## 8. Open Questions

| Question                                                                                                                            | Blocking          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Does each action listed for content development actually depend on the creator CLI / ADT, or should the ownership list be narrower? | Phase 2           |
| Should plugin manifests require an `experience` field? This remains a separate decision; this guide does not propose removing it.   | Separate decision |
| Should the proposed content-development common and catalog packages use these names and boundaries? (§3.2, §4.2)                    | Phase 2           |
| Which AAP/catalog reads in `createEEDefinition.ts` should become a content-side API? (§3.2)                                         | Phase 3           |

---

## Appendix A: Source File Map

| Concern               | Current path                                                                                                                           | Target                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Module registration   | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`                                                       | AAP scaffolder module + content-development catalog and scaffolder modules                                                         |
| AAP actions           | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aap*.ts`                                                 | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/`                                                                |
| EE definition action  | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts`                                   | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                |
| Publish action        | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/prepareForPublish.ts`                                    | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                |
| Content create action | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/ansible.ts`                                              | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                |
| Autocomplete          | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/`                                                   | AAP lookups → AAP module; collection/content lookups → content-development module; preserve `aap-api` / `portal-catalog` IDs       |
| Template filters      | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/filters/`                                                        | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/`                                                                |
| AAP schemas           | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapAction*.ts`                                 | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/`                                                        |
| EE definition schema  | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapActionSchemas.ts` (partial)                 | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/schemas/eeDefinitionSchema.ts`   |
| Config                | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/config.d.ts`                                                         | Split per module                                                                                                                   |
| Backend wiring        | `workspaces/portal-core/packages/backend/src/index.ts`                                                                                 | Register the AAP catalog and scaffolder modules plus the content-development catalog and scaffolder modules                        |
| EE lifecycle contract | Phase 1: `workspaces/aap/plugins/backstage-rhaap-common/src/EEEntityLifecycle.ts`                                                      | `workspaces/content-development/plugins/content-development-common/src/EEEntityLifecycle.ts`                                       |
| EE lifecycle adapter  | Phase 1: `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/eeEntityLifecycleAdapter.ts`                       | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/eeEntityLifecycleAdapter.ts`             |
| EE catalog provider   | Phase 1: `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts` and `src/eeEntityLifecycleService.ts` | `workspaces/content-development/plugins/catalog-backend-module-content-development/`; register through the catalog extension point |
