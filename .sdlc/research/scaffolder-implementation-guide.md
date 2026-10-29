# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 covers workspace layout, §7.3–§7.4 covers backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` into two
> backend modules — one for AAP integration, one for portal-scaffolder — with no behaviour
> change apart from the documented autocomplete-provider migration in Phase 1.

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

| Config path | Belongs to |
| --- | --- |
| `ansible.rhaap` | AAP module |
| `ansible.creatorService` | Portal-scaffolder module |
| `ansible.devSpaces` | Portal-scaffolder module |
| `catalog.providers.rhaap` | AAP module |

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

| Before | After |
| --- | --- |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'portal-scaffolder'` (two modules, same `pluginId: 'scaffolder'`) |

**Backward compatibility.** Action IDs and template filter names are stable across the split. Module IDs change (`ansible` → `aap` + `portal-scaffolder`), and operators must update their `dynamic-plugins.yaml` to reference the two new packages instead of the single monolithic one (see §5). The existing `aap-api-cloud` provider is replaced by `aap-api` for AAP resources and `portal-catalog` for collections; templates and picker configuration must migrate in Phase 1.

---

## 3. What Moves, What Stays, and What Remains Transitional

### 3.1 Actions, filters, and autocomplete

| Action ID | File | Target module |
| --- | --- | --- |
| `ansible:content:create` | `actions/ansible.ts` | portal-scaffolder |
| `ansible:create:ee-definition` | `actions/createEEDefinition.ts` | portal-scaffolder |
| `ansible:prepare:publish` | `actions/prepareForPublish.ts` | portal-scaffolder |
| `rhaap:create-project` | `actions/aapCreateProject.ts` | aap |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts` | aap |
| `rhaap:create-job-template` | `actions/aapCreateJobTemplate.ts` | aap |
| `rhaap:launch-job-template` | `actions/aapLaunchJobTemplate.ts` | aap |
| `rhaap:clean-up` | `actions/aapCleanUp.ts` | aap |

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

`EEEntityProvider` in `catalog-backend-module-rhaap` is a definition-path concern (architecture §7.4). Phase 2 may relocate provider implementation closer to portal-scaffolder, but **`POST /ansible/ee` stays registered from a catalog-owned backend module** — not from `scaffolder-backend-module-portal`. The path (`/ansible/ee`) and auth contract (`allow: ['service']`, service-to-catalog calls from scaffolder) must not change.

**The migration unit is two routes, not one.** `createEEDefinition.ts` also calls `DELETE /ansible/ee/:name` to clean up an existing catalog entity before re-registering it (`router.ts` line 404), and that route has a _different_ auth contract than `POST /ansible/ee`:

| Route | Credentials used in `createEEDefinition.ts` | Router `allow` | Effective RBAC |
| --- | --- | --- | --- |
| `POST /ansible/ee` | `auth.getOwnServiceCredentials()` — pure service-to-service | `['service']` | No per-user check; scaffolder's own service identity |
| `DELETE /ansible/ee/:name` | `getInitiatorCredentials()` forwarded via `onBehalfOf` — the calling user's token | `['user', 'service']` | Catalog's own delete-permission RBAC, per user |

There's also a provider-ownership branch: cleanup is skipped entirely for non-SCM, provider-managed entities (detected via the `ansible.io/download-experience` annotation), since those upsert in place rather than needing a delete-then-recreate.

Any relocation of this contract (today or under a future CEA-aligned phase) must move or re-document **both** routes together, preserve the asymmetric auth contract (service-credentialed create vs. user-credentialed, RBAC-checked delete), and account for the provider-ownership skip logic — moving only `POST` and dropping `DELETE` from this guide's accounting would silently break cleanup-before-recreate or its permission boundary.

**This is a deliberate deviation from CEA §7.4, not an oversight.** CEA's table assigns `EEEntityProvider` (and the route it serves) to `scaffolder-backend-module-self-service` directly — i.e., out of the catalog module entirely, owned by the self-service/portal-scaffolder side. This guide keeps it catalog-owned for Phase 1/2 instead, because:

- Today's route already lives in a catalog-owned module with an established `allow: ['service']` contract; moving it is a behavior-affecting change, not a pure repackaging, and this guide's Phase 1 scope is explicitly no-behavior-change.
- Backstage's `httpRouter` mounts a module's routes under its owning plugin's base path. Moving the route to a `scaffolder`-pluginId module changes its effective path and auth wiring, not just which package contains the handler.

If the team wants to follow CEA §7.4 literally, treat that as a distinct, later phase with its own URL-migration and auth-contract plan — not something to fold into this split silently. Tracked as an open question in §8.

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

### 4.3 Deprecated `scaffolder-backend-module-backstage-rhaap`

The original `scaffolder-backend-module-backstage-rhaap` is retained as a deprecated shim that logs a migration warning until consumers switch to the split packages. The shim registers all actions (`rhaap:*` and `ansible:*`), all template filters, and the legacy `aap-api-cloud` autocomplete provider. Operators should load **either** the deprecated shim **or** the two replacement modules, never both, to avoid duplicate action registrations.

---

## 5. Action Plan

### Phase 0 — Contract freeze

Capture a machine-readable inventory before changing anything.

| Item | Status |
| --- | --- |
| Register all `ansible:*` and `rhaap:*` action IDs | ❌ |
| Register autocomplete resources (`collections`, `collection_sources`, …) | ❌ |
| Document provider migration from `aap-api-cloud` to `aap-api` and `portal-catalog` | ❌ |
| Capture the picker↔action source-string format as an explicit contract (§1.4) | ❌ |

### Phase 1 — Split the backend module (no behaviour change)

Two modules replacing one; identical behaviour; all existing tests green.

| Item | Notes |
| --- | --- |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/` | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'` |
| Create `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/` | `createEEDefinition`, `prepareForPublish`, `ansible.ts`, and the `portal-catalog` collections provider. `moduleId: 'portal-scaffolder'` |
| Split `config.d.ts` per module | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; portal-scaffolder owns `ansible.creatorService` + `ansible.devSpaces`, but must also declare `ansible.rhaap` + `catalog.providers.rhaap` as transitional read dependencies — see §3.2 |
| Each module gets its own `src/dynamic/index.ts` | One dynamic plugin installer per shippable module |
| Update backend wiring | Two `backend.add(import(...))` replacing one |
| Migrate autocomplete-provider references | Replace `aap-api-cloud` with `aap-api` for AAP resources and `portal-catalog` for collections, including the three `CollectionsPickerExtension.tsx` provider strings |
| Deprecate original package | Retained as a shim with a deprecation log warning |
| Split unit tests and shared `src/mock/` fixtures | Shared fixtures duplicated or extracted to a test-util |

**Verification:** scaffolder module tests pass; smoke-test an EE template end-to-end in the dev app.

### Phase 2 — Relocate `EEEntityProvider` (catalog keeps the route)

| Item | Notes |
| --- | --- |
| Move `EEEntityProvider` class out of `catalog-backend-module-rhaap` | Implementation may live in portal-scaffolder workspace code; **do not** mount `POST /ansible/ee` or `DELETE /ansible/ee/:name` from `scaffolder-backend-module-portal` |
| Keep `POST /ansible/ee` on a catalog-owned module | Same URL; preserve `allow: ['service']` (service-to-service, `auth.getOwnServiceCredentials()` on the caller side). Optional: thin `catalog-backend-module-*` dedicated to definition entities |
| Keep `DELETE /ansible/ee/:name` on the same catalog-owned module | Same URL; preserve `allow: ['user', 'service']` and the fact that the caller forwards the **initiator's** token (`getInitiatorCredentials` + `onBehalfOf`), so catalog delete-permission RBAC applies per user — this is a stricter contract than POST's and must not be flattened to service-only |
| Preserve the provider-ownership skip logic | Cleanup is skipped for non-SCM, provider-managed entities (detected via the `ansible.io/download-experience` annotation) — whichever module owns the route must keep this check |
| Move tests from `catalog-backend-module-rhaap/src/router.test.ts` | Coverage for **both** `POST /ansible/ee` and `DELETE /ansible/ee/:name` (including the `allow: ['user','service']` and per-user RBAC path) stays with whichever catalog module owns the routes |

**Open item:** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189) proposes registering the entity directly from the scaffolder action, retiring `POST /ansible/ee` entirely.

### Phase 3 — Drop `backstage-rhaap-common` dependency from portal-scaffolder

| Item | Notes |
| --- | --- |
| Extract `ScmClientFactory` to a shared or portal-scaffolder package | Or duplicate if scope is small enough |
| Drop `backstage-rhaap-common` from portal-scaffolder `package.json` | Achieves full independence from AAP code |

---

## 6. Key Constraints and Contracts

| Consumer | Contract | Provided by |
| --- | --- | --- |
| Template authors | Action IDs and template filter names unchanged; autocomplete provider references migrate to `aap-api` or `portal-catalog` | Changelog entry and migration note |
| RHDH / operator | Two backend dynamic plugin entries instead of one | Updated `dynamic-plugins.yaml` |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Post-Split Backend Surface

| Package | Registers | Owns |
| --- | --- | --- |
| `scaffolder-backend-module-aap` | `rhaap:*` actions, template filters, `aap-api` | AAP scaffolder behaviour |
| `scaffolder-backend-module-portal` | `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish`, `portal-catalog` | Portal-scaffolder actions and collection lookup |
| Catalog-owned backend module | `POST /ansible/ee`, `DELETE /ansible/ee/:name` | EE registration and cleanup routes |
| `scaffolder-backend-module-backstage-rhaap` (shim) | All current actions, filters, and legacy `aap-api-cloud` during migration | Compatibility until consumers migrate |

---

## 8. Open Questions

| Question | Blocking |
| --- | --- |
| Should `backstage-rhaap-common` be split so portal-scaffolder drops the AAP edge? (§3.2) | Phase 3 |
| Should `POST /ansible/ee` be retired via PR #189 rather than moved? | Phase 2 |
| Should `EEEntityProvider`/`POST /ansible/ee` eventually move to `scaffolder-backend-module-portal` to match CEA §7.4, despite the URL/auth-contract cost? (§3.3) | Later phase, not 0–3 |
| Does `createEEDefinition.ts`'s read of `ansible.rhaap` / `catalog.providers.rhaap` get replaced by a content-side contract, or does portal-scaffolder keep reading AAP/catalog config indefinitely? (§3.2) | Phase 1 config ownership |

---

## Appendix A: Source File Map

| Concern | Current path | Target |
| --- | --- | --- |
| Module registration | `plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` | Split into `scaffolder-backend-module-aap/src/module.ts` + `scaffolder-backend-module-portal/src/module.ts` |
| AAP actions | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aap*.ts` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/` |
| EE definition action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts` | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/` |
| Publish action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/prepareForPublish.ts` | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/` |
| Content create action | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/ansible.ts` | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/` |
| Autocomplete | `plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/` | AAP resources → `workspaces/aap/plugins/scaffolder-backend-module-aap/src/autocomplete/`; collections → `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/autocomplete/` |
| Template filters | `plugins/scaffolder-backend-module-backstage-rhaap/src/filters/` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/` |
| AAP schemas | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapAction*.ts` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/` |
| EE definition schema | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/schemas/rhaapActionSchemas.ts` (partial) | `workspaces/portal-scaffolder/plugins/scaffolder-backend-module-portal/src/actions/schemas/eeDefinitionSchema.ts` |
| Config | `plugins/scaffolder-backend-module-backstage-rhaap/config.d.ts` | Split per module |
| Backend wiring | `packages/backend/src/index.ts` | Two `backend.add()` calls |
| EE push registration | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `src/router.ts` (`POST /ansible/ee`, `DELETE /ansible/ee/:name`) | Provider code may move; **both routes stay catalog-owned** (Phase 2) — see §3.3 for the asymmetric auth contract |
