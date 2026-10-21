# Catalog Backend Module Research — Split Analysis

> **Architecture reference:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (private repo — §2.2 workspace layout, §7.3–§7.4 provider boundaries)
>
> **Scope:** Analyze the monolithic `catalog-backend-module-rhaap` and determine the minimal split that preserves entity refs, operator URLs, and downstream consumers.

---

## 1. Goal

The catalog backend module today is a single package that registers entity providers for AAP identity, job templates, PAH collections, Git-hosted Ansible content, and execution environments — all under one `moduleId: 'rhaap'`. These concerns belong to different domains and should be independently deployable.

Per the Content Experience Architecture §2.2, the target is one workspace per experience:

| New module                                 | Workspace                               | Owns                                                                       |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| `catalog-backend-module-aap`               | `workspaces/aap/plugins/`               | `AAPEntityProvider`, `AAPJobTemplateProvider`, AAP sync routes             |
| `catalog-backend-module-portal-content`    | `workspaces/content/plugins/`           | `PAHCollectionProvider`, `AnsibleGitContentsProvider`, content sync routes |
| `catalog-backend-module-portal-scaffolder` | `workspaces/portal-scaffolder/plugins/` | `EEEntityProvider`, `/ansible/ee*` routes (`pluginId: catalog`)            |

The original package is retained as a deprecated shim during migration.

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

### 2.3 HTTP Routes

| Route Group        | Path(s)                                        | Auth                                                                                   | Target Module                    |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| Health             | `GET /health`                                  | Open                                                                                   | All                              |
| AAP identity sync  | `POST /ansible/sync/from-aap/orgs_users_teams` | Superuser                                                                              | AAP                              |
| AAP templates sync | `POST /ansible/sync/from-aap/job_templates`    | Superuser                                                                              | AAP                              |
| Sync status        | `GET /ansible/sync/status`                     | `catalogEntityRead`                                                                    | Aggregator / shared              |
| PAH content sync   | `POST /ansible/sync/from-aap/content`          | Superuser                                                                              | Content                          |
| SCM content sync   | `POST /ansible/sync/from-scm/content`          | Superuser                                                                              | Content                          |
| EE register        | `POST /ansible/ee`                             | Service credentials only                                                               | Portal-scaffolder catalog module |
| EE delete          | `DELETE /ansible/ee/:name`                     | User or service + catalog entity delete (on behalf of caller); `204` if entity missing | Portal-scaffolder catalog module |
| EE build           | `POST /ansible/ee/build`                       | User + EE view permission                                                              | Portal-scaffolder catalog module |
| Git helpers        | `GET /ansible/git/*`                           | Authenticated + perms                                                                  | Content                          |

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
| Self-service UI                      | EE catalog entities + HTTP routes     | Entity shape + `/ansible/ee/build` URL                                                            |
| 3rd-party factory plugins            | Catalog entity kinds + annotations    | SDK contract (stable entity refs)                                                                 |

---

## 3. What Stays, What Moves

### 3.1 Entity Providers

| Provider                     | Decision                               | Destination                                | Notes                                                               |
| ---------------------------- | -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `AAPEntityProvider`          | **AAP**                                | `catalog-backend-module-aap`               | Identity sync; auth-provider depends on it                          |
| `AAPJobTemplateProvider`     | **AAP**                                | `catalog-backend-module-aap`               | Follows AAP identity                                                |
| `PAHCollectionProvider`      | **Content**                            | `catalog-backend-module-portal-content`    | Uses `syncCollectionsByRepositories`                                |
| `AnsibleGitContentsProvider` | **Content**                            | `catalog-backend-module-portal-content`    | SCM crawl                                                           |
| `EEEntityProvider`           | **Portal-scaffolder (catalog module)** | `catalog-backend-module-portal-scaffolder` | `pluginId: 'catalog'` — not the scaffolder action module (see §4.6) |

### 3.2 HTTP Routes

| Route Group              | Decision                               | Destination                                | URL Stability             |
| ------------------------ | -------------------------------------- | ------------------------------------------ | ------------------------- |
| AAP sync triggers        | **AAP**                                | `catalog-backend-module-aap`               | Same paths                |
| Sync status              | **Shared**                             | Each module registers own                  | Aggregation TBD           |
| PAH content sync         | **Content**                            | `catalog-backend-module-portal-content`    | Same paths                |
| SCM content sync         | **Content**                            | `catalog-backend-module-portal-content`    | Same paths                |
| EE register/delete/build | **Portal-scaffolder (catalog module)** | `catalog-backend-module-portal-scaffolder` | Same `/api/catalog` paths |
| Git helpers              | **Content**                            | `catalog-backend-module-portal-content`    | Same paths                |

### 3.3 Shared Infrastructure

| Component          | Decision                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `config.ts`        | Per-module copy; each module reads only its config keys                     |
| `SyncStateTracker` | Duplicated or extracted to common; `/ansible/sync/status` needs aggregation |
| `entityParser.ts`  | AAP parsing stays in AAP module; content parsing moves to content module    |
| Backstage signals  | Each module registers its own refresh signals                               |

### 3.4 Permissions

| Permission                            | Post-Split Owner                 |
| ------------------------------------- | -------------------------------- |
| `catalogEntityReadPermission`         | Shared (Backstage core)          |
| `executionEnvironmentsViewPermission` | Portal-scaffolder catalog module |
| `gitRepositoriesViewPermission`       | Content module                   |
| `collectionsViewPermission`           | Content module                   |
| `templatesViewPermission`             | Self-service UI                  |

---

## 4. Design Decisions

### 4.1 Minimal split preserves operator experience

The split creates 2-3 independently deployable modules instead of one. Operators who need only AAP identity sync can load `catalog-backend-module-aap` alone. Operators who need content browsing add `catalog-backend-module-portal-content`.

### 4.2 URL paths stay stable

All HTTP routes keep their current paths. The module serving the route changes, but the URL contract is preserved. RHDH `dynamic-plugins.yaml` changes from one entry to multiple.

### 4.3 Entity refs stay stable

Entity references (`user:default/alice`, `template:default/my-job`, etc.) are unchanged. The provider producing them changes, but downstream consumers see no difference.

### 4.4 Sync status aggregation

If providers split across modules, `/ansible/sync/status` must aggregate results. Options:

1. Each module exposes its own status endpoint, UI aggregates
2. A thin aggregator route queries all modules (complex)
3. Status moves to a shared backend service

**Decision:** Option 1 — each module owns its status; self-service UI aggregates.

**Route strategy:** Each module registers a status endpoint under a module-specific path:

- `catalog-backend-module-aap` → `GET /ansible/sync/status/aap`
- `catalog-backend-module-portal-content` → `GET /ansible/sync/status/content`

The deprecated shim retains `GET /ansible/sync/status` (original path) for backward compatibility. The self-service UI calls each module's endpoint and aggregates client-side.

### 4.5 PAHCollectionProvider transition

`PAHCollectionProvider` calls `syncCollectionsByRepositories` from `IAAPService`. When the AAP integration split removes this method from the published interface, the provider must either:

- Import from the backward-compatibility shim until the content workspace claims it
- Move to a content-owned service contract

**Current call contract (must be preserved):**

```typescript
// PAHCollectionProvider.ts:231-258
syncCollectionsByRepositories(
  [this.pahRepositoryName], // repository selection (single repo)
  100, // limit per request
  signal, // AbortSignal for cancellation
): Promise<Collection[]> // result shape from AAPClient
```

The content-owned service must preserve: repository selection, pagination limit, cancellation signal support, and `Promise<Collection[]>` result shape.

**Decision:** During Phase 1, `PAHCollectionProvider` stays in the deprecated shim package (original `catalog-backend-module-rhaap`) and imports from `backstage-rhaap-common`. Operators loading the shim get PAH sync automatically. Operators loading the new split modules (`catalog-backend-module-aap` + `catalog-backend-module-portal-content`) get PAH sync from the content module. The shim and content module must not be loaded simultaneously to avoid duplicate providers.

In Phase 3, the content workspace owns the provider and the underlying service contract; the shim is removed.

### 4.6 EE surface: team ownership vs Backstage plugin attachment

Portal-scaffolder owns EE definition authoring (product concern). Platform-wise, `EEEntityProvider` registers through `catalogProcessingExtensionPoint`, and the EE HTTP router is mounted on the **catalog** backend plugin. Callers discover the catalog service and invoke `/api/catalog/ansible/ee*`. A backend module with `pluginId: 'scaffolder'` cannot register the provider or preserve those URLs (its router lives under `/api/scaffolder`).

**Proposed module identity** (to align with the scaffolder split guide in [#911](https://github.com/ansible/ansible-backstage-plugins/pull/911)):

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Package    | `catalog-backend-module-portal-scaffolder` (final name TBD with #911) |
| Workspace  | `workspaces/portal-scaffolder/plugins/`                               |
| Backstage  | `pluginId: 'catalog'`, `moduleId: 'portal-scaffolder'`                |
| Scaffolder | `portal-scaffolder-backend-module` keeps actions only (`ansible:*`)   |

**Routes and auth preserved on move:**

| Route                      | Auth / behavior                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /ansible/ee`         | Service credentials only (scaffolder → catalog)                                                                                                        |
| `DELETE /ansible/ee/:name` | User or service; catalog lookup + `catalogEntityDeletePermission` for caller; `204` when entity ref not found (before delete auth on missing resource) |
| `POST /ansible/ee/build`   | User/external access + `executionEnvironmentsViewPermission` + catalog read                                                                            |

`createEEDefinition` calls `DELETE` before re-registering the same EE name; extraction must keep this cleanup path or recreate flows can leave conflicting catalog entities.

---

## 5. Phases

### Phase 0 — Contract Inventory

| Item                                                  | Status |
| ----------------------------------------------------- | ------ |
| Document all entity provider outputs (kinds, refs)    | ✅     |
| Document all HTTP routes with auth requirements       | ✅     |
| Map downstream consumers to entity/route dependencies | ✅     |
| Identify sync status aggregation requirements         | ✅     |

### Phase 1 — Split the Backend Module

| Item                                                                       | Notes                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Create `workspaces/aap/plugins/catalog-backend-module-aap/`                | AAP providers + sync routes. `moduleId: 'aap'`                                                               |
| Create `workspaces/content/plugins/catalog-backend-module-portal-content/` | Content providers + routes. `moduleId: 'portal-content'`                                                     |
| Extract EE provider + routes to `catalog-backend-module-portal-scaffolder` | `pluginId: 'catalog'`; coordinate with [#911](https://github.com/ansible/ansible-backstage-plugins/pull/911) |
| Split `config.d.ts` per module                                             | AAP owns AAP keys; content owns content keys                                                                 |
| Deprecate original package                                                 | Retained as shim with deprecation warning                                                                    |

**Verification:** All catalog tests pass; entity sync works end-to-end in dev app. EE acceptance: create EE via scaffolder action → `DELETE /ansible/ee/:name` cleanup → re-register with same name (covers `createEEDefinition` recreate flow and `204` on missing entity).

### Phase 2 — URL Compatibility Layer

| Item                                               | Notes                                 |
| -------------------------------------------------- | ------------------------------------- |
| Verify all routes work with split modules          | Same paths, different backing modules |
| Update RHDH `dynamic-plugins.yaml` examples        | Multiple plugin entries               |
| Document operator migration from monolith to split | Changelog entry                       |

### Phase 3 — Content Workspace Independence

| Item                                               | Notes                       |
| -------------------------------------------------- | --------------------------- |
| `PAHCollectionProvider` uses content-owned service | Drop AAP service dependency |
| Git content provider fully independent             | No AAP imports              |
| Content module has zero AAP workspace imports      | Clean boundary              |

---

## 6. Contracts

| Consumer                | Contract                                                    | Provided by                      |
| ----------------------- | ----------------------------------------------------------- | -------------------------------- |
| Auth provider           | Catalog `User` entities with stable refs                    | AAP catalog module               |
| Scaffolder autocomplete | Catalog entity query API unchanged                          | Backstage catalog core           |
| Self-service UI         | EE entity shape + `/api/catalog/ansible/ee*` URLs unchanged | Portal-scaffolder catalog module |
| Operators               | Multiple dynamic plugin entries instead of one              | Updated `dynamic-plugins.yaml`   |

**Semver:** Internal split — minor bump on new packages; major bump on deprecated shim with breaking removal timeline.

---

## 7. Operator Impact

| Area                        | Before (Today)                      | After (Proposed)                                                                                 |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dynamic-plugins.yaml`      | One `catalog-backend-module-rhaap`  | 2-3 catalog entries (aap, content, portal-scaffolder EE) plus scaffolder action module from #911 |
| Config keys                 | All under `catalog.providers.rhaap` | Split per module                                                                                 |
| Sync URLs                   | All on catalog backend              | Same paths, different modules                                                                    |
| Minimal AAP-only deployment | Load full module, ignore content    | Load only `catalog-backend-module-aap`                                                           |

**Migration:** Operators update `dynamic-plugins.yaml` to replace the single entry with the split modules they need.

**Configuration migration (no automatic mapping):**

The monolithic `catalog.providers.rhaap` configuration is not automatically migrated to the split modules. Operators must manually update their `app-config.yaml` before enabling the split modules:

| Old Key (Monolithic)                              | New Key (Split)                                     | Target Module                           |
| ------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `catalog.providers.rhaap.sync.orgsUsersTeams`     | `catalog.providers.aap.sync.orgsUsersTeams`         | `catalog-backend-module-aap`            |
| `catalog.providers.rhaap.sync.jobTemplates`       | `catalog.providers.aap.sync.jobTemplates`           | `catalog-backend-module-aap`            |
| `catalog.providers.rhaap.sync.pahCollections`     | `catalog.providers.content.sync.pahCollections`     | `catalog-backend-module-portal-content` |
| `catalog.providers.rhaap.sync.ansibleGitContents` | `catalog.providers.content.sync.ansibleGitContents` | `catalog-backend-module-portal-content` |

EE provider configuration (if any) moves to `catalog-backend-module-portal-scaffolder`. The deprecated shim continues reading the original `catalog.providers.rhaap` keys for backward compatibility during the migration period.

**Operator action required:** Before enabling split modules, operators must:

1. Copy relevant configuration sections to the new keys
2. Update `dynamic-plugins.yaml` to load the desired split modules
3. Remove the deprecated shim only after verifying the new modules work correctly

---

## 8. Open Questions

| Question                                                           | Status                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Should sync status be aggregated server-side or client-side?       | ✅ Resolved — client-side (see §4.4)                         |
| Should `PAHCollectionProvider` stay in catalog or move to content? | ✅ Resolved — shim in Phase 1, content in Phase 3 (see §4.5) |
| What is the minimal dynamic plugin set for AAP-only identity sync? | Open — decide in Phase 1                                     |
| Should Git helpers move to content or stay with catalog?           | Open — decide in Phase 1                                     |

---

## 9. Source File Map

| Concern                             | Current Path                                                           | Target                                                    |
| ----------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| AAP providers                       | `catalog-backend-module-rhaap/src/providers/AAP*.ts`                   | `catalog-backend-module-aap/src/providers/`               |
| Content providers                   | `catalog-backend-module-rhaap/src/providers/PAH*.ts`, `AnsibleGit*.ts` | `catalog-backend-module-portal-content/src/providers/`    |
| EE provider                         | `catalog-backend-module-rhaap/src/providers/EE*.ts`                    | `catalog-backend-module-portal-scaffolder/src/providers/` |
| AAP sync routes                     | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-aap/src/router.ts`                |
| Content sync routes                 | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-portal-content/src/router.ts`     |
| EE routes (register, delete, build) | `catalog-backend-module-rhaap/src/router.ts` (partial)                 | `catalog-backend-module-portal-scaffolder/src/router.ts`  |
| Config                              | `catalog-backend-module-rhaap/config.d.ts`                             | Split per module                                          |
| Module registration                 | `catalog-backend-module-rhaap/src/module.ts`                           | Split per module                                          |

---

## 10. Alignment with Sibling Efforts

| Related Effort          | Relevance                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AAP integration split   | Defines `IAAPService` boundary; catalog uses it via `ansibleServiceRef`                                                                  |
| Scaffolder split (#911) | Actions in `portal-scaffolder-backend-module`; EE provider + `/ansible/ee*` in catalog module `catalog-backend-module-portal-scaffolder` |
| Content workspace       | PAH and Git providers eventually move here                                                                                               |
| Portal core             | ContributionRegistry; no direct catalog dependency                                                                                       |

---

## 11. References

| Document                             | Description                                       |
| ------------------------------------ | ------------------------------------------------- |
| Content Experience Architecture      | Target architecture (§7.3–7.4 catalog boundaries) |
| AAP Integration Implementation Guide | AAP workspace split — keep/leave tables           |
| Scaffolder Implementation Guide      | Scaffolder action split                           |
| `docs/plugins/catalog.md`            | Official operator catalog documentation           |
