# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 covers workspace layout, §7.3–§7.4 covers backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` into two
> backend modules — one for AAP integration, one for portal-scaffolder — with no behaviour
> change apart from the documented autocomplete-provider migration and the replacement of
> the EE HTTP routes with an in-process lifecycle service in Phase 1.

---

## 1. Current State: What Lives in the Monolith Today

The scaffolder backend module today is a single package that registers AAP Controller actions, EE definition authoring actions, publish actions, template filters, and an autocomplete provider — all under one `moduleId: 'ansible'`. These concerns belong to different domains and should be independently deployable.

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

| Config path               | Belongs to               |
| ------------------------- | ------------------------ |
| `ansible.rhaap`           | AAP module               |
| `ansible.creatorService`  | Portal-scaffolder module |
| `ansible.devSpaces`       | Portal-scaffolder module |
| `catalog.providers.rhaap` | AAP module               |

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
│   └── scaffolder-backend-module-aap/                   # NEW — AAP scaffolder actions
│
└── portal-scaffolder/plugins/
    └── scaffolder-backend-module-portal/                 # NEW — portal-scaffolder actions
```

**Naming note.** CEA §2.2 names this workspace/module `self-service` / `scaffolder-backend-module-self-service`. This guide uses `portal-scaffolder` / `scaffolder-backend-module-portal` instead, per a team naming decision communicated after CEA was written — that rename is not yet reflected in CEA or any other written architecture doc. Where this guide says `portal-scaffolder`, read CEA's `self-service`.

### Module identity

| Before                             | After                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'portal-scaffolder'` (two modules, same `pluginId: 'scaffolder'`) |

**Breaking migration.** Action IDs and template filter names remain stable, but the monolithic package is removed. Operators must update `dynamic-plugins.yaml` to load the two replacement packages instead, and migrate `aap-api-cloud` references to `aap-api` for AAP resources or `portal-catalog` for collections. No compatibility shim is retained.

---

## 3. What Moves, What Stays, and What Remains Transitional

### 3.1 Actions, filters, and autocomplete

| Action ID                            | File                              | Target module     |
| ------------------------------------ | --------------------------------- | ----------------- |
| `ansible:content:create`             | `actions/ansible.ts`              | portal-scaffolder |
| `ansible:create:ee-definition`       | `actions/createEEDefinition.ts`   | portal-scaffolder |
| `ansible:prepare:publish`            | `actions/prepareForPublish.ts`    | portal-scaffolder |
| `rhaap:create-project`               | `actions/aapCreateProject.ts`     | aap               |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts`       | aap               |
| `rhaap:create-job-template`          | `actions/aapCreateJobTemplate.ts` | aap               |
| `rhaap:launch-job-template`          | `actions/aapLaunchJobTemplate.ts` | aap               |
| `rhaap:clean-up`                     | `actions/aapCleanUp.ts`           | aap               |

**Template filters** → aap: `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`

**Autocomplete providers** → aap: `id: 'aap-api'` for AAP resources; portal-scaffolder: `id: 'portal-catalog'` for `collections`

### 3.2 `backstage-rhaap-common` dependency edge and config reads

`ansible:prepare:publish` imports `ScmClientFactory` from `@ansible/backstage-rhaap-common`. That barrel also exports `AAPClient`, `AAPService`, and `permissions`. The portal-scaffolder module therefore still has a transitive dependency on AAP code. Full independence requires splitting `backstage-rhaap-common` itself (SCM client → shared package; AAP client/service → `aap-common`/`aap-node` per §2.2). This is a known limitation for Phase 1.

`createEEDefinition.ts` is ~1240 lines containing PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. For Phase 1, it moves as-is with no behaviour change.

**Its config dependency is wider than `ansible.creatorService` + `ansible.devSpaces`.** The file also reads:

- `ansible.rhaap.baseUrl` — to build `galaxy_server` entries for the creator service payload
- `catalog.providers.rhaap.<envId>.sync.pahCollections.repositories` — PAH repository identifiers
- `catalog.providers.rhaap.<envId>.sync.ansibleGitContents.providers.<provider>` — SCM canonical-source resolution

These are AAP/catalog config keys, not portal-scaffolder's own. Moving the action into `scaffolder-backend-module-portal` as-is (Phase 1, no behaviour change) means that module's `config.d.ts` must also declare `ansible.rhaap` and `catalog.providers.rhaap` as read dependencies — not because portal-scaffolder owns that config, but because it still needs to read it until the PAH/SCM resolution logic inside this file is extracted to a content-side contract. §1.3's config table should be read as **ownership**, not as the complete list of config portal-scaffolder reads during Phase 1. Track this as a transitional read dependency; closing it is future work, not a Phase 1–3 deliverable.

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

### 3.4 `collections` uses a separate portal autocomplete provider

`handleAutocompleteRequest` currently branches on `resource === 'collections'` _before_ any Controller call — it queries the Backstage catalog via `getCollections()`, not AAP's Controller API. Portal's `CollectionsPicker` field currently reaches this branch through the same `aap-api-cloud` provider used by every other AAP resource.

The split gives collections its own provider rather than retaining that coupling:

- `scaffolder-backend-module-aap` registers `aap-api` for Controller-backed AAP resources.
- `scaffolder-backend-module-portal` registers `portal-catalog` for `collections`.
- `getCollections()` and `buildCollectionsFromCatalogEntities()` move with the portal provider. They use auth, discovery, and logger, but do not call the Controller.
- `CollectionsPickerExtension.tsx` updates its three provider strings from `aap-api-cloud` to `portal-catalog`; AAP picker and template references move from `aap-api-cloud` to `aap-api`.

CEA §7.5 still describes the longer-term design: a registered content operation with a declared schema and permission (e.g. `content.collections.list`), called through a typed client rather than a direct provider lookup, served by a dedicated `scaffolder-backend-module-content-operations` module (CEA §2.2). The separate `portal-catalog` provider is the Phase 1 step before that work.

---

## 4. New Packages and Compatibility Package

### 4.1 `scaffolder-backend-module-aap`

Located at `workspaces/aap/plugins/scaffolder-backend-module-aap/`.

- Actions: `rhaap:create-project`, `rhaap:create-execution-environment`, `rhaap:create-job-template`, `rhaap:launch-job-template`, `rhaap:clean-up`
- Autocomplete: `aap-api` for AAP resources
- Filters: `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`
- Config: `ansible.rhaap`, `catalog.providers.rhaap`
- `moduleId: 'aap'`

### 4.2 `scaffolder-backend-module-portal`

Located at `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/`.

- Actions: `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish`
- Autocomplete: `portal-catalog` for `collections`
- Config: `ansible.creatorService`, `ansible.devSpaces`
- `moduleId: 'portal-scaffolder'`

### 4.3 Breaking package migration

`scaffolder-backend-module-backstage-rhaap` is removed as part of this migration. It is not retained as a compatibility shim. Consumers must install and configure both replacement packages before upgrading; this avoids maintaining two deployment paths and prevents duplicate registrations.

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

### Phase 1 — Split the backend module and replace EE routes

Two modules replace one. The EE lifecycle keeps existing registration and deletion behavior while replacing route-based calls with direct service calls; all existing tests and lifecycle-parity tests must pass.

| Item                                                                            | Notes                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/`                  | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'`                                                                                                                                                                  |
| Create `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/` | `createEEDefinition`, `prepareForPublish`, `ansible.ts`, and the `portal-catalog` collections provider. `moduleId: 'portal-scaffolder'`                                                                                                     |
| Split `config.d.ts` per module                                                  | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; portal-scaffolder owns `ansible.creatorService` + `ansible.devSpaces`, but must also declare `ansible.rhaap` + `catalog.providers.rhaap` as transitional read dependencies — see §3.2 |
| Each module gets its own `src/dynamic/index.ts`                                 | One dynamic plugin installer per shippable module                                                                                                                                                                                           |
| Update backend wiring                                                           | Two `backend.add(import(...))` replacing one                                                                                                                                                                                                |
| Migrate autocomplete-provider references                                        | Replace `aap-api-cloud` with `aap-api` for AAP resources and `portal-catalog` for collections, including the three `CollectionsPickerExtension.tsx` provider strings                                                                        |
| Add the EE lifecycle service                                                    | The portal action calls it directly for registration and cleanup; preserve service registration, user-authorized deletion, SCM cleanup, provider unregistering, and the provider-managed entity skip                                        |
| Remove both EE routes after parity coverage                                     | Delete `POST /ansible/ee` and `DELETE /ansible/ee/:name`, router wiring, and route-specific tests; do not add replacement HTTP endpoints                                                                                                    |
| Remove original package                                                         | No compatibility shim; release migration notes cover the required package, dynamic-plugin, and provider-reference changes                                                                                                                   |
| Split unit tests and shared `src/mock/` fixtures                                | Shared fixtures duplicated or extracted to a test-util                                                                                                                                                                                      |

**Verification:** scaffolder module tests pass; smoke-test an EE template end-to-end in the dev app.

### Phase 2 — Drop `backstage-rhaap-common` dependency from portal-scaffolder

| Item                                                                | Notes                                    |
| ------------------------------------------------------------------- | ---------------------------------------- |
| Extract `ScmClientFactory` to a shared or portal-scaffolder package | Or duplicate if scope is small enough    |
| Drop `backstage-rhaap-common` from portal-scaffolder `package.json` | Achieves full independence from AAP code |

---

## 6. Key Constraints and Contracts

| Consumer         | Contract                                                                                                                  | Provided by                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Template authors | Action IDs and template filter names unchanged; autocomplete provider references migrate to `aap-api` or `portal-catalog` | Changelog entry and migration note |
| RHDH / operator  | Two backend dynamic plugin entries instead of one                                                                         | Updated `dynamic-plugins.yaml`     |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Post-Split Backend Surface

| Package                            | Registers                                                                                             | Owns                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `scaffolder-backend-module-aap`    | `rhaap:*` actions, template filters, `aap-api`                                                        | AAP scaffolder behaviour                                         |
| `scaffolder-backend-module-portal` | `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish`, `portal-catalog` | Portal-scaffolder actions and collection lookup                  |
| EE lifecycle service               | No HTTP routes                                                                                        | EE registration, user-authorized cleanup, and provider lifecycle |

---

## 8. Open Questions

| Question                                                                                                                                                                                                   | Blocking                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Should `backstage-rhaap-common` be split so portal-scaffolder drops the AAP edge? (§3.2)                                                                                                                   | Phase 2                  |
| Does `createEEDefinition.ts`'s read of `ansible.rhaap` / `catalog.providers.rhaap` get replaced by a content-side contract, or does portal-scaffolder keep reading AAP/catalog config indefinitely? (§3.2) | Phase 1 config ownership |

---

## Appendix A: Source File Map

| Concern               | Current path                                                                                                                               | Target                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module registration   | `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`                                                                          | Split into `scaffolder-backend-module-aap/src/module.ts` + `scaffolder-backend-module-portal/src/module.ts`                                                                                       |
| AAP actions           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aap*.ts`                                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/`                                                                                                                               |
| EE definition action  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts`                                                      | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/`                                                                                                              |
| Publish action        | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/prepareForPublish.ts`                                                       | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/`                                                                                                              |
| Content create action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/ansible.ts`                                                                 | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/`                                                                                                              |
| Autocomplete          | `plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/`                                                                      | AAP resources → `workspaces/aap/plugins/scaffolder-backend-module-aap/src/autocomplete/`; collections → `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/autocomplete/` |
| Template filters      | `plugins/scaffolder-backend-module-backstage-rhaap/src/filters/`                                                                           | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/`                                                                                                                               |
| AAP schemas           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapAction*.ts`                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/`                                                                                                                       |
| EE definition schema  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapActionSchemas.ts` (partial)                                    | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/schemas/eeDefinitionSchema.ts`                                                                                 |
| Config                | `plugins/scaffolder-backend-module-backstage-rhaap/config.d.ts`                                                                            | Split per module                                                                                                                                                                                  |
| Backend wiring        | `packages/backend/src/index.ts`                                                                                                            | Two `backend.add()` calls                                                                                                                                                                         |
| EE push registration  | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `src/router.ts` (`POST /ansible/ee`, `DELETE /ansible/ee/:name`) | EE lifecycle service; both routes and their router wiring are removed after service-parity coverage — see §3.3 for credential and cleanup requirements                                            |
