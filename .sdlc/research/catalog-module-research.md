# Catalog Backend Module Research — Split Analysis

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (Brad — §1.3 canonical state, §2.2 workspace layout, §2.5 dependency rules, §7.3–§7.4 provider boundaries, §7.7 split constraints)
>
> **Scope:** Analyze the monolithic `catalog-backend-module-rhaap` and define an **interim peel** that preserves entity refs, operator URLs, and downstream consumers, while naming the **terminal owners** from Brad §7.4.

This document distinguishes:

| Horizon               | Meaning                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Phase 1 (interim)** | Minimal packages peeled from `catalog-backend-module-rhaap` in the current repo layout |
| **Terminal (Brad)**   | Target packages and teams per Content Experience Architecture §7.4                     |

---

## 1. Goal

The catalog backend module today is a single package that registers entity providers for AAP identity, job templates, PAH collections, Git-hosted Ansible content, and execution environment **definitions** — all under one `moduleId: 'rhaap'`. These concerns belong to different domains and should be independently deployable.

Per Brad §2.2, experiences live in `workspaces/<experience>/`. The **interim Phase 1** peel creates deployable modules without waiting for the full content service (L3) or source modules (L2):

| Concern                                    | Phase 1 (interim) module                                        | Workspace (Phase 1)                                                                                     | Terminal owner / package (Brad §7.4)                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAP identity + job templates               | `catalog-backend-module-aap`                                    | `workspaces/aap/plugins/`                                                                               | Same — AAP integration team                                                                                                                               |
| PAH + Git catalog sync (today’s providers) | `catalog-backend-module-interim-content`                        | `workspaces/self-service/plugins/` _(bridge until content workspace ships)_                             | `automation-content-backend-module-source-automation-hub`, `…-source-git`, projector `catalog-backend-module-automation-content` in `workspaces/content/` |
| EE **definition** register/delete/build    | Catalog routes + `EEEntityProvider` colocated with self-service | `workspaces/self-service/plugins/` (`scaffolder-backend-module-self-service` owns the surface per Brad) | `scaffolder-backend-module-self-service` — self-service team                                                                                              |

The original `catalog-backend-module-rhaap` package is retained as a **deprecated shim** during migration.

### 1.1 Naming map (this research → Brad §2.2)

| Term used in early drafts                                          | Use instead (Phase 1)                               | Brad terminal name                                           |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| `catalog-backend-module-portal-content`                            | `catalog-backend-module-interim-content`            | Source modules + `catalog-backend-module-automation-content` |
| `catalog-backend-module-portal-scaffolder`                         | EE peel under `workspaces/self-service/` (see §4.6) | `scaffolder-backend-module-self-service`                     |
| `workspaces/portal-scaffolder/`                                    | `workspaces/self-service/`                          | `workspaces/self-service/` per Brad §2.2                     |
| `workspaces/content/plugins/catalog-backend-module-portal-content` | Interim bridge only; not the terminal content stack | `workspaces/content/plugins/automation-content-backend*`     |

---

## 2. Current State

### 2.1 Module Identity

```
workspaces/aap/plugins/catalog-backend-module-rhaap/
├── src/
│   ├── module.ts              # Backend module registration
│   ├── router.ts              # HTTP routes (~1200 lines)
│   └── providers/
│       ├── AAPEntityProvider.ts
│       ├── AAPJobTemplateProvider.ts
│       ├── PAHCollectionProvider.ts
│       ├── AnsibleGitContentsProvider.ts
│       ├── EEEntityProvider.ts
│       ├── config.ts          # Shared config reading
│       └── SyncStateTracker.ts
└── config.d.ts
```

**Package:** `@ansible/backstage-plugin-catalog-backend-module-rhaap`
**Backstage role:** `backend-plugin-module` (`pluginId: catalog`, `moduleId: rhaap`)

### 2.2 Entity Providers

| Provider                     | Config Key                | Source                                         | Catalog Output                           | Schedule          |
| ---------------------------- | ------------------------- | ---------------------------------------------- | ---------------------------------------- | ----------------- |
| `AAPEntityProvider`          | `sync.orgsUsersTeams`     | AAP Controller                                 | `User`, `Group` (org/team), `aap-admins` | Per env           |
| `AAPJobTemplateProvider`     | `sync.jobTemplates`       | AAP job templates + surveys                    | `Template` entities                      | Same; can disable |
| `PAHCollectionProvider`      | `sync.pahCollections`     | PAH via ansible service                        | Collection entities                      | Per repository    |
| `AnsibleGitContentsProvider` | `sync.ansibleGitContents` | GitHub/GitLab crawl                            | Repos + collections                      | Per org           |
| `EEEntityProvider`           | _(on-demand)_             | `POST /ansible/ee`, `DELETE /ansible/ee/:name` | `Component` (execution-environment)      | Delta mutations   |

Brad §7.2: this EE catalog holds **definitions** (`execution-environment.yml` / builder schema), not built images with digests and trust evidence (future content service).

### 2.3 HTTP Routes

| Route Group        | Path(s)                                         | Auth                                                                                   | Phase 1 owner                              |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| Health             | `GET /health`                                   | Open (liveness only; no sync payload)                                                  | Each module that exposes health            |
| AAP identity sync  | `POST /ansible/sync/from-aap/orgs_users_teams`  | Superuser                                                                              | AAP                                        |
| AAP templates sync | `POST /ansible/sync/from-aap/job_templates`     | Superuser                                                                              | AAP                                        |
| Sync status        | `GET /ansible/sync/status` (+ per-module paths) | `catalogEntityRead`                                                                    | See §4.4                                   |
| PAH content sync   | `POST /ansible/sync/from-aap/content`           | Superuser                                                                              | Interim content (terminal: content L2/L3)  |
| SCM content sync   | `POST /ansible/sync/from-scm/content`           | Superuser                                                                              | Interim content                            |
| EE register        | `POST /ansible/ee`                              | Service credentials only                                                               | Self-service (Brad §7.4)                   |
| EE delete          | `DELETE /ansible/ee/:name`                      | User or service + catalog entity delete (on behalf of caller); `204` if entity missing | Self-service                               |
| EE build           | `POST /ansible/ee/build`                        | User + EE view permission                                                              | Self-service                               |
| Git helpers        | `GET /ansible/git/*`                            | Authenticated + perms                                                                  | Interim content → terminal: `…-source-git` |

### 2.4 Permissions

Registered in `module.ts` via `ansiblePermissions`:

| Permission                            | Current Enforcement                     |
| ------------------------------------- | --------------------------------------- |
| `catalogEntityReadPermission`         | Sync status, git helpers                |
| `executionEnvironmentsViewPermission` | EE build, git file-content              |
| `gitRepositoriesViewPermission`       | Git routes                              |
| `collectionsViewPermission`           | Git file-content (any-of)               |
| `templatesViewPermission`             | Registered; enforced in self-service UI |

### 2.5 Downstream Consumers

| Consumer                             | Uses                                  | Contract                                                                                          |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `auth-backend-module-rhaap-provider` | Catalog `User` entities from AAP sync | Required by `usernameMatchingUser` unless `dangerouslyAllowSignInWithoutUserInCatalog` is enabled |
| Scaffolder autocomplete              | Collections, templates from catalog   | Entity query via catalog search API                                                               |
| Self-service UI                      | EE definition entities + HTTP routes  | Entity shape + `/api/catalog/ansible/ee*` URLs (Brad §7.7)                                        |
| 3rd-party factory plugins            | Catalog entity kinds + annotations    | SDK contract (stable entity refs)                                                                 |

---

## 3. What Stays, What Moves

### 3.1 Entity Providers

| Provider                     | Team (Brad §7.4)   | Phase 1 destination                                                         | Terminal destination (Brad §7.4)                                                      |
| ---------------------------- | ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AAPEntityProvider`          | AAP integration    | `catalog-backend-module-aap`                                                | Same                                                                                  |
| `AAPJobTemplateProvider`     | AAP integration    | `catalog-backend-module-aap`                                                | Same                                                                                  |
| `PAHCollectionProvider`      | Content management | `catalog-backend-module-interim-content` _(shim-only alternative: §4.5)_    | `automation-content-backend-module-source-automation-hub` + `content-type-collection` |
| `AnsibleGitContentsProvider` | Content management | `catalog-backend-module-interim-content`                                    | `automation-content-backend-module-source-git`                                        |
| `EEEntityProvider`           | Self-service       | With `scaffolder-backend-module-self-service` in `workspaces/self-service/` | `scaffolder-backend-module-self-service`                                              |

### 3.2 HTTP Routes

| Route Group              | Phase 1 destination                      | URL stability (Brad §7.7)                                   |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| AAP sync triggers        | `catalog-backend-module-aap`             | Same paths                                                  |
| Sync status              | Per-module paths + shim aggregate (§4.4) | Same paths; client-side aggregation for split deployments   |
| PAH / SCM content sync   | `catalog-backend-module-interim-content` | Same paths until content service cutover                    |
| EE register/delete/build | Self-service workspace (§4.6)            | Same `/api/catalog/ansible/ee*` paths                       |
| Git helpers              | Interim content module                   | Same paths; terminal: source-git **capability** (Brad §7.4) |

### 3.3 Shared Infrastructure

| Component          | Phase 1                                                                             | Terminal (Brad §7.4)                                    |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `config.ts`        | Per-module copy; each module reads only its config keys                             | Per-package config in owning workspace                  |
| `SyncStateTracker` | Shared library or single writer in interim content module; aggregated status (§4.4) | `automation-content-backend` (canonical job/sync state) |
| `entityParser.ts`  | AAP parsing in AAP module; content parsing in interim content module                | Type modules in `content-type-*`                        |
| Backstage signals  | Each module registers its own refresh signals                                       | Projectors driven from content service outbox           |

### 3.4 Permissions

| Permission                            | Post-split owner (Phase 1)            |
| ------------------------------------- | ------------------------------------- |
| `catalogEntityReadPermission`         | Shared (Backstage core)               |
| `executionEnvironmentsViewPermission` | Self-service EE surface               |
| `gitRepositoriesViewPermission`       | Interim content → terminal source-git |
| `collectionsViewPermission`           | Interim content → terminal source-hub |
| `templatesViewPermission`             | Self-service UI                       |

---

## 4. Design Decisions

### 4.1 Minimal split preserves operator experience

Phase 1 creates independently loadable modules instead of one monolith. Operators who need only AAP identity sync load `catalog-backend-module-aap` alone. Content and git sync require the interim content module until Brad’s L2/L3 packages exist.

### 4.2 URL paths stay stable

All HTTP routes keep their current paths (Brad §7.7). The module serving the route changes; redirects are acceptable only where explicitly documented. RHDH `dynamic-plugins.yaml` changes from one entry to multiple.

### 4.3 Entity refs stay stable

Entity references (`user:default/alice`, `template:default/my-job`, etc.) are unchanged during the peel. Downstream consumers see no ref churn.

**Canonical state (Brad §1.3):** Long term, evidence and primitive history live in the **content service**; catalog entities are **projections**. This split keeps today’s catalog contracts stable while content management ingests built images and collections. Interim catalog providers remain authoritative for **synced AAP identity/templates** and **EE definitions** until the corresponding content pipelines own those projections.

### 4.4 Sync status aggregation

**Decision:** Client-side aggregation (self-service UI), not a new server-side aggregator service.

**Route strategy:**

| Module                                   | Status endpoint                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `catalog-backend-module-aap`             | `GET /ansible/sync/status/aap`                                                                                            |
| `catalog-backend-module-interim-content` | `GET /ansible/sync/status/content`                                                                                        |
| Self-service EE / definition path        | `GET /ansible/sync/status/self-service` _(EE provider has no scheduled sync; endpoint reports push/register health only)_ |

The deprecated shim retains `GET /ansible/sync/status` (monolithic shape) for backward compatibility. Split deployments: UI calls each enabled module endpoint and merges results.

Terminal: `SyncStateTracker` state moves to `automation-content-backend`; catalog status endpoints become thin projections.

### 4.5 PAHCollectionProvider transition

`PAHCollectionProvider` calls `syncCollectionsByRepositories` from `IAAPService`. When the AAP integration split narrows `IAAPService`, the provider must use a content-owned contract or a documented compatibility shim.

**Call contract (must be preserved):**

```typescript
// PAHCollectionProvider.ts:231-258
syncCollectionsByRepositories(
  [this.pahRepositoryName], // repository selection (single repo)
  100, // limit per request
  signal, // AbortSignal for cancellation
): Promise<Collection[]> // result shape from AAPClient
```

Brad §7.4: PAH is **Galaxy v3 / Pulp**, not OCI — terminal home is `automation-content-backend-module-source-automation-hub` plus `content-type-collection`, not a permanent catalog-only provider.

**Phase 1 options (pick one per deployment, never both):**

1. **Shim only:** Load deprecated `catalog-backend-module-rhaap`; PAH stays in shim.
2. **Split only:** Load `catalog-backend-module-aap` + `catalog-backend-module-interim-content`; PAH runs in interim content module.

**Forbidden:** Shim and interim content module together (duplicate providers). See §4.8.

**Phase 3:** Retire interim content catalog module; ingest via content service; `catalog-backend-module-automation-content` projects entities.

### 4.6 EE surface: self-service ownership, catalog attachment

Brad §7.4 assigns `EEEntityProvider` and `POST /ansible/ee` to **`scaffolder-backend-module-self-service`** (self-service team). The provider is push-based definition registration — not registry/OCI ingestion.

**Platform constraint:** `EEEntityProvider` still registers via `catalogProcessingExtensionPoint` (`pluginId: 'catalog'`). Routes remain on the catalog backend router at `/api/catalog/ansible/ee*`. The self-service team owns the code; it does not move to the content workspace or to a separate `portal-scaffolder` workspace.

Coordinate scaffolder **actions** with [#911](https://github.com/ansible/ansible-backstage-plugins/pull/911); actions stay in the scaffolder backend module, EE catalog surface stays with self-service.

| Field                | Value                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace            | `workspaces/self-service/plugins/`                                                                  |
| Owning module (Brad) | `scaffolder-backend-module-self-service`                                                            |
| Catalog registration | `pluginId: 'catalog'`, dedicated `moduleId` (e.g. `self-service-ee`) for EE provider + router slice |
| Scaffolder actions   | `scaffolder-backend-module-self-service` / #911 — `ansible:*` actions only                          |

**Routes and auth (unchanged on move):**

| Route                      | Auth / behavior                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /ansible/ee`         | Service credentials only (scaffolder → catalog)                                                                                                        |
| `DELETE /ansible/ee/:name` | User or service; catalog lookup + `catalogEntityDeletePermission` for caller; `204` when entity ref not found (before delete auth on missing resource) |
| `POST /ansible/ee/build`   | User/external access + `executionEnvironmentsViewPermission` + catalog read                                                                            |

`createEEDefinition` calls `DELETE` before re-registering the same EE name; extraction must keep this cleanup path.

### 4.7 Git helpers

**Resolved (Brad §7.4):** `GET /ansible/git/file-content` and related git helpers move to the **content management** source axis — terminal owner `automation-content-backend-module-source-git`. Phase 1 keeps them on `catalog-backend-module-interim-content` with the same paths and permissions until source-git ships.

### 4.8 Migration safety — duplicate providers

Loading the deprecated shim together with split modules that register the same entity providers causes **duplicate catalog entities** and inconsistent sync state.

**Required controls:**

| Layer             | Requirement                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**       | On backend startup, detect overlapping provider keys / duplicate `moduleId` registrations between shim and split modules; **fail fast** with a clear config error (do not log-and-continue). |
| **Operator docs** | Migration checklist: exactly one of {shim, split set}; matrix in §7.                                                                                                                         |
| **CI**            | Dev-app or integration test that asserts backend refuses config with shim + `catalog-backend-module-interim-content` both enabled.                                                           |
| **Packaging**     | `dynamic-plugins.yaml` examples show mutually exclusive bundles (AAP-only, split without shim, shim-only legacy).                                                                            |

---

## 5. Phases

### Phase 0 — Contract Inventory

| Item                                                  | Status   |
| ----------------------------------------------------- | -------- |
| Document all entity provider outputs (kinds, refs)    | ✅       |
| Document all HTTP routes with auth requirements       | ✅       |
| Map downstream consumers to entity/route dependencies | ✅       |
| Identify sync status aggregation requirements         | ✅       |
| Map interim peel to Brad §7.4 terminal owners         | ✅ (§12) |

### Phase 1 — Split the Backend Module

| Item                                                                             | Notes                                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Create `workspaces/aap/plugins/catalog-backend-module-aap/`                      | AAP providers + sync routes. `moduleId: 'aap'`                                |
| Create `workspaces/self-service/plugins/catalog-backend-module-interim-content/` | Interim PAH/Git providers + routes until content L2/L3; **not** Brad terminal |
| Extract EE provider + `/ansible/ee*` to self-service workspace                   | With `scaffolder-backend-module-self-service`; `pluginId: 'catalog'`          |
| Implement §4.8 duplicate-provider fail-fast                                      | Required before split modules ship                                            |
| Split `config.d.ts` per module                                                   | Per §7 configuration migration                                                |
| Deprecate original package                                                       | Shim with deprecation warning                                                 |

**Verification (extends EE flow; adds Brad §7.7 / §2.5):**

- All catalog module tests pass; entity sync end-to-end in dev app.
- EE: scaffolder action → `POST /ansible/ee` → `DELETE /ansible/ee/:name` → re-register same name (`204` on missing entity).
- **URLs:** Every route in §2.3 reachable at the same path after split (or documented redirect).
- **Self-service:** Smoke test templates/tasks/EE definition UI with split modules (no regression per §7.7).
- **Dependencies:** No new cross-workspace source imports (Brad §2.5 rules 9–10); content-type packages not imported from self-service except via published versions when content workspace exists.
- **Migration:** CI case proving shim + interim content cannot start together.

### Phase 2 — URL Compatibility Layer

| Item                                               | Notes                                 |
| -------------------------------------------------- | ------------------------------------- |
| Verify all routes work with split modules          | Same paths, different backing modules |
| Update RHDH `dynamic-plugins.yaml` examples        | Mutually exclusive bundles (§4.8)     |
| Document operator migration from monolith to split | Changelog entry                       |

### Phase 3 — Content Workspace Independence

| Item                                              | Notes                                 |
| ------------------------------------------------- | ------------------------------------- |
| `PAHCollectionProvider` → source-automation-hub   | Drop interim catalog provider         |
| Git provider → source-git                         | Retire git routes from interim module |
| `SyncStateTracker` → `automation-content-backend` | Catalog projectors only               |
| Remove `catalog-backend-module-interim-content`   | After cutover                         |

---

## 6. Contracts

| Consumer                | Contract                                                   | Phase 1 provider               | Terminal (Brad)                        |
| ----------------------- | ---------------------------------------------------------- | ------------------------------ | -------------------------------------- |
| Auth provider           | Catalog `User` entities with stable refs                   | AAP catalog module             | Same                                   |
| Scaffolder autocomplete | Catalog entity query API unchanged                         | Backstage catalog core         | Same; long term via content client ops |
| Self-service UI         | EE definition shape + `/api/catalog/ansible/ee*` unchanged | Self-service EE catalog module | Same                                   |
| Operators               | Mutually exclusive dynamic plugin bundles                  | Updated `dynamic-plugins.yaml` | Per-experience images (Brad §8)        |

**Semver:** Internal split — minor bump on new packages; major bump on deprecated shim with breaking removal timeline.

---

## 7. Operator Impact

| Area                        | Before (Today)                      | After Phase 1                                                                                             |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `dynamic-plugins.yaml`      | One `catalog-backend-module-rhaap`  | Mutually exclusive: shim **or** `catalog-backend-module-aap` + optional interim-content + self-service EE |
| Config keys                 | All under `catalog.providers.rhaap` | Split per module (§7 below)                                                                               |
| Sync URLs                   | All on catalog backend              | Same paths; optional per-module status paths (§4.4)                                                       |
| Minimal AAP-only deployment | Load full module, ignore content    | Load only `catalog-backend-module-aap`                                                                    |

**Configuration migration (no automatic mapping):**

| Old Key (Monolithic)                              | New Key (Split)                                             | Target Module                            |
| ------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `catalog.providers.rhaap.sync.orgsUsersTeams`     | `catalog.providers.aap.sync.orgsUsersTeams`                 | `catalog-backend-module-aap`             |
| `catalog.providers.rhaap.sync.jobTemplates`       | `catalog.providers.aap.sync.jobTemplates`                   | `catalog-backend-module-aap`             |
| `catalog.providers.rhaap.sync.pahCollections`     | `catalog.providers.interim-content.sync.pahCollections`     | `catalog-backend-module-interim-content` |
| `catalog.providers.rhaap.sync.ansibleGitContents` | `catalog.providers.interim-content.sync.ansibleGitContents` | `catalog-backend-module-interim-content` |

EE-related config moves under self-service catalog module keys (e.g. `catalog.providers.self-service-ee`). The shim continues reading `catalog.providers.rhaap` until removed.

**Operator action required:**

1. Choose **shim-only** or **split** bundle (never both with overlapping providers — §4.8).
2. Copy configuration sections to the new keys before enabling split modules.
3. Update `dynamic-plugins.yaml`.
4. Remove the shim only after verification.

---

## 8. Open Questions

| Question                                                           | Status                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Should sync status be aggregated server-side or client-side?       | ✅ Resolved — client-side (§4.4)                                         |
| Should `PAHCollectionProvider` stay in catalog or move to content? | ✅ Resolved — interim catalog peel; terminal source-hub (§4.5)           |
| Should Git helpers move to content or stay with catalog?           | ✅ Resolved — interim content module; terminal source-git (§4.7)         |
| What is the minimal dynamic plugin set for AAP-only identity sync? | Open — `catalog-backend-module-aap` + auth provider; document in Phase 1 |

---

## 9. Source File Map

| Concern                      | Current Path                                                           | Phase 1 target                                              | Terminal (Brad §7.4)                     |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| AAP providers                | `catalog-backend-module-rhaap/src/providers/AAP*.ts`                   | `catalog-backend-module-aap/src/providers/`                 | Same                                     |
| Content providers            | `catalog-backend-module-rhaap/src/providers/PAH*.ts`, `AnsibleGit*.ts` | `catalog-backend-module-interim-content/src/providers/`     | Source modules + projector               |
| EE provider                  | `catalog-backend-module-rhaap/src/providers/EE*.ts`                    | `workspaces/self-service/plugins/` (with scaffolder module) | `scaffolder-backend-module-self-service` |
| AAP sync routes              | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-aap/src/router.ts`                  | Same                                     |
| Content sync routes          | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-interim-content/src/router.ts`      | Content service APIs                     |
| EE routes                    | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | Self-service catalog module router slice                    | Same team/package                        |
| `SyncStateTracker`           | `catalog-backend-module-rhaap/src/...`                                 | Shared lib or interim content module                        | `automation-content-backend`             |
| Config / module registration | `catalog-backend-module-rhaap/`                                        | Split per Phase 1 module                                    | Per Brad workspace                       |

---

## 10. Alignment with Sibling Efforts

| Related Effort          | Relevance                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AAP integration split   | Defines `IAAPService` boundary; catalog uses it via `ansibleServiceRef`                                           |
| Scaffolder split (#911) | Actions in scaffolder backend module; EE **definition** catalog surface owned by self-service (§4.6), not content |
| Content workspace       | Terminal home for PAH/Git/sync state per Brad §7.4                                                                |
| Portal core             | ContributionRegistry; no direct catalog dependency                                                                |

---

## 11. References

| Document                             | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| Content Experience Architecture      | Target architecture (Brad — §1.3, §2.2, §7.3–§7.4, §7.7) |
| AAP Integration Implementation Guide | AAP workspace split — keep/leave tables                  |
| Scaffolder Implementation Guide      | Scaffolder action split                                  |
| `docs/plugins/catalog.md`            | Official operator catalog documentation                  |

---

## 12. Alignment with Content Experience Architecture (Brad)

| Brad §7.4 row                                 | Terminal package / owner                                     | Phase 1 (this peel)                                        | Status                                       |
| --------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------- |
| `EEEntityProvider`, `POST /ansible/ee`        | `scaffolder-backend-module-self-service` / self-service      | EE code in `workspaces/self-service/`, `pluginId: catalog` | **Match** (ownership); interim packaging TBD |
| `PAHCollectionProvider`                       | `…-module-source-automation-hub` + `content-type-collection` | `catalog-backend-module-interim-content`                   | **Interim** — retire in Phase 3              |
| `AnsibleGitContentsProvider`                  | `…-module-source-git`                                        | `catalog-backend-module-interim-content`                   | **Interim**                                  |
| `SyncStateTracker`                            | `automation-content-backend`                                 | Shared/interim content module                              | **Interim**                                  |
| `GET /ansible/git/file-content`               | source-git capability                                        | Interim content routes                                     | **Interim**                                  |
| `AAPEntityProvider`, `AAPJobTemplateProvider` | `catalog-backend-module-aap`                                 | Same                                                       | **Match**                                    |
| Definition vs built-image catalog (§7.2)      | Built images via content UI/types                            | EE definitions stay self-service                           | **Match**                                    |
| §7.7 URLs / no self-service regression        | Required                                                     | Phase 1 verification (§5)                                  | **Planned**                                  |
| §1.3 catalog as projection                    | Content service canonical                                    | Documented §4.3, §6                                        | **Match**                                    |
| §2.5 rules 9–10 (workspace imports)           | Enforced in CI                                               | Phase 1 verification                                       | **Planned**                                  |
