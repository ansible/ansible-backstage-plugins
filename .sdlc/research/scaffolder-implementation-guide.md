# Scaffolder Backend Split — Implementation Guide

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) — [§2.2](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#22-proposal-one-workspace-per-experience) (workspace layout), [§7.3–§7.4](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#73-frontend-what-moves-what-stays) (backend boundary)
>
> **Scope:** Split the monolithic `scaffolder-backend-module-backstage-rhaap` into two
> backend modules — one for AAP integration, one for self-service — with no behaviour
> change and no frontend modifications.

---

## 1. Goal

The scaffolder backend module today is a single package that registers AAP Controller actions, EE definition authoring actions, publish actions, template filters, and an autocomplete provider — all under one `moduleId: 'ansible'`. These concerns belong to different domains and should be independently deployable.

Per the Content Experience Architecture §2.2, the target is one workspace per experience:

| New module | Workspace | Owns |
| --- | --- | --- |
| `scaffolder-backend-module-aap` | `workspaces/aap/plugins/` | `rhaap:*` actions, template filters, `aap-api-cloud` autocomplete |
| `scaffolder-backend-module-self-service` | `workspaces/self-service/plugins/` | `ansible:content:create`, `ansible:create:ee-definition`, `ansible:prepare:publish` |

The original package is retained as a deprecated shim during migration.

---

## 2. Current State

### 2.1 Repository layout (on this branch)

The `feat/portal-plugin-factory-sdk` branch already has the `workspaces/` layout per §2.2:

```
workspaces/
├── aap/plugins/
│   ├── backstage-rhaap/                          # AAP frontend plugin
│   ├── backstage-rhaap-common/                   # Shared: ansibleServiceRef, AAPClient, ScmClientFactory
│   ├── catalog-backend-module-rhaap/             # Catalog providers (PAH, git, AAP, EE)
│   ├── auth-backend-module-rhaap-provider/       # AAP auth
│   └── scaffolder-backend-module-backstage-rhaap/ # ← monolithic, being split
├── apme/plugins/                                 # APME workspace
├── portal-core/
│   └── packages/backend/src/index.ts             # Backend wiring
└── self-service/plugins/
    └── self-service/                             # Frontend plugin (unchanged)
```

### 2.2 The monolithic module

`workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` — a single `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` that registers everything:

**Template actions**

| Action ID | File | Target module |
| --- | --- | --- |
| `ansible:content:create` | `actions/ansible.ts` | self-service |
| `ansible:create:ee-definition` | `actions/createEEDefinition.ts` | self-service |
| `ansible:prepare:publish` | `actions/prepareForPublish.ts` | self-service |
| `rhaap:create-project` | `actions/aapCreateProject.ts` | aap |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts` | aap |
| `rhaap:create-job-template` | `actions/aapCreateJobTemplate.ts` | aap |
| `rhaap:launch-job-template` | `actions/aapLaunchJobTemplate.ts` | aap |
| `rhaap:clean-up` | `actions/aapCleanUp.ts` | aap |

**Template filters** → aap: `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`

**Autocomplete provider** → aap: `id: 'aap-api-cloud'` (stable contract, must not change)

### 2.3 Config schema (single `config.d.ts`)

| Config path | Belongs to |
| --- | --- |
| `ansible.rhaap` | AAP module |
| `ansible.creatorService` | Self-service module |
| `ansible.devSpaces` | Self-service module |
| `catalog.providers.rhaap` | AAP module |

Backstage validates against the union of installed schemas — a mismatch is a startup failure.

### 2.4 Backend wiring

`workspaces/portal-core/packages/backend/src/index.ts` has one entry:

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
│       Autocomplete: aap-api-cloud (all resources)
│       Filters: useCaseNameFilter, resourceFilter, multiResourceFilter, uuidFilter
│       Config: ansible.rhaap, catalog.providers.rhaap
│       moduleId: 'aap'
│
└── self-service/plugins/
    ├── self-service/                                    # frontend (unchanged)
    ├── self-service-common/                             # common-library
    ├── self-service-react/                              # web-library
    └── scaffolder-backend-module-self-service/           # NEW — self-service scaffolder actions
        Actions: ansible:content:create, ansible:create:ee-definition, ansible:prepare:publish
        Config: ansible.creatorService, ansible.devSpaces
        moduleId: 'self-service'
```

The original `scaffolder-backend-module-backstage-rhaap` is retained as a deprecated shim that logs a migration warning until consumers switch to the split packages.

**Module identity**

| Before | After |
| --- | --- |
| `moduleId: 'ansible'` (one module) | `moduleId: 'aap'` + `moduleId: 'self-service'` (two modules, same `pluginId: 'scaffolder'`) |

**Backward compatibility.** Action IDs, the autocomplete provider id `aap-api-cloud`, and template filter names are unchanged — only package boundaries move.

---

## 4. Design Decisions

### 4.1 `backstage-rhaap-common` dependency edge

`ansible:prepare:publish` imports `ScmClientFactory` from `@ansible/backstage-rhaap-common`. That barrel also exports `AAPClient`, `AAPService`, and `permissions`. The self-service module therefore still has a transitive dependency on AAP code. Full independence requires splitting `backstage-rhaap-common` itself (SCM client → shared package; AAP client/service → `aap-common`/`aap-node` per §2.2). This is a known limitation for Phase 1.

### 4.2 `createEEDefinition.ts` complexity

~1240 lines containing PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. For Phase 1, it moves as-is with no behaviour change.

### 4.3 EE entity registration

`EEEntityProvider` + `POST /ansible/ee` in `catalog-backend-module-rhaap` are definition-path concerns (architecture §7.4). They move to `scaffolder-backend-module-self-service` in Phase 2.

---

## 5. Phases

### Phase 0 — Contract freeze

Capture a machine-readable inventory before changing anything.

| Item | Status |
| --- | --- |
| Register all `ansible:*` and `rhaap:*` action IDs | ❌ |
| Register autocomplete resources (`collections`, `collection_sources`, …) | ❌ |
| Document template YAML dependencies on provider id `aap-api-cloud` | ❌ |
| Capture the picker↔action source-string format as an explicit contract (§2.5) | ❌ |

### Phase 1 — Split the backend module (no behaviour change)

Two modules replacing one; identical behaviour; all existing tests green.

| Item | Notes |
| --- | --- |
| Create `workspaces/aap/plugins/scaffolder-backend-module-aap/` | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'` |
| Create `workspaces/self-service/plugins/scaffolder-backend-module-self-service/` | `createEEDefinition`, `prepareForPublish`, `ansible.ts`. `moduleId: 'self-service'` |
| Split `config.d.ts` per module | AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; self-service owns `ansible.creatorService` + `ansible.devSpaces` |
| Each module gets its own `src/dynamic/index.ts` | One dynamic plugin installer per shippable module |
| Update `workspaces/portal-core/packages/backend/src/index.ts` | Two `backend.add(import(...))` replacing one |
| Deprecate original package | Retained as a shim with a deprecation log warning |
| Split unit tests and shared `src/mock/` fixtures | Shared fixtures duplicated or extracted to a test-util |

**Verification:** scaffolder module tests pass; smoke-test an EE template end-to-end in the dev app.

### Phase 2 — Move `EEEntityProvider` to self-service

| Item | Notes |
| --- | --- |
| Move `EEEntityProvider` class + `POST /ansible/ee` handler | Register the router from `scaffolder-backend-module-self-service` |
| Keep the URL path stable | No URL regression (architecture §7.7) |
| Move tests from `catalog-backend-module-rhaap/src/router.test.ts` | Coverage travels with the route |

**Open item:** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189) proposes registering the entity directly from the scaffolder action, retiring `POST /ansible/ee` entirely.

### Phase 3 — Drop `backstage-rhaap-common` dependency from self-service

| Item | Notes |
| --- | --- |
| Extract `ScmClientFactory` to a shared or self-service package | Or duplicate if scope is small enough |
| Drop `backstage-rhaap-common` from self-service `package.json` | Achieves full independence from AAP code |

---

## 6. Contracts

| Consumer | Contract | Provided by |
| --- | --- | --- |
| Template authors | Action IDs and `aap-api-cloud` provider id unchanged | Changelog entry |
| RHDH / operator | Two backend dynamic plugin entries instead of one | Updated `dynamic-plugins.yaml` |

**Semver:** internal packaging change — minor bump on affected packages as long as action IDs stay stable.

---

## 7. Open Questions

| Question | Blocking |
| --- | --- |
| Should `backstage-rhaap-common` be split so self-service drops the AAP edge? (§4.1) | Phase 3 |
| Should `POST /ansible/ee` be retired via PR #189 rather than moved? | Phase 2 |

---

## 8. Source File Map

| Concern | Current path | Target |
| --- | --- | --- |
| Module registration | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` | Split into `scaffolder-backend-module-aap/src/module.ts` + `scaffolder-backend-module-self-service/src/module.ts` |
| AAP actions | `src/actions/aap*.ts` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/` |
| EE definition action | `src/actions/createEEDefinition.ts` | `workspaces/self-service/plugins/scaffolder-backend-module-self-service/src/actions/` |
| Publish action | `src/actions/prepareForPublish.ts` | `workspaces/self-service/plugins/scaffolder-backend-module-self-service/src/actions/` |
| Content create action | `src/actions/ansible.ts` | `workspaces/self-service/plugins/scaffolder-backend-module-self-service/src/actions/` |
| Autocomplete | `src/autocomplete/` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/autocomplete/` |
| Template filters | `src/filters/` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/filters/` |
| AAP schemas | `src/actions/schemas/rhaapAction*.ts` | `workspaces/aap/plugins/scaffolder-backend-module-aap/src/actions/schemas/` |
| EE definition schema | `src/actions/schemas/rhaapActionSchemas.ts` (partial) | `workspaces/self-service/plugins/scaffolder-backend-module-self-service/src/actions/schemas/eeDefinitionSchema.ts` |
| Config | `config.d.ts` (all keys) | Split per module |
| Backend wiring | `workspaces/portal-core/packages/backend/src/index.ts` | Two `backend.add()` calls |
| EE push registration | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts` | Moves to `workspaces/self-service/` in Phase 2 |
