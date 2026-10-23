# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 covers workspace layout, §7.3–§7.4 covers backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` into two
> backend modules — one for AAP integration, one for portal-scaffolder — with no behaviour
> change and no frontend code changes in Phases 0–3. This does not guarantee the frontend
> never needs to change as a result of this split — see §4.4 for a known gap.

---

## 1. Goal

The scaffolder backend module today is a single package that registers AAP Controller actions, EE definition authoring actions, publish actions, template filters, and an autocomplete provider — all under one `moduleId: 'ansible'`. These concerns belong to different domains and should be independently deployable.

Per the Content Experience Architecture §2.2, the target is one workspace per experience:

| New module                         | Workspace                               | Owns                                                                                |
| ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `scaffolder-backend-module-aap`    | `workspaces/aap/plugins/`               | `rhaap:*` actions, template filters, `aap-api-cloud` autocomplete                   |
| `portal-scaffolder-backend-module` | `workspaces/portal-scaffolder/plugins/` | `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish` |

**Naming note.** CEA §2.2 names this workspace/module `self-service` / `scaffolder-backend-module-self-service`. This guide uses `portal-scaffolder` / `portal-scaffolder-backend-module` instead, per a team naming decision communicated after CEA was written — that rename is not yet reflected in CEA or any other written architecture doc. Where this guide says `portal-scaffolder`, read CEA's `self-service`.

The original package is retained as a deprecated shim during migration.

---

## 2. Current State

### 2.1 Repository layout (main branch)

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

### 2.2 The monolithic module

`plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` — a single `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` that registers everything:

**Template actions**

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

**Autocomplete provider** → aap: `id: 'aap-api-cloud'` (stable contract, must not change)

### 2.3 Config schema (single `config.d.ts`)

| Config path               | Belongs to               |
| ------------------------- | ------------------------ |
| `ansible.rhaap`           | AAP module               |
| `ansible.creatorService`  | Portal-scaffolder module |
| `ansible.devSpaces`       | Portal-scaffolder module |
| `catalog.providers.rhaap` | AAP module               |

Backstage validates against the union of installed schemas — a mismatch is a startup failure.

### 2.4 Backend wiring

`packages/backend/src/index.ts` has one entry:

```ts
backend.add(
  import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap'),
);
```

### 2.5 String contract between autocomplete and EE definition

`autocomplete/utils.ts:formatSource()` emits display strings (`"Private Automation Hub / <repo>"`, `"<Provider> / <host> / <org> / <repo>"`) that `createEEDefinition.ts` parses back into structured data. The split puts a package boundary between producer and consumer. This format must be preserved as a tested contract.

---

## 3. Target Layout (per Architecture §2.2)

```
workspaces/
├── aap/plugins/
│   ├── aap-common/  aap-node/  aap/  aap-backend/     # renamed from backstage-rhaap-*
│   ├── auth-backend-module-aap-provider/
│   ├── catalog-backend-module-aap/
│   └── scaffolder-backend-module-aap/                   # NEW — AAP scaffolder actions
│       Actions: rhaap:create-project, rhaap:create-execution-environment,
│                rhaap:create-job-template, rhaap:launch-job-template, rhaap:clean-up
│       Autocomplete: aap-api-cloud (all resources, including `collections` — see §4.4)
│       Filters: useCaseNameFilter, resourceFilter, multiResourceFilter, uuidFilter
│       Config: ansible.rhaap, catalog.providers.rhaap
│       moduleId: 'aap'
│
└── portal-scaffolder/plugins/
    └── portal-scaffolder-backend-module/                 # NEW — portal-scaffolder actions
        Actions: ansible:content:create, ansible:create:ee-definition, ansible:prepare:publish
        Config: ansible.creatorService, ansible.devSpaces
        moduleId: 'portal-scaffolder'
```

The original `scaffolder-backend-module-backstage-rhaap` is retained as a deprecated shim that logs a migration warning until consumers switch to the split packages. The shim registers all actions (`rhaap:*` and `ansible:*`), all template filters, and the `aap-api-cloud` autocomplete provider — identical to today's behaviour. Operators should load **either** the deprecated shim **or** the two replacement modules, never both, to avoid duplicate action registrations.

**Module identity**

| Before                             | After                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'portal-scaffolder'` (two modules, same `pluginId: 'scaffolder'`) |

**Backward compatibility.** Action IDs, the autocomplete provider id `aap-api-cloud`, and template filter names are stable across the split — template authors and scaffolder templates require no changes. Module IDs change (`ansible` → `aap` + `portal-scaffolder`), and operators must update their `dynamic-plugins.yaml` to reference the two new packages instead of the single monolithic one (see §6).

---

## 4. Design Decisions

### 4.1 `backstage-rhaap-common` dependency edge

`ansible:prepare:publish` imports `ScmClientFactory` from `@ansible/backstage-rhaap-common`. That barrel also exports `AAPClient`, `AAPService`, and `permissions`. The portal-scaffolder module therefore still has a transitive dependency on AAP code. Full independence requires splitting `backstage-rhaap-common` itself (SCM client → shared package; AAP client/service → `aap-common`/`aap-node` per §2.2). This is a known limitation for Phase 1.

### 4.2 `createEEDefinition.ts` complexity and its config reads

~1240 lines containing PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. For Phase 1, it moves as-is with no behaviour change.

**Its config dependency is wider than `ansible.creatorService` + `ansible.devSpaces`.** The file also reads:

- `ansible.rhaap.baseUrl` — to build `galaxy_server` entries for the creator service payload
- `catalog.providers.rhaap.<envId>.sync.pahCollections.repositories` — PAH repository identifiers
- `catalog.providers.rhaap.<envId>.sync.ansibleGitContents.providers.<provider>` — SCM canonical-source resolution

These are AAP/catalog config keys, not portal-scaffolder's own. Moving the action into `portal-scaffolder-backend-module` as-is (Phase 1, no behaviour change) means that module's `config.d.ts` must also declare `ansible.rhaap` and `catalog.providers.rhaap` as read dependencies — not because portal-scaffolder owns that config, but because it still needs to read it until the PAH/SCM resolution logic inside this file is extracted to a content-side contract. §2.3's config table should be read as **ownership**, not as the complete list of config portal-scaffolder reads during Phase 1. Track this as a transitional read dependency; closing it is future work, not a Phase 1–3 deliverable.

### 4.3 EE entity registration

`EEEntityProvider` in `catalog-backend-module-rhaap` is a definition-path concern (architecture §7.4). Phase 2 may relocate provider implementation closer to portal-scaffolder, but **`POST /ansible/ee` stays registered from a catalog-owned backend module** — not from `portal-scaffolder-backend-module`. The path (`/ansible/ee`) and auth contract (`allow: ['service']`, service-to-catalog calls from scaffolder) must not change.

**The migration unit is two routes, not one.** `createEEDefinition.ts` also calls `DELETE /ansible/ee/:name` to clean up an existing catalog entity before re-registering it (`router.ts` line 404), and that route has a _different_ auth contract than `POST /ansible/ee`:

| Route                      | Credentials used in `createEEDefinition.ts`                                       | Router `allow`        | Effective RBAC                                       |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `POST /ansible/ee`         | `auth.getOwnServiceCredentials()` — pure service-to-service                       | `['service']`         | No per-user check; scaffolder's own service identity |
| `DELETE /ansible/ee/:name` | `getInitiatorCredentials()` forwarded via `onBehalfOf` — the calling user's token | `['user', 'service']` | Catalog's own delete-permission RBAC, per user       |

There's also a provider-ownership branch: cleanup is skipped entirely for non-SCM, provider-managed entities (detected via the `ansible.io/download-experience` annotation), since those upsert in place rather than needing a delete-then-recreate.

Any relocation of this contract (today or under a future CEA-aligned phase) must move or re-document **both** routes together, preserve the asymmetric auth contract (service-credentialed create vs. user-credentialed, RBAC-checked delete), and account for the provider-ownership skip logic — moving only `POST` and dropping `DELETE` from this guide's accounting would silently break cleanup-before-recreate or its permission boundary.

**This is a deliberate deviation from CEA §7.4, not an oversight.** CEA's table assigns `EEEntityProvider` (and the route it serves) to `scaffolder-backend-module-self-service` directly — i.e., out of the catalog module entirely, owned by the self-service/portal-scaffolder side. This guide keeps it catalog-owned for Phase 1/2 instead, because:

- Today's route already lives in a catalog-owned module with an established `allow: ['service']` contract; moving it is a behavior-affecting change, not a pure repackaging, and this guide's Phase 1 scope is explicitly no-behavior-change.
- Backstage's `httpRouter` mounts a module's routes under its owning plugin's base path. Moving the route to a `scaffolder`-pluginId module changes its effective path and auth wiring, not just which package contains the handler.

If the team wants to follow CEA §7.4 literally, treat that as a distinct, later phase with its own URL-migration and auth-contract plan — not something to fold into this split silently. Tracked as an open question in §7.

### 4.4 `collections` autocomplete resource stays coupled to the AAP module

`handleAutocompleteRequest` branches on `resource === 'collections'` _before_ any Controller call — it queries the Backstage catalog via `getCollections()`, not AAP's Controller API. Portal's `CollectionsPicker` field reaches this branch through the same `aap-api-cloud` provider used by every other AAP resource.

Putting the full `aap-api-cloud` provider (all resources, including `collections`) on `scaffolder-backend-module-aap` means **a portal-scaffolder-only deployment (no AAP module installed) cannot offer collection selection** — the `collections` branch has no Controller dependency, but it has no home outside the AAP module either under this split.

This is an open gap, not resolved by this guide:

- **Transitional state (Phase 1):** `collections` stays on `aap-api-cloud`/AAP module, identical to today. Portal-scaffolder deployments that need collection selection must install the AAP module too — this is a real constraint, not an oversight to paper over.
- **Acceptance check to add to Phase 1 verification:** confirm whether a portal-scaffolder-only install (AAP module absent) is an actual deployment target. If it is, collection selection will not work until this is resolved; the "no frontend modifications" scope statement in §1 should be read as "no frontend changes in Phase 1," not as a guarantee that the frontend never needs to change here.
- **Target state (future work, not Phase 1–3):** CEA §7.5 already proposes the shape of this fix — a registered content operation with a declared schema and permission (e.g. `content.collections.list`), called through a typed client rather than a direct provider lookup, served by a dedicated `scaffolder-backend-module-content-operations` module (CEA §2.2). This guide does not implement that module; it only documents that the gap exists and that CEA already has a named answer for it.

---

## 5. Phases

### Phase 0 — Contract freeze

Capture a machine-readable inventory before changing anything.

| Item                                                                           | Status |
| ------------------------------------------------------------------------------ | ------ |
| Register all `ansible:*` and `rhaap:*` action IDs                              | ❌     |
| Register autocomplete resources (`collections`, `collection_sources`, …)       | ❌     |
| Document template YAML dependencies on provider id `aap-api-cloud`             | ❌     |
| Capture the picker↔action source-string format as an explicit contract (§2.5) | ❌     |

### Phase 1 — Split the backend module (no behaviour change)

Two modules replacing one; identical behaviour; all existing tests green.

| Item                                                                            | Notes                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/`                  | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'`                                                                                                                                                                  |
| Create `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/` | `createEEDefinition`, `prepareForPublish`, `ansible.ts`. `moduleId: 'portal-scaffolder'`                                                                                                                                                    |
| Split `config.d.ts` per module                                                  | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; portal-scaffolder owns `ansible.creatorService` + `ansible.devSpaces`, but must also declare `ansible.rhaap` + `catalog.providers.rhaap` as transitional read dependencies — see §4.2 |
| Each module gets its own `src/dynamic/index.ts`                                 | One dynamic plugin installer per shippable module                                                                                                                                                                                           |
| Update backend wiring                                                           | Two `backend.add(import(...))` replacing one                                                                                                                                                                                                |
| Deprecate original package                                                      | Retained as a shim with a deprecation log warning                                                                                                                                                                                           |
| Split unit tests and shared `src/mock/` fixtures                                | Shared fixtures duplicated or extracted to a test-util                                                                                                                                                                                      |

**Verification:** scaffolder module tests pass; smoke-test an EE template end-to-end in the dev app.

### Phase 2 — Relocate `EEEntityProvider` (catalog keeps the route)

| Item                                                                | Notes                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move `EEEntityProvider` class out of `catalog-backend-module-rhaap` | Implementation may live in portal-scaffolder workspace code; **do not** mount `POST /ansible/ee` or `DELETE /ansible/ee/:name` from `portal-scaffolder-backend-module`                                                                                                                             |
| Keep `POST /ansible/ee` on a catalog-owned module                   | Same URL; preserve `allow: ['service']` (service-to-service, `auth.getOwnServiceCredentials()` on the caller side). Optional: thin `catalog-backend-module-*` dedicated to definition entities                                                                                                     |
| Keep `DELETE /ansible/ee/:name` on the same catalog-owned module    | Same URL; preserve `allow: ['user', 'service']` and the fact that the caller forwards the **initiator's** token (`getInitiatorCredentials` + `onBehalfOf`), so catalog delete-permission RBAC applies per user — this is a stricter contract than POST's and must not be flattened to service-only |
| Preserve the provider-ownership skip logic                          | Cleanup is skipped for non-SCM, provider-managed entities (detected via the `ansible.io/download-experience` annotation) — whichever module owns the route must keep this check                                                                                                                    |
| Move tests from `catalog-backend-module-rhaap/src/router.test.ts`   | Coverage for **both** `POST /ansible/ee` and `DELETE /ansible/ee/:name` (including the `allow: ['user','service']` and per-user RBAC path) stays with whichever catalog module owns the routes                                                                                                     |

**Open item:** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189) proposes registering the entity directly from the scaffolder action, retiring `POST /ansible/ee` entirely.

### Phase 3 — Drop `backstage-rhaap-common` dependency from portal-scaffolder

| Item                                                                | Notes                                    |
| ------------------------------------------------------------------- | ---------------------------------------- |
| Extract `ScmClientFactory` to a shared or portal-scaffolder package | Or duplicate if scope is small enough    |
| Drop `backstage-rhaap-common` from portal-scaffolder `package.json` | Achieves full independence from AAP code |

---

## 6. Contracts

| Consumer         | Contract                                             | Provided by                    |
| ---------------- | ---------------------------------------------------- | ------------------------------ |
| Template authors | Action IDs and `aap-api-cloud` provider id unchanged | Changelog entry                |
| RHDH / operator  | Two backend dynamic plugin entries instead of one    | Updated `dynamic-plugins.yaml` |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Open Questions

| Question                                                                                                                                                                                                   | Blocking                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Should `backstage-rhaap-common` be split so portal-scaffolder drops the AAP edge? (§4.1)                                                                                                                   | Phase 3                                 |
| Should `POST /ansible/ee` be retired via PR #189 rather than moved?                                                                                                                                        | Phase 2                                 |
| Should `EEEntityProvider`/`POST /ansible/ee` eventually move to `portal-scaffolder-backend-module` to match CEA §7.4, despite the URL/auth-contract cost? (§4.3)                                           | Later phase, not 0–3                    |
| Is a portal-scaffolder-only deployment (no AAP module) an actual target? If so, how does `collections` autocomplete work without AAP? (§4.4)                                                               | Blocks any portal-only deployment claim |
| Does `createEEDefinition.ts`'s read of `ansible.rhaap` / `catalog.providers.rhaap` get replaced by a content-side contract, or does portal-scaffolder keep reading AAP/catalog config indefinitely? (§4.2) | Phase 1 config ownership                |

---

## 8. Source File Map

| Concern               | Current path                                                                                                                               | Target                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Module registration   | `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`                                                                          | Split into `scaffolder-backend-module-aap/src/module.ts` + `portal-scaffolder-backend-module/src/module.ts`       |
| AAP actions           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aap*.ts`                                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/`                                               |
| EE definition action  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts`                                                      | `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/actions/`                              |
| Publish action        | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/prepareForPublish.ts`                                                       | `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/actions/`                              |
| Content create action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/ansible.ts`                                                                 | `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/actions/`                              |
| Autocomplete          | `plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/`                                                                      | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/autocomplete/`                                          |
| Template filters      | `plugins/scaffolder-backend-module-backstage-rhaap/src/filters/`                                                                           | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/`                                               |
| AAP schemas           | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapAction*.ts`                                                    | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/`                                       |
| EE definition schema  | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapActionSchemas.ts` (partial)                                    | `workspaces/portal-scaffolder/plugins/portal-scaffolder-backend-module/src/actions/schemas/eeDefinitionSchema.ts` |
| Config                | `plugins/scaffolder-backend-module-backstage-rhaap/config.d.ts`                                                                            | Split per module                                                                                                  |
| Backend wiring        | `packages/backend/src/index.ts`                                                                                                            | Two `backend.add()` calls                                                                                         |
| EE push registration  | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `src/router.ts` (`POST /ansible/ee`, `DELETE /ansible/ee/:name`) | Provider code may move; **both routes stay catalog-owned** (Phase 2) — see §4.3 for the asymmetric auth contract  |
