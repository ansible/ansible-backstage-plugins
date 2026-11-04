# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 covers workspace layout, §7.3–§7.4 covers backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` by functional
> ownership. AAP actions belong to an AAP workspace plugin; actions tied to the creator CLI /
> ADT belong to a content-development workspace plugin. Autocomplete providers follow the
> system they query. Phase 1 established the initial split; this guide records the intended
> content-development placement and follow-up migration.

---

## 1. Current State: What Lives in the Monolith Today

The scaffolder backend module today is a single package that registers AAP Controller actions, EE definition authoring actions, publish actions, template filters, and an autocomplete provider — all under one `moduleId: 'ansible'`. These concerns belong to different domains and should be independently deployable. The meeting decision adds a functional boundary: creator CLI / ADT workflows belong with content development, while AAP Controller workflows belong with AAP.

### 1.1 Repository layout (main branch)

```
plugins/
├── backstage-rhaap/                          # AAP frontend plugin
├── backstage-rhaap-common/                   # Shared: ansibleServiceRef, AAPClient, ScmClientFactory
├── catalog-backend-module-rhaap/             # Catalog providers (PAH, git, AAP, EE)
├── auth-backend-module-rhaap-provider/       # AAP auth
├── scaffolder-backend-module-backstage-rhaap/ # ← monolithic, being split
└── self-service/                             # Frontend plugin
packages/
└── backend/src/index.ts                      # Backend wiring
```

### 1.2 Module registration and backend wiring

`plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` — a single `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` that registers everything.

`packages/backend/src/index.ts` has one entry:

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

Per the Content Experience Architecture §2.2, the target is one workspace per experience:

```
workspaces/
├── aap/plugins/
│   ├── aap-common/  aap-node/  aap/  aap-backend/     # renamed from backstage-rhaap-*
│   ├── auth-backend-module-aap-provider/
│   ├── catalog-backend-module-aap/
│   └── scaffolder-backend-module-aap/                   # AAP actions + AAP autocomplete
│
└── content-development/plugins/
    └── scaffolder-backend-module-content-development/   # creator CLI / ADT actions + content autocomplete
```

**Workspace note.** The meeting separates content management from content development and moves creator CLI / ADT authoring workflows into content development. “Scaffolder” remains the Backstage term for template creation; it does not define the workspace that owns every action. The backend module follows functional ownership, so creator-dependent actions live with content development.

### Module identity

| Before                             | After                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'content-development'` (two modules, same `pluginId: 'scaffolder'`) |

**Breaking migration.** Action IDs and template filter names remain stable, but the monolithic package is removed. Operators must update `dynamic-plugins.yaml` to load the two replacement packages instead, and migrate `aap-api-cloud` references to `aap-api` for AAP resources or `portal-catalog` for collections. No compatibility shim is retained.

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

`ansible:prepare:publish` imports `ScmClientFactory` from `@ansible/backstage-rhaap-common`. That barrel also exports `AAPClient`, `AAPService`, and `permissions`. The content-development module therefore still has a transitive dependency on AAP code. Full independence requires splitting `backstage-rhaap-common` itself (SCM client → shared package; AAP client/service → `aap-common`/`aap-node`). This is a known transitional dependency.

`createEEDefinition.ts` is ~1240 lines containing PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. It depends on creator-service / ADT configuration and belongs in content development. Move it without behavior changes first; extract its AAP/catalog reads behind a content-side contract as follow-up work.

**Its config dependency is wider than `ansible.creatorService` + `ansible.devSpaces`.** The file also reads:

- `ansible.rhaap.baseUrl` — to build `galaxy_server` entries for the creator service payload
- `catalog.providers.rhaap.<envId>.sync.pahCollections.repositories` — PAH repository identifiers
- `catalog.providers.rhaap.<envId>.sync.ansibleGitContents.providers.<provider>` — SCM canonical-source resolution

These are AAP/catalog config keys, not content-development's own. During the initial split, `createEEDefinition` still reads them from the portal-scaffolder module. After moving the action to content development, its `config.d.ts` must continue to declare those read dependencies until the PAH/SCM resolution logic is extracted behind a content-side contract. §1.3's config table describes ownership, not every transitional read. Track this as follow-up work.

### 3.3 EE entity registration

Replace both EE HTTP routes in Phase 1 with a root-scoped, in-process EE lifecycle service. `createEEDefinition.ts` calls this service directly; it does not call the catalog router or expose replacement HTTP endpoints.

The service has two operations: register an EE entity through `EEEntityProvider`, and remove an existing EE entity before re-registration. Its implementation owns the catalog interaction and provider cleanup, rather than having the portal action call raw catalog APIs.

**The migration unit is both routes together.** `createEEDefinition.ts` currently calls `DELETE /ansible/ee/:name` to clean up an existing catalog entity before re-registering it (`router.ts` line 404), and the two routes have different credential flows:

| Route                      | Credentials used in `createEEDefinition.ts`                                       | Router `allow`        | Effective RBAC                                       |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `POST /ansible/ee`         | `auth.getOwnServiceCredentials()` — pure service-to-service                       | `['service']`         | No per-user check; scaffolder's own service identity |
| `DELETE /ansible/ee/:name` | `getInitiatorCredentials()` forwarded via `onBehalfOf` — the calling user's token | `['user', 'service']` | Catalog's own delete-permission RBAC, per user       |

The lifecycle service must preserve those flows: registration keeps the existing service-credentialed behavior; removal receives the initiator credentials and continues to enforce catalog delete permission for that user. It must also retain the provider-ownership branch: cleanup is skipped entirely for non-SCM, provider-managed entities (detected via the `ansible.io/download-experience` annotation), since those upsert in place rather than needing a delete-then-recreate.

Once direct lifecycle-service calls have parity coverage, remove `POST /ansible/ee` and `DELETE /ansible/ee/:name`, their router wiring, service-token/discovery use for registration, and the route-specific tests. Add service-level coverage for registration, user-authorized deletion, SCM cleanup, provider unregistering, and provider-managed entity handling.

This follows the direct-registration pattern proposed in [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189), extended to cover the deletion lifecycle rather than only `POST /ansible/ee`.

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

### 4.3 Breaking package migration

`scaffolder-backend-module-backstage-rhaap` is removed as part of this migration. It is not retained as a compatibility shim. The Phase 1 PRs introduced the AAP and portal-scaffolder packages; the follow-up target replaces the transitional portal-scaffolder backend package with the content-development package. Consumers of the final split install and configure the AAP and content-development packages. Keep the old and replacement packages from registering the same actions or autocomplete provider at the same time.

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

### Phase 1 — Initial split and EE lifecycle replacement (#992–#999)

The eight-PR sequence freezes contracts, adds and wires the AAP module, adds and wires the portal/content actions, and switches the backend harness to the split modules. The initial implementation placed creator-dependent actions and the catalog autocomplete provider in the portal-scaffolder backend module. Treat that as the migration starting point; the target below moves those responsibilities into content development per the workspace decision.

| Item                                                                                      | Notes                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/`                            | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'`                                                                                                                                                                                                           |
| Initial package: `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/` | Phase 1 package for `createEEDefinition`, `prepareForPublish`, `ansible.ts`, and `portal-catalog`; follow-up moves creator-dependent actions and provider to content development.                                                                                                    |
| Split `config.d.ts` per module                                                            | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; the initial portal-scaffolder package reads creator config, while the target content-development package owns `ansible.creatorService` + `ansible.devSpaces` and temporarily declares AAP/catalog read dependencies — see §3.2 |
| Each module gets its own `src/dynamic/index.ts`                                           | One dynamic plugin installer per shippable module                                                                                                                                                                                                                                    |
| Update backend wiring                                                                     | Two `backend.add(import(...))` replacing one                                                                                                                                                                                                                                         |
| Migrate autocomplete-provider references                                                  | Use `aap-api` for AAP resources and `portal-catalog` for collections; follow-up moves the content provider implementation to content development while preserving its ID                                                                                                             |
| Add the EE lifecycle service                                                              | The portal action calls it directly for registration and cleanup; preserve service registration, user-authorized deletion, SCM cleanup, provider unregistering, and the provider-managed entity skip                                                                                 |
| Remove both EE routes after parity coverage                                               | Delete `POST /ansible/ee` and `DELETE /ansible/ee/:name`, router wiring, and route-specific tests; do not add replacement HTTP endpoints                                                                                                                                             |
| Remove original package                                                                   | No compatibility shim; release migration notes cover the required package, dynamic-plugin, and provider-reference changes                                                                                                                                                            |
| Split unit tests and shared `src/mock/` fixtures                                          | Shared fixtures duplicated or extracted to a test-util                                                                                                                                                                                                                               |

**Verification:** scaffolder module tests pass; smoke-test an EE template end-to-end in the dev app.

### Phase 2 — Move creator-dependent actions into content development

| Item                                                                                           | Notes                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `workspaces/content-development/plugins/scaffolder-backend-module-content-development/` | Register actions that use the creator CLI / ADT, including content creation, EE definition, and publish preparation. Confirm each action’s actual runtime dependencies before moving it. |
| Move catalog/content autocomplete implementation                                               | Move `portal-catalog` and collection lookup helpers beside content-development actions; retain the provider ID and picker contract.                                                      |
| Update backend registration and dynamic-plugin configuration                                   | Register the content-development module and remove migrated registrations from the transitional portal-scaffolder module without duplicate action or provider IDs.                       |
| Preserve creator and EE behavior                                                               | Keep configuration, authorization, and lifecycle behavior stable; update tests and operator documentation for package ownership.                                                         |

### Phase 3 — Remove the AAP dependency from content development

| Item                                                                       | Notes                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Extract `ScmClientFactory` to a shared or content-development package      | Keep SCM functionality out of AAP-only packages                                       |
| Replace transitional AAP/catalog config reads with a content-side contract | `createEEDefinition` should not own AAP configuration just to resolve content sources |
| Drop `backstage-rhaap-common` from content-development `package.json`      | Achieves independence from AAP implementation details                                 |

---

## 6. Key Constraints and Contracts

| Consumer         | Contract                                                                                                                  | Provided by                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Template authors | Action IDs and template filter names unchanged; autocomplete provider references migrate to `aap-api` or `portal-catalog` | Changelog entry and migration note |
| RHDH / operator  | Two backend dynamic plugin entries instead of one                                                                         | Updated `dynamic-plugins.yaml`     |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Post-Split Backend Surface

| Package                                                         | Registers                                                                                             | Owns                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@ansible/plugin-scaffolder-backend-module-aap`                 | `rhaap:*` actions, template filters, `aap-api`                                                        | AAP actions and AAP Controller autocomplete                      |
| `@ansible/plugin-scaffolder-backend-module-content-development` | `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish`, `portal-catalog` | Creator CLI / ADT actions and content/catalog autocomplete       |
| EE lifecycle service                                            | No HTTP routes                                                                                        | EE registration, user-authorized cleanup, and provider lifecycle |

---

## 8. Open Questions

| Question                                                                                                                            | Blocking |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Does each action listed for content development actually depend on the creator CLI / ADT, or should the ownership list be narrower? | Phase 2  |
| Should `backstage-rhaap-common` be split so content development drops the AAP implementation dependency? (§3.2)                     | Phase 3  |
| Which AAP/catalog reads in `createEEDefinition.ts` should become a content-side API? (§3.2)                                         | Phase 3  |

---

## Appendix A: Source File Map

| Concern               | Current path                                                                                                                               | Target                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module registration   | `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`                                                                          | Split into `workspaces/aap/plugins/scaffolder-backend-module-aap/` + `workspaces/content-development/plugins/scaffolder-backend-module-content-development/` |
| AAP actions           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aap*.ts`                                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/`                                                                                          |
| EE definition action  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts`                                                      | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                                          |
| Publish action        | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/prepareForPublish.ts`                                                       | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                                          |
| Content create action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/ansible.ts`                                                                 | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/`                                                          |
| Autocomplete          | `plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/`                                                                      | AAP lookups → AAP module; collection/content lookups → content-development module; preserve `aap-api` / `portal-catalog` IDs                                 |
| Template filters      | `plugins/scaffolder-backend-module-backstage-rhaap/src/filters/`                                                                           | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/`                                                                                          |
| AAP schemas           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapAction*.ts`                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/`                                                                                  |
| EE definition schema  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapActionSchemas.ts` (partial)                                    | `workspaces/content-development/plugins/scaffolder-backend-module-content-development/src/actions/schemas/eeDefinitionSchema.ts`                             |
| Config                | `plugins/scaffolder-backend-module-backstage-rhaap/config.d.ts`                                                                            | Split per module                                                                                                                                             |
| Backend wiring        | `packages/backend/src/index.ts`                                                                                                            | Two `backend.add()` calls                                                                                                                                    |
| EE push registration  | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `src/router.ts` (`POST /ansible/ee`, `DELETE /ansible/ee/:name`) | EE lifecycle service; both routes and their router wiring are removed after service-parity coverage — see §3.3 for credential and cleanup requirements       |
