# Catalog Module Research — `catalog-backend-module-rhaap`

> **Canonical architecture:** [Content Experience Architecture](https://github.com/cidrblock/ansible-rhdh-plugins/blob/8ff93cac90c25e109d6b007c0b53252d7b79b30e/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (§2.2 workspace layout, §2.5 dependency rules, §7.3–7.4 AAP provider/keep-leave boundaries)
> (upstream mirror: [ansible/ansible-rhdh-plugins](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md))
> **Related Jira:** [AAP-95785](https://redhat.atlassian.net/browse/AAP-95785) (this spike — catalog module research), [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) (AAP integration split), [AAP-95782](https://redhat.atlassian.net/browse/AAP-95782) (scaffolder split), [AAP-95616](https://redhat.atlassian.net/browse/AAP-95616) (Research Spikes Epic)
> **Initiative:** [ANSTRAT-2497](https://redhat.atlassian.net/browse/ANSTRAT-2497) — Portal Plugin Factory (Guide & SDK)
> **Companion docs (under `docs/next/`):** [AAP integration implementation guide](https://github.com/ansible/ansible-backstage-plugins/blob/docs/aap-95802-implementation-guide/docs/next/aap-integration-implementation-guide.md) (AAP-95802), [Scaffolder implementation guide](https://github.com/ansible/ansible-backstage-plugins/pull/801) (PR 801)
> **Status:** Architecture baseline complete — gap analysis vs target in progress
> **Branch baseline:** `main` in `ansible-backstage-plugins`
>
> This document is the catalog-side companion to the AAP integration
> implementation guide (AAP-95802). It describes the current
> `catalog-backend-module-rhaap` architecture, maps each provider and
> route group to the target workspace boundaries defined by the canonical
> architecture, and produces a split decision record for implementation.

---

## 1. What This Spike Owns

From the canonical architecture (§7.3–7.4) and [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) (which explicitly defers
physical catalog split to **AAP-95785**), this spike owns:

1. **Architecture inventory** — Document every entity provider, HTTP route, permission
   registration, and shared infrastructure in the current monolith module.

2. **Gap analysis** — Compare the as-is module against the target workspace layout
   (CEA §7.3–7.4) and the AAP-95802 keep/leave boundaries. Record alignment, moves,
   splits, and ambiguities.

3. **Module-split decision record** — Recommend the smallest catalog module split
   (monolith vs identity/content/operations) that preserves entity refs, operator URLs,
   autocomplete behaviour, and integration tests.

4. **EE + router ownership recommendation** — Joint decision with AAP-95782: should
   `EEEntityProvider` + `/ansible/ee*` stay in catalog or move to a self-service backend
   module? URL compatibility plan.

5. **Cross-module dependency map** — How `auth-backend-module-rhaap-provider`,
   scaffolder autocomplete, and self-service UI depend on catalog entities and APIs.

6. **SDK obligations draft** — What 3rd-party plugins need to know if they add their own
   `EntityProvider` to the catalog (extension points, config schema, RBAC patterns).

**What this spike does NOT own (explicitly deferred):**

- Implementing the module split or moving providers (separate implementation tickets)
- Common library (`rhaap-common`) decomposition → AAP-95802
- Scaffolder action split → AAP-95782
- Content workspace (PAH, OCI adapters) → ANSTRAT-1758
- Repo rename to `automation-portal-plugins` → ANSTRAT-2497 Phase 7
- Production changes in `ansible-rhdh-templates`

---

## 2. Current Baseline (What Ships Today)

### 2.1 Module identity

**Package:** `@ansible/backstage-plugin-catalog-backend-module-rhaap`
**Backstage role:** `backend-plugin-module` (`pluginId: catalog`, `moduleId: rhaap`)

A single Backstage catalog backend module that today owns **two concerns**:

| Concern | Responsibility |
|---------|----------------|
| **Entity providers** | Scheduled or triggered ingestion of AAP identity, job templates, PAH collections, Git-hosted Ansible content, and execution environments into the Backstage catalog |
| **HTTP router** | On-demand sync triggers, EE lifecycle (register/delete/build), Git file/CI helpers, sync status |

**Shared dependency:** `@ansible/backstage-rhaap-common` (embedded via `export-dynamic`) —
provides `ansibleServiceRef` / `IAAPService`, SCM helpers, permissions.

### 2.2 Entity providers

All providers implement Backstage `EntityProvider` and are registered in `src/module.ts`.

| Provider | Config key | Source | Catalog output | Schedule |
|----------|------------|--------|----------------|----------|
| `AAPEntityProvider` | `sync.orgsUsersTeams` | AAP Controller via `IAAPService` | `User`, `Group` (org/team), `aap-admins` | Per env under `catalog.providers.rhaap.<id>` |
| `AAPJobTemplateProvider` | `sync.jobTemplates` | AAP job templates + surveys | `Template` entities | Same; can `enabled: false` |
| `PAHCollectionProvider` | `sync.pahCollections` | PAH via ansible service | Collection entities | Per repository + optional schedule |
| `AnsibleGitContentsProvider` | `sync.ansibleGitContents` | GitHub/GitLab crawl | Repos + collections from `galaxy.yml` | Per org or default schedule |
| `EEEntityProvider` | *(on-demand)* | `POST /ansible/ee` | `Component` (`execution-environment`) | N/A (delta mutations only) |

**Shared infrastructure:**

| Component | Role |
|-----------|------|
| `src/providers/config.ts` | Centralized config reading (`readAapApiEntityConfigs`, `readAnsibleGitContentsConfigs`) |
| `SyncStateTracker` | Per-provider last-sync time, in-progress, failure metadata |
| Backstage **signals** | Refresh UX on sync completion (org/user/team, job templates) |
| `entityParser.ts` | AAP → catalog entity shape transforms |
| `providers/ansible-collections/` | SCM crawl implementation (GitHub/GitLab) |

### 2.3 HTTP route groups

Routes are mounted on the **catalog** backend plugin HTTP router. In dev, base is `/api/catalog`.

| Group | Routes | Auth | Notes |
|-------|--------|------|-------|
| **Health** | `GET /health` | Open | Liveness |
| **AAP identity/templates sync** | `POST /ansible/sync/from-aap/orgs_users_teams`, `POST .../job_templates` | Superuser | Trigger scheduled providers |
| **Sync status** | `GET /ansible/sync/status` | Catalog read | Query params: `aap_entities`, `ansible_contents` |
| **PAH content sync** | `POST /ansible/sync/from-aap/content` | Superuser | PAH collection sync; optional `filters[].repository_name` |
| **SCM content sync** | `POST /ansible/sync/from-scm/content` | Superuser | Trigger git content providers |
| **Execution environments** | `POST /ansible/ee`, `DELETE /ansible/ee/:name`, `POST /ansible/ee/build` | Permission-gated + external access | EE lifecycle; **AAP-95782** boundary |
| **Git helpers** | `GET /ansible/git/file-content`, `POST /ansible/git/ci-activity` | Permission-gated | SCM file fetch, CI activity |
| **Legacy admin** | `POST /aap/create_user` | Admin | AAP user provisioning |

**Migration note:** Legacy `/aap/sync_*` paths have been removed — operators must use `/ansible/sync/from-aap/...`.

### 2.4 Permissions

Registered in `module.ts` via `ansiblePermissions` (from `rhaap-common`):

| Permission | Used by |
|------------|---------|
| `catalogEntityReadPermission` | Sync status endpoint |
| `executionEnvironmentsViewPermission` | EE routes |
| `gitRepositoriesViewPermission` | Git routes |
| `collectionsViewPermission` | PAH / collections |
| `templatesViewPermission` | Templates (implicit via catalog) |

Router middleware helpers: `createRequireSuperuserMiddleware`, `createRequireUserOrExternalAccessMiddleware`, `createPermissionCheckMiddleware`.

### 2.5 Downstream consumers

| Consumer | Depends on |
|----------|------------|
| `auth-backend-module-rhaap-provider` | Catalog `User` entities from AAP sync |
| Scaffolder / `portal-scaffolder` | `Template`, collection, repo, EE entities; autocomplete via `aap-api-cloud` reads collections from catalog |
| Self-service UI | EE catalog entities + `/ansible/ee*` HTTP API |
| 3rd-party factory plugins (ANSTRAT-2497) | Catalog entity kinds + annotations (SDK contract) |

---

## 3. Target Architecture (Gap vs CEA + AAP-95802)

The canonical architecture and AAP-95802 implementation guide already define where
catalog providers should land after the split.

**AAP-95802 §2.3 target mapping (source of truth):**

| Provider | Target after split |
|----------|--------------------|
| `AAPEntityProvider` | **AAP** → `catalog-backend-module-aap` |
| `AAPJobTemplateProvider` | **AAP** → `catalog-backend-module-aap` |
| `EEEntityProvider` | **Self-service** → `scaffolder-backend-module-self-service` |
| `PAHCollectionProvider` | **Content** → ANSTRAT-1758 |
| `AnsibleGitContentsProvider` | **Content** → ANSTRAT-1758 |

### 3.1 Provider gap analysis

| Provider | As-is | Target (CEA / AAP-95802) | Gap status | Stable entity refs / consumers | Notes |
|----------|-------|---------------------------|------------|--------------------------------|-------|
| `AAPEntityProvider` | `catalog-backend-module-rhaap` | `catalog-backend-module-aap` (AAP workspace) | | `auth-backend-module-rhaap-provider`, catalog Users/Groups | |
| `AAPJobTemplateProvider` | same | `catalog-backend-module-aap` | | Scaffolder templates, `Template` entities | |
| `PAHCollectionProvider` | same | Content workspace (ANSTRAT-1758) | | Collections UI, scaffolder autocomplete | |
| `AnsibleGitContentsProvider` | same | Content workspace (ANSTRAT-1758) | | Git repos/collections in catalog | |
| `EEEntityProvider` | same | `scaffolder-backend-module-self-service` | | Self-service EE UI; coordinate with **AAP-95782** | URL + entity contract |

### 3.2 HTTP route gap analysis

| Route group | As-is host | Target host | Gap status | Must keep URL? | Notes |
|-------------|-----------|-------------|------------|----------------|-------|
| Health (`/health`) | catalog | | | | |
| AAP sync (`/ansible/sync/from-aap/orgs_users_teams`, `.../job_templates`) | catalog | | | | Superuser; follows AAP providers |
| Sync status (`/ansible/sync/status`) | catalog | | | | Aggregates across providers |
| PAH content sync (`/ansible/sync/from-aap/content`) | catalog | | | | Follows PAH provider |
| SCM content sync (`/ansible/sync/from-scm/content`) | catalog | | | | Follows Git provider |
| EE lifecycle (`/ansible/ee`, `.../ee/:name`, `.../ee/build`) | catalog | | | | **AAP-95782** boundary |
| Git helpers (`/ansible/git/file-content`, `.../ci-activity`) | catalog | | | | Content / SCM? |
| Legacy admin (`/aap/create_user`) | catalog | | | | Admin flow |

### 3.3 Shared infrastructure (if split)

| Component | As-is | Target | Gap status | Notes |
|-----------|-------|--------|------------|-------|
| `src/providers/config.ts` | Shared across all providers | | | Per-module copy vs shared lib? |
| `SyncStateTracker` | Shared | | | `/ansible/sync/status` aggregation if providers split across modules |
| Backstage **signals** | `module.ts` init | | | |
| `entityParser.ts` | AAP + PAH parsing paths | | | |

### 3.4 RBAC & permissions

| Permission | As-is | Target package | Gap status | Notes |
|------------|-------|----------------|------------|-------|
| `ansiblePermissions` (registered in `module.ts`) | catalog module | | | SDK stable IDs for 3rd-party? |
| `catalogEntityReadPermission` | router middleware | | | |
| `executionEnvironmentsViewPermission` | EE routes | | | |
| `gitRepositoriesViewPermission` | Git routes | | | |
| `collectionsViewPermission` | PAH / collections | | | |
| Superuser middleware (sync POSTs) | router | | | |

### 3.5 Configuration impact

| Config area | As-is owner | Target owner | Gap status | Notes |
|-------------|-------------|--------------|------------|-------|
| `sync.orgsUsersTeams` | this module | | | |
| `sync.jobTemplates` | this module | | | |
| `sync.pahCollections` | this module | | | |
| `sync.ansibleGitContents` | this module | | | |
| Multi-env keys (`catalog.providers.rhaap.<id>`) | this module | | | Operator `dynamic-plugins.yaml` migration |

### 3.6 Conflicts and exceptions

*Record any place CEA §7.3–7.4 and AAP-95802 disagree, or where this spike recommends a delta.*

| # | Topic | CEA says | AAP-95802 says | Proposed resolution | Needs approval? |
|---|-------|----------|----------------|---------------------|-----------------|
| 1 | | | | | |
| 2 | | | | | |

---

## 4. Decision Record (Conclusions)

*Fill after §3 gap analysis is complete.*

| Question | Recommendation |
|----------|----------------|
| **Smallest split** (monolith vs N modules) | |
| What **stays** in AAP-aligned catalog module | |
| What **moves** to content / self-service | |
| **EE + `/ansible/ee*`** recommendation (with AAP-95782) | |
| **URL compatibility** plan for operators | |
| **`dynamic-plugins.yaml`** delta (high level) | |
| **Sync status aggregation** if providers split across modules | |

---

## 5. Cross-Module Dependency Map

| Consumer | Uses from catalog module | As-is contract | Still valid after split? | Notes |
|----------|--------------------------|----------------|--------------------------|-------|
| `auth-backend-module-rhaap-provider` | Catalog `User` entities from AAP sync | Entity kind + annotations | | Minimum catalog module required at login |
| Scaffolder autocomplete (`aap-api-cloud`) | Collections from catalog | Catalog entity query | | Impact if collection providers move? |
| Self-service UI | EE catalog entities + HTTP | Entity shape + API URLs | | |
| 3rd-party factory plugins | Catalog entity kinds + annotations | SDK contract (TBD) | | ANSTRAT-2497 |

---

## 6. SDK Obligations (for 3rd-Party Catalog Providers)

*How should 3rd-party plugins add catalog entity providers under the Plugin Factory?*

| Area | Current pattern | Recommended SDK guidance |
|------|-----------------|--------------------------|
| Extension point | `catalogProcessingExtensionPoint` | |
| Config schema | `config.d.ts` per module | |
| RBAC | Register via `permissionsRegistry` | |
| Sync status | `SyncStateTracker` pattern | |
| Entity naming | `sanitizeAapName` utilities from common | |
| Dynamic plugin packaging | `export-dynamic` + embed common | |

---

## 7. Operator Impact

*What changes for operators after a catalog module split?*

| Area | Before (today) | After (proposed) | Migration notes |
|------|----------------|------------------|-----------------|
| `dynamic-plugins.yaml` entry | One catalog module | | |
| Config keys | All under `catalog.providers.rhaap` | | |
| Sync URLs | All on catalog backend | | |
| EE URLs | On catalog backend | | |

---

## 8. Open Research Questions

1. What is the **smallest module split** that preserves entity refs, autocomplete behaviour, and existing integration tests?
2. Which **HTTP routes** must remain stable for operators and external automation (sync + EE)?
3. Should **PAH and Git content providers** be classified as factory "content" plugins separate from AAP identity sync?
4. How should **`ansiblePermissions`** and catalog permission checks evolve for documented host APIs?
5. What **dynamic plugin packaging** do EAP / `automation-portal-local` consumers need after a split?
6. Can catalog sync be **split into multiple dynamic plugins** without duplicate `ansibleServiceRef` registration?
7. What is the **minimal** dynamic plugin set for EAP welcome pack (catalog-only identity vs full content sync)?

---

## 9. References

| Link | Description |
|------|-------------|
| [AAP-95785](https://redhat.atlassian.net/browse/AAP-95785) | This spike |
| [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) | AAP integration implementation guide (companion) |
| [AAP-95782](https://redhat.atlassian.net/browse/AAP-95782) | Scaffolder / EE placement sibling spike |
| [AAP-95778](https://redhat.atlassian.net/browse/AAP-95778) | ContributionRegistry / NFS federation POC |
| [AAP-95616](https://redhat.atlassian.net/browse/AAP-95616) | Research Spikes epic |
| [ANSTRAT-2497](https://redhat.atlassian.net/browse/ANSTRAT-2497) | Portal Plugin Factory initiative |
| [Content Experience Architecture](https://github.com/cidrblock/ansible-rhdh-plugins/blob/8ff93cac90c25e109d6b007c0b53252d7b79b30e/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) | Canonical target architecture (§7.3–7.4 catalog boundaries) |
| [AAP Integration Implementation Guide](https://github.com/ansible/ansible-backstage-plugins/blob/docs/aap-95802-implementation-guide/docs/next/aap-integration-implementation-guide.md) | AAP workspace split — keep/leave tables |
| [PR #801](https://github.com/ansible/ansible-backstage-plugins/pull/801) | Scaffolder `docs/next/` implementation guide |
| `docs/plugins/catalog.md` | Official operator catalog doc |
| `docs/diagrams/architecture/repo-plugin-map.mmd` | Repo plugin map |
