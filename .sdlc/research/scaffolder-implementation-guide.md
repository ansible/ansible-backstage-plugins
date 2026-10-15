# Scaffolder Backend Split — Implementation Guide

> **Canonical architecture:** [Content Experience Architecture §2.2](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#22-proposal-one-workspace-per-experience) (workspace layout), [§7.3–§7.4](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#73-frontend-what-moves-what-stays) (backend boundary)
> **Status:** In progress — Phase 1 split landed on `refactor/scaffolder-backend-split`
>
> **Scope: backend only.** This document covers splitting the monolithic scaffolder
> backend module — actions, autocomplete, and template filters — into two separate
> backend modules aligned with the `workspaces/` layout. The frontend is not changed.

---

## 1. What This Effort Owns

Split the monolithic `scaffolder-backend-module-backstage-rhaap` into two backend modules:

| Module | Workspace | Purpose |
| --- | --- | --- |
| `scaffolder-backend-module-aap` | `workspaces/aap/plugins/` | `rhaap:*` template actions, AAP autocomplete, template filters |
| `scaffolder-backend-module-self-service` | `workspaces/self-service/plugins/` | EE definition authoring and publish actions |

The division: **AAP API actions stay with the AAP workspace**; **EE-definition and publishing actions move to self-service**. Concretely, `rhaap:*` → AAP module; `ansible:create:ee-definition`, `ansible:prepare:publish`, and `ansible:content:create` → self-service module.

**Out of scope:**

- Any frontend change — no field-extension moves, no picker rewiring, no new frontend libraries
- Splitting `catalog-backend-module-rhaap` (PAH, git sources, AAP entity providers)
- Repo rename to `automation-portal-plugins`

---

## 2. Current State

### 2.1 The monolithic module

One `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` in `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` registers everything:

**Template actions**

| Action ID | File | Target module |
| --- | --- | --- |
| `ansible:content:create` | `actions/ansible.ts` | `scaffolder-backend-module-self-service` |
| `ansible:create:ee-definition` | `actions/createEEDefinition.ts` | `scaffolder-backend-module-self-service` |
| `ansible:prepare:publish` | `actions/prepareForPublish.ts` | `scaffolder-backend-module-self-service` |
| `rhaap:create-project` | `actions/aapCreateProject.ts` | `scaffolder-backend-module-aap` |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts` | `scaffolder-backend-module-aap` |
| `rhaap:create-job-template` | `actions/aapCreateJobTemplate.ts` | `scaffolder-backend-module-aap` |
| `rhaap:launch-job-template` | `actions/aapLaunchJobTemplate.ts` | `scaffolder-backend-module-aap` |
| `rhaap:clean-up` | `actions/aapCleanUp.ts` | `scaffolder-backend-module-aap` |

**Template filters:** `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter` → `scaffolder-backend-module-aap`

**Autocomplete provider:** `id: 'aap-api-cloud'` → `scaffolder-backend-module-aap`. Provider ID is a stable contract for template authors and must not change.

**Dependencies:** `@ansible/backstage-rhaap-common` (`ansibleServiceRef`, DTOs), Backstage scaffolder extension points, config, auth, discovery.

### 2.2 Config schema (single `config.d.ts` today)

The monolithic module declares all config keys in one schema:

| Config path | Belongs to |
| --- | --- |
| `ansible.rhaap` | AAP module |
| `ansible.creatorService` | Self-service module |
| `ansible.devSpaces` | Self-service module |
| `catalog.providers.rhaap` | AAP module |

Backstage validates against the union of installed schemas — a mismatch is a startup failure.

### 2.3 Workspace layout

```
workspaces/
├── aap/plugins/
│   ├── backstage-rhaap, backstage-rhaap-common
│   ├── catalog-backend-module-rhaap, auth-backend-module-rhaap-provider
│   └── scaffolder-backend-module-backstage-rhaap  ← monolithic, being split
├── apme/plugins/
├── portal-core/plugins/
└── self-service/plugins/
    └── self-service/  (frontend plugin, unchanged)
```

### 2.4 String contract between autocomplete and EE definition

`autocomplete/utils.ts:formatSource()` emits display strings (`"Private Automation Hub / <repo>"`, `"<Provider> / <host> / <org> / <repo>"`) that `createEEDefinition.ts` parses back into structured data. The split puts a package boundary between producer and consumer. This format must be preserved as a tested contract.

---

## 3. Target Package Layout

```
workspaces/aap/plugins/
└── scaffolder-backend-module-aap/                   # NEW
    Actions: rhaap:create-project, rhaap:create-execution-environment,
             rhaap:create-job-template, rhaap:launch-job-template, rhaap:clean-up
    Autocomplete: aap-api-cloud (all resources)
    Template filters: useCaseNameFilter, resourceFilter, multiResourceFilter, uuidFilter
    Config: ansible.rhaap, catalog.providers.rhaap
    moduleId: 'aap'

workspaces/self-service/plugins/
└── scaffolder-backend-module-self-service/           # NEW
    Actions: ansible:content:create, ansible:create:ee-definition, ansible:prepare:publish
    Config: ansible.creatorService, ansible.devSpaces
    moduleId: 'self-service'
```

The original `scaffolder-backend-module-backstage-rhaap` is retained as a **deprecated backward-compatible shim** that registers both modules' actions and logs a migration warning.

**Module identity**

| Current | Target |
| --- | --- |
| `moduleId: 'ansible'` | `aap` and `self-service` — separate backend modules, same `pluginId: 'scaffolder'` |

**Backward compatibility.** Action IDs, the autocomplete provider id `aap-api-cloud`, and template filter names are unchanged across the split — only package boundaries move.

---

## 4. Design Decisions

### 4.1 Scaffolder fields stay on Backstage registration (frontend — out of scope)

Field extensions keep their existing `createScaffolderFieldExtension` registration, untouched. This is frontend work and not part of this effort.

### 4.2 EE entity registration stays on the definition path

`EEEntityProvider` + `POST /ansible/ee` are definition-path concerns, not content-catalog concerns. They remain owned by `scaffolder-backend-module-self-service` when moved (Phase 2).

### 4.3 Dependency: `backstage-rhaap-common` edge

`scaffolder-backend-module-self-service` is meant to be free of AAP dependencies, but `ansible:prepare:publish` imports `ScmClientFactory` from `@ansible/backstage-rhaap-common`. That barrel also exports `AAPClient`, `AAPService`, and `permissions`.

Splitting the scaffolder module alone does **not** sever this edge. `backstage-rhaap-common` itself needs to be split (SCM client out to a shared package; AAP client/service staying on the AAP side). This is a known limitation and a Phase 1 prerequisite for full independence.

### 4.4 `createEEDefinition.ts` complexity

This file is ~1240 lines and contains PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config, and semver-based collection merging. Moving it wholesale into `scaffolder-backend-module-self-service` relocates the logic without resolving ownership of the content-specific parts. For Phase 1, it moves as-is with no behaviour change.

---

## 5. Ordered Work Packages

### Phase 0 — Contract freeze (prerequisite)

**Output:** Machine-readable inventory of scaffolder action IDs and autocomplete resources.

| Item | Status |
| --- | --- |
| Register all `ansible:*` and `rhaap:*` action IDs | ❌ |
| Register autocomplete resources (`collections`, `collection_sources`, …) | ❌ |
| Document template YAML dependencies on provider id `aap-api-cloud` | ❌ |
| Capture the picker↔action source-string format as an explicit contract (§2.4) | ❌ |

---

### Phase 1 — Split the backend module (no behaviour change)

**Output:** Two modules replacing one; identical action, filter, and autocomplete behaviour; all existing tests green.

| Item | Notes |
| --- | --- |
| Create `scaffolder-backend-module-aap` | `aap*.ts`, autocomplete, filters, `ansibleService` deps. `moduleId: 'aap'` |
| Create `scaffolder-backend-module-self-service` | `createEEDefinition`, `prepareForPublish`, `ansible.ts`. `moduleId: 'self-service'` |
| Split `config.d.ts` per module | Each module declares only its own config keys |
| Give each module its own `src/dynamic/index.ts` | One dynamic plugin installer per shippable module |
| Update `workspaces/portal-core/packages/backend/src/index.ts` | Two `backend.add(import(...))` replacing the single monolithic entry |
| Deprecate the monolithic module | Retained as a shim with a deprecation warning |
| Split unit tests and shared `src/mock/` fixtures | Shared fixtures duplicated or extracted to a test-util |

**Status:** ✅ Initial split landed on `refactor/scaffolder-backend-split`.

**Verification:** scaffolder module tests; smoke-test an EE template end-to-end in the dev app.

---

### Phase 2 — Move `EEEntityProvider` to self-service

**Output:** EE-definition catalog mutation owned by `scaffolder-backend-module-self-service`.

| Item | Notes |
| --- | --- |
| Move `EEEntityProvider` class + `POST /ansible/ee` handler | Register the router from `scaffolder-backend-module-self-service` |
| Keep the URL path stable | No URL regression |
| Update `createEEDefinition` catalog registration path | Only provider location changes |
| Move tests from `catalog-backend-module-rhaap/src/router.test.ts` | `POST /ansible/ee` coverage travels with the route |

**Open item:** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189) proposes registering the entity directly from the scaffolder action, which would retire `POST /ansible/ee` rather than move it.

---

### Phase 3 — AAP workspace alignment

**Output:** The AAP scaffolder module sits in `workspaces/aap/` with AAP-only dependencies.

| Item | Notes |
| --- | --- |
| Drop `backstage-rhaap-common` in favour of AAP-scoped packages | Depends on the §4.3 common split |

---

### Phase 4 — Physical workspace move

Coordinate with the broader workspace restructuring:

- Backend modules under `workspaces/self-service/plugins/` and `workspaces/aap/plugins/`
- `portal-plugin.yaml` per shippable backend module
- Repo rename to `automation-portal-plugins`

---

## 6. Contracts Published

| Consumer | Contract | Provided by |
| --- | --- | --- |
| Template authors | Action IDs and `aap-api-cloud` provider id unchanged across the split | Changelog entry per Phase 1 |
| Frontend effort | Picker↔action source-string format (§2.4), so a future picker rewrite knows what to preserve | Phase 0 inventory |
| RHDH / operator | Two backend dynamic plugin entries instead of one | `portal-plugin.yaml` installGroup |

**Semver:** the split is internal packaging as long as action IDs stay stable — a minor bump on the affected packages.

---

## 7. Open Questions

| Question | Blocking |
| --- | --- |
| Does `backstage-rhaap-common` get split so self-service can drop the AAP edge? (§4.3) | Phase 1 full independence |
| Does the content/source logic inside `createEEDefinition.ts` stay or eventually migrate? | Phase 1 effort estimate |
| Should `POST /ansible/ee` be retired via PR #189 rather than moved? | Phase 2 |

---

## 8. Reference — Source File Map

| Concern | Current path | Target |
| --- | --- | --- |
| Module registration | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts` | Split into `scaffolder-backend-module-aap/src/module.ts` + `scaffolder-backend-module-self-service/src/module.ts` |
| AAP actions | `src/actions/aap*.ts` | `scaffolder-backend-module-aap/src/actions/` |
| EE definition action | `src/actions/createEEDefinition.ts` | `scaffolder-backend-module-self-service/src/actions/` |
| Publish action | `src/actions/prepareForPublish.ts` | `scaffolder-backend-module-self-service/src/actions/` |
| Content create action | `src/actions/ansible.ts` | `scaffolder-backend-module-self-service/src/actions/` |
| Autocomplete | `src/autocomplete/` | `scaffolder-backend-module-aap/src/autocomplete/` |
| Template filters | `src/filters/` | `scaffolder-backend-module-aap/src/filters/` |
| AAP schemas | `src/actions/schemas/rhaapAction*.ts` | `scaffolder-backend-module-aap/src/actions/schemas/` |
| EE definition schema | `src/actions/schemas/rhaapActionSchemas.ts` (partial) | `scaffolder-backend-module-self-service/src/actions/schemas/eeDefinitionSchema.ts` |
| Config | `config.d.ts` (all keys) | Split: AAP owns `ansible.rhaap` + `catalog.providers.rhaap`; self-service owns `ansible.creatorService` + `ansible.devSpaces` |
| Backend wiring | `workspaces/portal-core/packages/backend/src/index.ts` | Two `backend.add()` calls |
| EE push registration | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts` | Moves in Phase 2 |
