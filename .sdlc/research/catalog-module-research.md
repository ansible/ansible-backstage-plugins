# Catalog Backend Module Research — Split Analysis

> **Architecture reference:** _Content Experience Architecture_ — §1.3 (canonical state), §2.2 (workspace layout), §2.3 (layer mapping), §2.5 (dependency rules), §7.3–§7.4 (provider boundaries), §7.7 (split constraints), §8 (delivery).
>
> **Scope:** Analyze the monolithic `catalog-backend-module-rhaap` and document the **Phase 0–3** catalog split (§5): contract inventory, module peel (Phase 1), URL compatibility and operator migration (Phase 2), and content-workspace independence (Phase 3). Preserves entity refs, operator URLs, and downstream consumers in every phase; terminal owners per Content Experience Architecture §7.4.
>
> **Repo (`main`, Nov 2026):** Catalog peel targets **`workspaces/content-management/`**; portal UI and scaffolder actions live in **`workspaces/content-development/`**. The retired `workspaces/portal-scaffolder/` tree is not on `main`.

This document distinguishes:

| Horizon                     | Meaning                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| **Phase 0**                 | Contract inventory — providers, routes, consumers, sync aggregation (§5)          |
| **Phase 1**                 | Split into deployable catalog modules in current `main` workspaces (stack #1006)  |
| **Phase 2**                 | URL compatibility, `dynamic-plugins.yaml` bundles, operator cutover from monolith |
| **Phase 3**                 | L2/L3 content service ownership; retire catalog-side PAH/Git providers            |
| **Terminal (architecture)** | Target packages and owning experiences per Content Experience Architecture §7.4   |

### Repo layout on `main`

`main` already hosts the **content-management** and **content-development** experiences. Phase 1 catalog peel work targets those workspaces (not the retired `workspaces/portal-scaffolder/` tree).

| Experience axis                                      | Workspace                         | Packages relevant to this split                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAP integration                                      | `workspaces/aap/`                 | `catalog-backend-module-aap`, `catalog-backend-module-rhaap` (shim), `backstage-rhaap-common` (`…/catalog` in stack [#1006](https://github.com/ansible/ansible-backstage-plugins/stack/1006)) |
| Content management (catalog peel + L3 POC)           | `workspaces/content-management/`  | `catalog-backend-module-content` (stack), `automation-content-*`, `catalog-backend-module-automation-content`                                                                                 |
| Content development (portal UI + scaffolder actions) | `workspaces/content-development/` | `portal-scaffolder` (frontend), `scaffolder-backend-module-content-development`                                                                                                               |
| Portal shell                                         | `workspaces/portal-core/`         | Dev backend wiring                                                                                                                                                                            |

Terminal architecture names (e.g. `scaffolder-backend-module-self-service`, `workspaces/content/`) remain authoritative in Content Experience Architecture §7.4; §1.1 maps research wording to **current `main` paths**.

---

## 1. Goal

The catalog backend module today is a single package that registers entity providers for AAP identity, job templates, PAH collections, Git-hosted Ansible content, and execution environment **definitions** — all under one `moduleId: 'rhaap'`. These concerns belong to different domains and should be independently deployable.

Per Content Experience Architecture §2.2, experiences live in `workspaces/<experience>/`. **Phase 1** creates independently deployable catalog modules on `main`; **Phases 2–3** preserve URLs and migrate PAH/Git/sync state to L2/L3 per §2.3:

| Concern                                    | Phase 1 module                                                     | Workspace (Phase 1)                                                                                                                  | Terminal owner / package (architecture §7.4, Phase 3)                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAP identity + job templates               | `catalog-backend-module-aap`                                       | `workspaces/aap/plugins/`                                                                                                            | Same — `workspaces/aap/` experience                                                                                                                                        |
| PAH + Git catalog sync (today’s providers) | `catalog-backend-module-content`                                   | `workspaces/content-management/plugins/`                                                                                             | `automation-content-backend-module-source-automation-hub`, `…-source-git`, projector `catalog-backend-module-automation-content` (already on `main` in content-management) |
| EE **definition** register/delete/build    | Catalog routes + `EEEntityProvider` on content catalog slice (§13) | `workspaces/content-management/plugins/` (`catalog-backend-module-content`); scaffolder actions in `workspaces/content-development/` | `scaffolder-backend-module-self-service` — self-service experience (architecture §7.4)                                                                                     |

The original `catalog-backend-module-rhaap` package is retained as a **deprecated shim** during migration.

### 1.1 Naming map (this document → architecture §2.2)

| Superseded terminology                                                  | Phase 1 package / workspace                                                              | Terminal naming (architecture §2.2)                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `catalog-backend-module-portal-content`                                 | `catalog-backend-module-content` in `workspaces/content-management/`                     | Source modules + `catalog-backend-module-automation-content` on `main` |
| Superseded early-draft package names (pre-stack #1006)                  | `catalog-backend-module-content` in `workspaces/content-management/`                     | Same package name on `main`; Phase 1 ships via stack #1006             |
| `catalog-backend-module-portal-scaffolder`                              | EE + PAH/Git catalog slice under `workspaces/content-management/` (§13)                  | `scaffolder-backend-module-self-service` (architecture §7.4)           |
| `workspaces/self-service/` or `workspaces/portal-scaffolder/` (retired) | `workspaces/content-development/` (UI) + `workspaces/content-management/` (catalog peel) | Self-service experience per Content Experience Architecture §2.2       |
| `workspaces/content/plugins/…` (architecture §2.2 terminal path)        | L3 POC packages already under `workspaces/content-management/`                           | Terminal `automation-content-backend*` per §7.4                        |
| `scaffolder-backend-module-portal` / `…-backstage-rhaap` (legacy)       | `scaffolder-backend-module-content-development` in `workspaces/content-development/`     | `scaffolder-backend-module-self-service` (architecture §7.4)           |
| `portal-scaffolder` (frontend plugin id)                                | `workspaces/content-development/plugins/portal-scaffolder/`                              | Self-service experience per architecture §2.2                          |

### 1.2 Authoritative sources (implementation)

| Source                                                                       | Role                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Content Experience Architecture** (§7.3–§7.4, §2.2)                        | **Authoritative** for terminal package names, owning experiences, and provider boundaries for this split.                                                            |
| `docs/architecture/content-experience-refactor-and-sdk.md` (this repository) | Describes in-repo layout; may lag **`content-management`** / **`content-development`** on `main`. Prefer this research §1.1 + §13 for catalog split workspace paths. |
| `workspaces/content-management/README.md`                                    | L3 automation-content POC; separate from PAH/Git **catalog peel** (`catalog-backend-module-content`) but same experience axis.                                       |
| Scaffolder Implementation Guide (§11)                                        | Scaffolder **actions** in `content-development`; EE **definition** catalog registration on `catalog-backend-module-content` (`pluginId: catalog`, §4.6 / §13).       |

When this research disagrees with in-repo architecture markdown, **Content Experience Architecture §7.4** governs terminal ownership; Phase 1 package names in §1.1 are the split packages peeled from `catalog-backend-module-rhaap` (Phases 2–3 in §5 complete the migration).

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

Content Experience Architecture §7.2: this EE catalog holds **definitions** (`execution-environment.yml` / builder schema), not built images with digests and trust evidence (future content service).

### 2.3 HTTP Routes

| Route Group        | Path(s)                                         | Auth                                                                                                                                                                                     | Phase 1 owner                                              |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Health             | `GET /health`                                   | Open (liveness only; no sync payload)                                                                                                                                                    | Each module that exposes health                            |
| AAP identity sync  | `POST /ansible/sync/from-aap/orgs_users_teams`  | Superuser                                                                                                                                                                                | AAP                                                        |
| AAP templates sync | `POST /ansible/sync/from-aap/job_templates`     | Superuser                                                                                                                                                                                | AAP                                                        |
| Sync status        | `GET /ansible/sync/status` (+ per-module paths) | `catalogEntityRead`                                                                                                                                                                      | See §4.4                                                   |
| PAH content sync   | `POST /ansible/sync/from-aap/content`           | Superuser                                                                                                                                                                                | `catalog-backend-module-content` (Phase 3: L2/L3)          |
| SCM content sync   | `POST /ansible/sync/from-scm/content`           | Superuser                                                                                                                                                                                | `catalog-backend-module-content`                           |
| EE register        | `POST /ansible/ee`                              | User or service; caller-scoped catalog access under EE lock — `catalog.entity.create` for net-new, `catalog.entity.delete` when replacing entity or pending registration (§4.6; #997)    | Self-service (Content Experience Architecture §7.4)        |
| EE delete          | `DELETE /ansible/ee/:name`                      | User or service; caller-scoped catalog/unregister — `204` only when entity absent **and** persisted registration state is `none`; pending registration requires delete auth (§4.6; #997) | Self-service                                               |
| EE build           | `POST /ansible/ee/build`                        | User + EE view permission                                                                                                                                                                | Self-service                                               |
| Git helpers        | `GET /ansible/git/*`                            | Authenticated + perms                                                                                                                                                                    | `catalog-backend-module-content` → Phase 3: `…-source-git` |

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
| Self-service UI                      | EE definition entities + HTTP routes  | Entity shape + `/api/catalog/ansible/ee*` URLs (Content Experience Architecture §7.7)             |
| 3rd-party factory plugins            | Catalog entity kinds + annotations    | SDK contract (stable entity refs)                                                                 |

---

## 3. What Stays, What Moves

### 3.1 Entity Providers

| Provider                     | Owning experience (§7.4)                                | Phase 1 destination                                                                                           | Terminal destination (§7.4)                                                           |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AAPEntityProvider`          | AAP integration                                         | `catalog-backend-module-aap`                                                                                  | Same                                                                                  |
| `AAPJobTemplateProvider`     | AAP integration                                         | `catalog-backend-module-aap`                                                                                  | Same                                                                                  |
| `PAHCollectionProvider`      | Content management                                      | `catalog-backend-module-content` in `workspaces/content-management/` _(shim-only alternative: §4.5)_          | `automation-content-backend-module-source-automation-hub` + `content-type-collection` |
| `AnsibleGitContentsProvider` | Content management                                      | `catalog-backend-module-content` in `workspaces/content-management/`                                          | `automation-content-backend-module-source-git`                                        |
| `EEEntityProvider`           | Content development (UI) / content-management (catalog) | `catalog-backend-module-content` (§13); scaffolder actions in `scaffolder-backend-module-content-development` | `scaffolder-backend-module-self-service` (architecture §7.4)                          |

### 3.2 HTTP Routes

| Route Group              | Phase 1 destination                      | URL stability (Content Experience Architecture §7.7)                                  |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| AAP sync triggers        | `catalog-backend-module-aap`             | Same paths                                                                            |
| Sync status              | Per-module paths + shim aggregate (§4.4) | Same paths; client-side aggregation for split deployments                             |
| PAH / SCM content sync   | `catalog-backend-module-content`         | Same paths until content service cutover                                              |
| EE register/delete/build | Self-service workspace (§4.6)            | Same `/api/catalog/ansible/ee*` paths                                                 |
| Git helpers              | `catalog-backend-module-content`         | Same paths; Phase 3: source-git **capability** (Content Experience Architecture §7.4) |

### 3.3 Shared Infrastructure

| Component          | Phase 1                                                                                       | Terminal (Content Experience Architecture §7.4)                  |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `config.ts`        | Per-module copy; each module reads only its config keys                                       | Per-package config in owning workspace                           |
| `SyncStateTracker` | Shared library or single writer in `catalog-backend-module-content`; aggregated status (§4.4) | `automation-content-backend` (canonical job/sync state, Phase 3) |
| `entityParser.ts`  | AAP parsing in AAP module; content parsing in `catalog-backend-module-content`                | Type modules in `content-type-*` (Phase 3)                       |
| Backstage signals  | Each module registers its own refresh signals                                                 | Projectors driven from content service outbox                    |

### 3.4 Permissions

| Permission                            | Post-split owner (Phase 1)                             |
| ------------------------------------- | ------------------------------------------------------ |
| `catalogEntityReadPermission`         | Shared (Backstage core)                                |
| `executionEnvironmentsViewPermission` | Self-service EE surface                                |
| `gitRepositoriesViewPermission`       | `catalog-backend-module-content` → Phase 3: source-git |
| `collectionsViewPermission`           | `catalog-backend-module-content` → Phase 3: source-hub |
| `templatesViewPermission`             | Self-service UI                                        |

---

## 4. Design Decisions

### 4.1 Minimal split preserves operator experience

Phase 1 creates independently loadable modules instead of one monolith. **AAP identity sign-in** requires the plugin set in §7.1 (catalog AAP module + auth provider), not the catalog module alone. Content and git sync run on `catalog-backend-module-content` in Phases 1–2; **Phase 3** moves those concerns to the architecture’s L2/L3 packages (§2.3).

### 4.2 URL paths stay stable

All **functional** HTTP routes (sync triggers, EE register/delete/build, git helpers, content sync) keep their current paths (Content Experience Architecture §7.7). The module serving the route changes; redirects are acceptable only where explicitly documented.

**Exception — sync status on split deployments:** Monolithic `GET /ansible/sync/status` is retained on the **deprecated shim** and, in stack [#1006](https://github.com/ansible/ansible-backstage-plugins/stack/1006), on the **content** catalog module for content-only bundles and UI fallback (§13.2). Other split bundles (§4.5) do not load the shim (§4.8); callers use per-module status paths or portal UI aggregation (§4.4).

RHDH `dynamic-plugins.yaml` changes from one entry to multiple.

### 4.3 Entity refs stay stable

Entity references (`user:default/alice`, `template:default/my-job`, etc.) are unchanged during the peel. Downstream consumers see no ref churn.

**Canonical state (Content Experience Architecture §1.3):** Long term, evidence and primitive history live in the **content service**; catalog entities are **projections**. This split keeps today’s catalog contracts stable while content management ingests built images and collections. Phase 1–2 catalog providers remain authoritative for **synced AAP identity/templates** and **EE definitions** until **Phase 3** content pipelines own those projections.

### 4.4 Sync status aggregation

**Decision:** Client-side aggregation (self-service UI), not a new server-side aggregator service.

**Route strategy:**

| Module                                      | Status endpoint                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog-backend-module-aap`                | `GET /ansible/sync/status/aap`                                                                                                                   |
| `catalog-backend-module-content`            | `GET /ansible/sync/status/content`                                                                                                               |
| `catalog-backend-module-content` (EE slice) | `GET /ansible/sync/status/self-service` _(served from content catalog module in as-built §13; no scheduled EE sync — push/register health only)_ |

The deprecated shim retains `GET /ansible/sync/status` (monolithic shape) for **shim-only** deployments. **Split deployments** (§4.5): the self-service UI (or other callers) requests each enabled endpoint in the table above and merges client-side. Legacy integrations that cannot call multiple endpoints should stay on **shim-only** until they migrate.

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

Content Experience Architecture §7.4: PAH is **Galaxy v3 / Pulp**, not OCI — terminal home is `automation-content-backend-module-source-automation-hub` plus `content-type-collection`, not a permanent catalog-only provider.

**Phase 1 deployment bundles (mutually exclusive with overlapping providers — §4.8):**

1. **Shim only:** Load deprecated `catalog-backend-module-rhaap` (all providers + monolithic `GET /ansible/sync/status`).
2. **Split — AAP catalog sync only:** `catalog-backend-module-aap` (+ `auth-backend-module-rhaap-provider` when username-matched sign-in is required — §7.1).
3. **Split — content (PAH/Git):** Bundle 2 + `catalog-backend-module-content`.
4. **Split — full (includes EE definitions):** Bundle 3 with EE catalog slice on `catalog-backend-module-content` (`workspaces/content-management/`, §13) plus scaffolder actions in `workspaces/content-development/`. Required for `/ansible/ee*`, `EEEntityProvider`, and `createEEDefinition` cleanup.

**Forbidden:** Shim and any split module that registers the same entity providers (e.g. shim + `catalog-backend-module-content`). See §4.8.

**Phase 3:** Retire PAH/Git providers on `catalog-backend-module-content`; ingest via content service; `catalog-backend-module-automation-content` projects entities.

### 4.6 EE surface: self-service ownership, catalog attachment

Architecture §7.4 assigns `EEEntityProvider` and `POST /ansible/ee` to **`scaffolder-backend-module-self-service`** (self-service experience). The provider is push-based definition registration — not registry/OCI ingestion.

**Platform constraint:** `EEEntityProvider` still registers via `catalogProcessingExtensionPoint` (`pluginId: 'catalog'`). Routes remain on the catalog backend router at `/api/catalog/ansible/ee*`. Scaffolder **actions** already live in `workspaces/content-development/` on released `main`; after stack #1006 merges, EE **catalog** registration moves to the content slice inside `catalog-backend-module-content` (`workspaces/content-management/`, §13) — not a separate `portal-scaffolder` workspace package.

Scaffolder **actions** remain in the scaffolder backend module per the Scaffolder Implementation Guide (§11) — `scaffolder-backend-module-content-development` on `main`. EE **catalog** routes follow the stack layout in §13 (pending merge).

| Field                    | Value                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Workspace (UI / actions) | `workspaces/content-development/plugins/` (`scaffolder-backend-module-content-development`)                        |
| Catalog module (§13)     | `workspaces/content-management/plugins/` (`catalog-backend-module-content`, content slice)                         |
| Owning module (§7.4)     | `scaffolder-backend-module-self-service` (architecture); `…-content-development` on `main`                         |
| Catalog registration     | `pluginId: 'catalog'` on `catalog-backend-module-content` (as-built §13; research alias `self-service-ee`)         |
| Scaffolder actions       | `scaffolder-backend-module-content-development` on `main` (architecture: `scaffolder-backend-module-self-service`) |

**Routes and auth (preserve on move — behavior merged via [#997](https://github.com/ansible/ansible-backstage-plugins/pull/997)):**

| Route                      | Auth / behavior                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /ansible/ee`         | **User or service** credentials. Catalog reads use a plugin token **on behalf of the caller** (service token only when caller-scoped read cannot see an existing entity). Under the shared **EE registration lock**: `catalogEntityCreatePermission` for net-new registration; `catalogEntityDeletePermission` on the entity ref when replacing an existing entity **or** when persisted registration state is not `none`. |
| `DELETE /ansible/ee/:name` | **User or service**; catalog lookup/unregister on behalf of the caller. Returns **`204` only when** the entity is absent after caller + service visibility checks **and** `registrationState === 'none'`. A **pending registration** without a visible entity still requires `catalogEntityDeletePermission` before provider cleanup.                                                                                      |
| `POST /ansible/ee/build`   | User/external access + `executionEnvironmentsViewPermission` + catalog read                                                                                                                                                                                                                                                                                                                                                |

`createEEDefinition` calls `DELETE` before re-registering the same EE name; extraction must keep this cleanup path and the caller-scoped permission checks above.

#### _(Research)_ separate EE catalog module

Earlier peel drafts introduced a dedicated catalog `moduleId` (e.g. `self-service-ee`) colocated with scaffolder in a single workspace. **Operator migration** does not use that layout; see §7.1 and §13.1 (EE on `catalog-backend-module-content`).

### 4.7 Git helpers

**Resolved (Content Experience Architecture §7.4):** `GET /ansible/git/file-content` and related git helpers move to the **content management** source axis — terminal owner `automation-content-backend-module-source-git`. Phase 1 keeps them on `catalog-backend-module-content` with the same paths and permissions until source-git ships.

### 4.8 Migration safety — duplicate providers

Loading the deprecated shim together with split modules that register the same entity providers causes **duplicate catalog entities** and inconsistent sync state.

**Required controls:**

| Layer             | Requirement                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**       | On backend startup, detect overlapping provider keys / duplicate `moduleId` registrations between shim and split modules; **fail fast** with a clear config error (do not log-and-continue). |
| **Operator docs** | Migration checklist (as-built): §7.4; config keys §7.3; exactly one of {shim, split set}.                                                                                                    |
| **CI**            | Dev-app or integration test that asserts backend refuses config with shim + `catalog-backend-module-content` both enabled.                                                                   |
| **Packaging**     | `dynamic-plugins.yaml` examples show mutually exclusive bundles (AAP-only, split without shim, shim-only legacy).                                                                            |

---

## 5. Phases

### Phase 0 — Contract Inventory

| Item                                                                        | Status   |
| --------------------------------------------------------------------------- | -------- |
| Document all entity provider outputs (kinds, refs)                          | ✅       |
| Document all HTTP routes with auth requirements                             | ✅       |
| Map downstream consumers to entity/route dependencies                       | ✅       |
| Identify sync status aggregation requirements                               | ✅       |
| Map Phase 0–3 split to Content Experience Architecture §7.4 terminal owners | ✅ (§12) |

### Phase 1 — Split the Backend Module

| Item                                                                           | Notes                                                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Create `workspaces/aap/plugins/catalog-backend-module-aap/`                    | AAP providers + sync routes. `moduleId: 'aap'`                                                             |
| Create `workspaces/content-management/plugins/catalog-backend-module-content/` | PAH/Git (+ EE catalog slice per §13) until terminal L2/L3; **not** the terminal architecture target (§7.4) |
| Wire EE provider + `/ansible/ee*` on content catalog module                    | Scaffolder actions stay in `workspaces/content-development/`; `pluginId: 'catalog'` on content slice (§13) |
| Implement §4.8 duplicate-provider fail-fast                                    | Required before split modules ship                                                                         |
| Split `config.d.ts` per module                                                 | Per §7 configuration migration                                                                             |
| Deprecate original package                                                     | Shim with deprecation warning                                                                              |

**Verification (extends EE flow; adds Content Experience Architecture §7.7 / §2.5):**

- All catalog module tests pass; entity sync end-to-end in dev app.
- EE: scaffolder action → `POST /ansible/ee` (create) → `DELETE /ansible/ee/:name` (cleanup) → `POST /ansible/ee` (re-register same name). Assert caller-scoped `catalog.entity.create` / `catalog.entity.delete` under the EE lock ([#997](https://github.com/ansible/ansible-backstage-plugins/pull/997)); `DELETE` returns `204` only when entity and persisted registration state are both absent.
- **URLs:** Every **functional** route in §2.3 reachable at the same path after split (§4.2); sync status on split bundles uses per-module paths (§4.4).
- **Self-service:** Smoke test templates/tasks/EE definition UI with split modules (no regression per §7.7).
- **Dependencies:** No new cross-workspace source imports (Content Experience Architecture §2.5 rules 9–10); content-type packages not imported from self-service except via published versions when content workspace exists.
- **Migration:** CI case proving shim + `catalog-backend-module-content` cannot start together.

### Phase 2 — URL Compatibility Layer

| Item                                               | Notes                                 |
| -------------------------------------------------- | ------------------------------------- |
| Verify all routes work with split modules          | Same paths, different backing modules |
| Update RHDH `dynamic-plugins.yaml` examples        | Mutually exclusive bundles (§4.8)     |
| Document operator migration from monolith to split | Changelog entry                       |

### Phase 3 — Content Workspace Independence

| Item                                              | Notes                                 |
| ------------------------------------------------- | ------------------------------------- |
| `PAHCollectionProvider` → source-automation-hub   | Drop Phase 1–2 catalog provider       |
| Git provider → source-git                         | Retire git routes from content module |
| `SyncStateTracker` → `automation-content-backend` | Catalog projectors only               |
| Remove `catalog-backend-module-content`           | After cutover                         |

---

## 6. Contracts

| Consumer                | Contract                                                   | Phase 1 provider                                                                                    | Terminal (architecture)                                    |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Auth provider           | Catalog `User` entities with stable refs                   | AAP catalog module                                                                                  | Same                                                       |
| Scaffolder autocomplete | Catalog entity query API unchanged                         | Backstage catalog core                                                                              | Same; long term via content client ops                     |
| Self-service UI         | EE definition shape + `/api/catalog/ansible/ee*` unchanged | `catalog-backend-module-content` (EE slice) + `scaffolder-backend-module-content-development` (§13) | Same                                                       |
| Operators               | Mutually exclusive dynamic plugin bundles                  | Updated `dynamic-plugins.yaml`                                                                      | Per-experience images (Content Experience Architecture §8) |

**Semver:** Internal split — minor bump on new packages; major bump on deprecated shim with breaking removal timeline.

---

## 7. Operator Impact

**How to use this section:** **Actionable migration** for Phase 1 (stack [#1006](https://github.com/ansible/ansible-backstage-plugins/stack/1006)) is in **§7.3–§7.4**, aligned with **§13**. Apply **§7.3–§7.4 after stack #1006 merges to `main`** — until then, released `main` continues to ship `catalog-backend-module-rhaap` only (§13). Deployment bundles in §4.5 and narrative in §1–§6 cover **Phases 1–3**; labels _(research)_ mark superseded options operators should **not** deploy.

### 7.1 AAP identity deployment (catalog vs auth)

| Goal                                                            | Required dynamic plugins (as-built — §7.4)                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAP org/user/job-template **catalog sync**                      | `catalog-backend-module-aap`                                                                                                                                                          |
| AAP **username-matched sign-in** (`usernameMatchingUser`, §2.5) | `catalog-backend-module-aap` **and** `auth-backend-module-rhaap-provider`                                                                                                             |
| PAH/Git catalog sync                                            | `catalog-backend-module-content` (`workspaces/content-management/`) — bundle 3                                                                                                        |
| EE definitions (scaffolder / portal)                            | Same **`catalog-backend-module-content`** (PAH/Git/EE catalog slice) **plus** `scaffolder-backend-module-content-development` — bundle 4; not a separate EE-only catalog module (§13) |

Loading only `catalog-backend-module-aap` without the auth provider breaks sign-in for deployments that rely on catalog-backed user matching.

_(Research)_ An earlier peel sketch modeled EE as its own catalog module (`moduleId: self-service-ee`, config `catalog.providers.self-service-ee`). **Do not use that layout for migration** — EE catalog registration is folded into `catalog-backend-module-content` (§13).

### 7.2 Operator summary

| Area                   | Before (Today)                      | After Phase 1                                                                     |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `dynamic-plugins.yaml` | One `catalog-backend-module-rhaap`  | Mutually exclusive bundles per §4.5 (shim **or** split 2/3/4)                     |
| Config keys            | All under `catalog.providers.rhaap` | `catalog.providers.aap` / `catalog.providers.content` (+ shim fallback) — §7.3    |
| Migration checklist    | Implicit monolith                   | **As-built:** §7.4 (plugins + config + sync + cutover)                            |
| Sync URLs              | Monolithic `/ansible/sync/status`   | Shim-only: unchanged; split: per-module status paths + UI aggregation (§4.2–§4.4) |
| Minimal AAP identity   | Full `catalog-backend-module-rhaap` | `catalog-backend-module-aap` + `auth-backend-module-rhaap-provider` (§7.1)        |

### 7.3 Configuration migration (as-built)

There is **no automatic config rewrite**. Operators **copy** `catalog.providers.rhaap.<env>` subtrees to the slice keys below **before** enabling split catalog modules (stack PR [#980](https://github.com/ansible/ansible-backstage-plugins/pull/980)). Split modules read their slice key first and **fall back** to `catalog.providers.rhaap` when the slice key is unset (compatibility during cutover; prefer explicit slice keys for new deployments).

| Monolithic (per env)                                    | As-built (same `<env>`)                                   | Catalog module                   |
| ------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `catalog.providers.rhaap.<env>.sync.orgsUsersTeams`     | `catalog.providers.aap.<env>.sync.orgsUsersTeams`         | `catalog-backend-module-aap`     |
| `catalog.providers.rhaap.<env>.sync.jobTemplates`       | `catalog.providers.aap.<env>.sync.jobTemplates`           | `catalog-backend-module-aap`     |
| `catalog.providers.rhaap.<env>.sync.pahCollections`     | `catalog.providers.content.<env>.sync.pahCollections`     | `catalog-backend-module-content` |
| `catalog.providers.rhaap.<env>.sync.ansibleGitContents` | `catalog.providers.content.<env>.sync.ansibleGitContents` | `catalog-backend-module-content` |

**Example (copy per environment):**

```yaml
# Before (monolith) — one env block
catalog:
  providers:
    rhaap:
      development:
        sync:
          orgsUsersTeams: { schedule: { ... } }
          jobTemplates: { enabled: true, schedule: { ... } }
          pahCollections: { ... }
          ansibleGitContents: { ... }

# After (split, as-built) — same development subtree on both slice keys
catalog:
  providers:
    aap:
      development:
        sync:
          orgsUsersTeams: { schedule: { ... } }
          jobTemplates: { enabled: true, schedule: { ... } }
    content:
      development:
        sync:
          pahCollections: { ... }
          ansibleGitContents: { ... }
```

**EE definitions (as-built):** Copy any EE-related provider settings from `catalog.providers.rhaap.<env>` into the matching **`catalog.providers.content.<env>`** tree. `EEEntityProvider` registers on **`catalog-backend-module-content`** (§13), not on a separate catalog module.

**Shim:** `catalog-backend-module-rhaap` continues to read only `catalog.providers.rhaap` until removed.

#### _(Research)_ alternate config layout — separate EE catalog module

| Old / monolithic | Keys under _(research)_ `catalog.providers.self-service-ee` | Module _(research)_                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------- |
| EE provider sync | `catalog.providers.self-service-ee.*`                       | Standalone EE catalog slice (§4.6 sketch) |

Superseded by the as-built table above and §13.1 (EE folded into `catalog-backend-module-content`).

### 7.4 Operator migration checklist (as-built)

Use with §4.5 bundles and §4.8 duplicate-provider rules. Mirrors §13.2 contracts.

1. **Choose one bundle:** Shim-only **or** split set (2 / 3 / 4) — never shim **and** a split module that registers overlapping providers.
2. **`dynamic-plugins.yaml`:** Replace monolith with the packages for that bundle:
   - **Shim:** `catalog-backend-module-rhaap` only.
   - **Split AAP:** `catalog-backend-module-aap` (+ `auth-backend-module-rhaap-provider` when §7.1 sign-in applies).
   - **+ Content:** add `catalog-backend-module-content` (`workspaces/content-management/`).
   - **+ EE definitions / scaffolder:** keep `catalog-backend-module-content`; add `scaffolder-backend-module-content-development` (`workspaces/content-development/`) for scaffolder actions — **do not** add a separate EE catalog-only module.
3. **Configuration:** Per §7.3, copy `catalog.providers.rhaap.<env>` sections to `catalog.providers.aap.<env>` and/or `catalog.providers.content.<env>` (include EE-related keys under **content**).
4. **Sync status:** On split bundles, use per-slice URLs in §4.4 / §13.2; portal UI aggregates. Content-only split may still expose legacy `GET /ansible/sync/status` on the content catalog module (§4.2). Shim-only keeps monolithic `/ansible/sync/status`.
5. **Verify** the split bundle with the shim **disabled** in a non-production revision; then switch bundles in one step and retire the shim.

---

## 8. Open Questions

| Question                                                           | Status                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Should sync status be aggregated server-side or client-side?       | ✅ Resolved — client-side (§4.4)                                                         |
| Should `PAHCollectionProvider` stay in catalog or move to content? | ✅ Resolved — Phase 1–2 on `catalog-backend-module-content`; Phase 3 source-hub (§4.5)   |
| Should Git helpers move to content or stay with catalog?           | ✅ Resolved — Phase 1–2 on content module; Phase 3 source-git (§4.7)                     |
| What is the minimal dynamic plugin set for AAP-only identity sync? | ✅ Resolved — `catalog-backend-module-aap` + `auth-backend-module-rhaap-provider` (§7.1) |

---

## 9. Source File Map

| Concern                      | Current Path                                                           | Phase 1 target                                                                | Terminal (Content Experience Architecture §7.4) |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| AAP providers                | `catalog-backend-module-rhaap/src/providers/AAP*.ts`                   | `catalog-backend-module-aap/src/providers/`                                   | Same                                            |
| Content providers            | `catalog-backend-module-rhaap/src/providers/PAH*.ts`, `AnsibleGit*.ts` | `catalog-backend-module-content/src/providers/`                               | Source modules + projector                      |
| EE provider                  | `catalog-backend-module-rhaap/src/providers/EE*.ts`                    | `workspaces/content-management/plugins/catalog-backend-module-content/` (§13) | `scaffolder-backend-module-self-service`        |
| AAP sync routes              | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-aap/src/router.ts`                                    | Same                                            |
| Content sync routes          | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-content/src/router.ts`                                | Content service APIs                            |
| EE routes                    | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-content` router slice (as-built §13)                  | Same team/package (architecture §7.4)           |
| `SyncStateTracker`           | `catalog-backend-module-rhaap/src/...`                                 | Shared lib or `catalog-backend-module-content` (Phase 1–2)                    | `automation-content-backend` (Phase 3)          |
| Config / module registration | `catalog-backend-module-rhaap/`                                        | Split per Phase 1 module                                                      | Per architecture §2.2 workspace layout          |

---

## 10. Alignment with Sibling Efforts

| Related Effort                                     | Relevance                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AAP integration split                              | Defines `IAAPService` boundary; catalog uses it via `ansibleServiceRef`                                                  |
| Scaffolder implementation guide                    | Actions in scaffolder backend module; EE **definition** catalog surface owned by self-service (§4.6), not content        |
| Content workspace (`content-management` on `main`) | Terminal home for PAH/Git/sync state per Content Experience Architecture §7.4; L3 POC packages coexist with catalog peel |
| Portal core                                        | ContributionRegistry; no direct catalog dependency                                                                       |

---

## 11. References

| Document                                                   | Description                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Content Experience Architecture                            | Target architecture — §1.3, §2.2, §2.3, §2.5, §7.3–§7.4, §7.7, §8 (authoritative per §1.2) |
| `docs/architecture/content-experience-refactor-and-sdk.md` | In-repo layout; cross-check against `content-management` / `content-development` on `main` |
| AAP Integration Implementation Guide                       | AAP workspace split — keep/leave tables                                                    |
| Scaffolder Implementation Guide                            | Scaffolder action split                                                                    |
| `docs/plugins/catalog.md`                                  | Official operator catalog documentation                                                    |

---

## 12. Alignment with Content Experience Architecture

| Architecture §7.4 row                         | Terminal package / owner (Phase 3)                           | Phase 1–2 (catalog split)                                                                               | Status                                                 |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `EEEntityProvider`, `POST /ansible/ee`        | `scaffolder-backend-module-self-service` / self-service      | `catalog-backend-module-content` in `workspaces/content-management/` (§13); UI in `content-development` | **Match** (catalog attachment + content-dev ownership) |
| `PAHCollectionProvider`                       | `…-module-source-automation-hub` + `content-type-collection` | `catalog-backend-module-content`                                                                        | **Phase 3** — move to source-hub                       |
| `AnsibleGitContentsProvider`                  | `…-module-source-git`                                        | `catalog-backend-module-content`                                                                        | **Phase 3** — move to source-git                       |
| `SyncStateTracker`                            | `automation-content-backend`                                 | Shared lib or `catalog-backend-module-content`                                                          | **Phase 3** — canonical sync state                     |
| `GET /ansible/git/file-content`               | source-git capability                                        | `catalog-backend-module-content` routes                                                                 | **Phase 3** — source-git capability                    |
| `AAPEntityProvider`, `AAPJobTemplateProvider` | `catalog-backend-module-aap`                                 | Same                                                                                                    | **Match**                                              |
| Definition vs built-image catalog (§7.2)      | Built images via content UI/types                            | EE definitions stay self-service                                                                        | **Match**                                              |
| §7.7 URLs / no self-service regression        | Required                                                     | Phase 1 verification (§5)                                                                               | **Planned**                                            |
| §1.3 catalog as projection                    | Content service canonical                                    | Documented §4.3, §6                                                                                     | **Match**                                              |
| §2.5 rules 9–10 (workspace imports)           | Enforced in CI                                               | Phase 1 verification                                                                                    | **Planned**                                            |

---

## 13. Phase 1 implementation checkpoint (stack #1006 — pending merge)

> **Released `main` today:** Split catalog packages are **not** operator-available until [stack #1006](https://github.com/ansible/ansible-backstage-plugins/stack/1006) merges. Ship **`catalog-backend-module-rhaap`** (monolith/shim) on current `main`. Workspaces `content-management` / `content-development` exist on `main`; **`catalog-backend-module-aap`**, **`catalog-backend-module-content`**, and **`backstage-rhaap-common/src/catalog`** land via the stack PRs below.

This section is the **implementation-stack checkpoint** for Phase 1 (AAP-98845, Nov 2026) — not a statement that split modules are already on `main`. §1–§12 describe **Phases 0–3** end to end; **§7.3–§7.4** apply after the stack lands. **Phases 2–3** remain planned per §5.

### 13.0 Stack prerequisites

| Item                                                                           | Role                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Stack #1006](https://github.com/ansible/ansible-backstage-plugins/stack/1006) | Phase 1 peel delivery vehicle (AAP-98845)                         |
| [#979](https://github.com/ansible/ansible-backstage-plugins/pull/979)          | Module split + shared `rhaap-common/catalog`                      |
| [#980](https://github.com/ansible/ansible-backstage-plugins/pull/980)          | Config peel (`catalog.providers.aap` / `content`)                 |
| [#981](https://github.com/ansible/ansible-backstage-plugins/pull/981)          | UI aggregation + tests                                            |
| [#997](https://github.com/ansible/ansible-backstage-plugins/pull/997)          | EE `POST`/`DELETE` caller-scoped auth (preserved in split — §4.6) |

Status at research revision: stack PRs **open**; treat §13 layout as **pending merge**, not current production `main`.

### 13.1 Package and workspace mapping (stack branch)

| Superseded name (§1.1)                                        | Phase 1 stack layout (PRs [#979](https://github.com/ansible/ansible-backstage-plugins/pull/979)–[#981](https://github.com/ansible/ansible-backstage-plugins/pull/981))      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared provider library (was discussed as a separate package) | **`@ansible/backstage-rhaap-common/catalog`** — providers, sync router, `createCatalogModule()`, slice guard (`workspaces/aap/plugins/backstage-rhaap-common/src/catalog/`) |
| Early-draft content catalog package names                     | **`catalog-backend-module-content`** in **`workspaces/content-management/plugins/`**                                                                                        |
| `catalog-backend-module-aap`                                  | Unchanged — **`workspaces/aap/plugins/`**                                                                                                                                   |
| Separate EE catalog module (`self-service-ee`)                | **Folded into `catalog-backend-module-content`** (content slice registers PAH, Git SCM, and EE)                                                                             |
| `workspaces/portal-scaffolder/` (retired experience root)     | **Not on `main`**; UI + scaffolder actions in **`workspaces/content-development/`** (`portal-scaffolder`, `scaffolder-backend-module-content-development`)                  |
| Monolith migration                                            | **`catalog-backend-module-rhaap`** remains a **deprecated shim** (`slice: 'all'`)                                                                                           |

### 13.2 Preserved contracts (still match §4 / §6)

**Operator steps:** §7.4 (migration checklist) and §7.3 (config copy).

- Public **URL paths** and entity ref shapes unchanged.
- EE **POST** / **DELETE** caller-scoped catalog authorization and pending-registration `204` rules unchanged ([#997](https://github.com/ansible/ansible-backstage-plugins/pull/997); §4.6).
- **§4.8** slice guard: shim cannot load with any split slice module.
- Split sync status: `/ansible/sync/status/aap`, `/ansible/sync/status/content`, `/ansible/sync/status/self-service` (EE status via content module router slice).
- Legacy combined `GET /ansible/sync/status` on the **content** catalog module for content-only deployments and portal client fallback (§4.2).
- Config peel (PR 2): `catalog.providers.aap` / `catalog.providers.content` with **`catalog.providers.rhaap` fallback**.

### 13.3 Open / follow-up (unchanged from §12)

- Terminal **L2/L3 content service** ownership (source modules, `automation-content-backend` canonical sync state).
- Moving content-side implementation out of **`aap`** `backstage-rhaap-common/catalog` into a **content-management** common library (workspace boundary; pending pod alignment).
- EE **scaffolder actions** remain in scaffolder modules; EE **catalog entities** are registered by the content catalog module.
