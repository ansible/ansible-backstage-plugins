# AAP Integration Re-Architecture — Implementation Guide

> **Canonical architecture:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (§2.2 workspace layout, §2.5 dependency rules, §7.3–7.4 AAP provider/keep-leave boundaries)
> **Related work items:** AAP-95802 (this spike — AAP integration research), AAP-95782 (scaffolder split), AAP-95785 (catalog split), AAP-95616 (Research Spikes Epic)
> **Companion docs (under `docs/next/`):** [Portal implementation guide](../../docs/next/portal-plugin-factory-implementation-guide.md), [Scaffolder implementation guide](https://github.com/ansible/ansible-backstage-plugins/pull/801) (PR 801)
> **Related PRs:** [PR #744](https://github.com/ansible/ansible-backstage-plugins/pull/744) (RHDH 2.1 NFS migration + `rhaap-app-auth`), [PR #801](https://github.com/ansible/ansible-backstage-plugins/pull/801) (scaffolder implementation guide)
> **Status:** Research complete — 4-package layer split recommended
> **Branch baseline:** `main` at `48cb832e` (2026-10-19)
>
> This document is the implementation guide for splitting the current AAP
> (Ansible Automation Platform) integration packages into the target
> `workspaces/aap/` layout defined by the canonical architecture. It describes
> what this effort owns, what exists today, what moves where, the ordered
> work packages, and the contracts with sibling spikes.

---

## 1. What This Effort Owns

From the canonical architecture (§7.1), **AAP integration** owns Controller automation,
identity sync, OAuth authentication, and scaffolder actions that touch AAP REST APIs.

This spike and its follow-on implementation deliver:

1. **`aap-common`** — Wire types (DTOs), AAP-specific permissions, name formatting
   utilities, safe constants. No Node.js APIs, no React, no HTTP client.

2. **`aap-node`** — `IAAPService` interface and
   `ansibleServiceRef` (Backstage service reference). Backend modules depend on this
   to interact with AAP — never on the concrete client. During the transition,
   `IAAPService` retains all 37 methods (including 2 PAH methods) until the content
   workspace provides its own service contract; see §4.2 for details.

3. **`aap-backend`** — `AAPClient` implementation, service factory, AAP-only HTTP
   helpers. The only package that makes outbound REST calls to AAP Controller.

4. **`aap`** — Frontend plugin providing the `/ansible` landing page, overview,
   catalog, learn, and create content sections. Renamed from today's
   `@ansible/plugin-backstage-rhaap`.

5. **Boundary definitions for AAP catalog and scaffolder modules** — Which providers
   and actions belong to the AAP workspace versus content or self-service. Implementation
   of those splits is owned by sibling spikes AAP-95785 (catalog) and AAP-95782
   (scaffolder).

6. **`rhaap-app-auth` / `aap-app-auth`** — Separate `FrontendModule` for RHDH 2.1 NFS
   sign-in (from PR 744). Must keep `pluginId: 'app'` due to Backstage `SignInPageBlueprint`
   constraint.

**What this effort does NOT own:**

- Content management (PAH collections, git repository browsing, OCI adapters) → content workspace effort
- Self-service UI, scaffolder field extensions, EE definition catalog → portal SDK / portal-scaffolder effort
- Portal SDK (`portal-extension-common`, `portal-extension-api`, `portal-plugin-sdk`) → portal SDK effort
- Physically splitting the catalog module into AAP + content providers → AAP-95785
- Physically splitting the scaffolder module into AAP + self-service actions → AAP-95782
- Repo rename to `automation-portal-plugins` and `workspaces/` physical move → portal SDK effort (Phase 7)

---

## 2. Current Baseline (What Ships Today)

### 2.1 Common library — `@ansible/backstage-rhaap-common`

Single `common-library` package that bundles **everything shared** across all plugins.
This is the core problem — it mixes AAP concerns with content concerns, frontend-safe
types with backend-only implementations, and interface contracts with concrete clients.

**Barrel exports** (`src/index.ts`):

| Re-export                | Contents                                                                                                                                                                                                                                                                        | Architecture bucket                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `./AAPClient`            | `AAPClient` class, `IAAPService` interface, `mockData` (test fixtures), config readers (`getAnsibleConfig`, `getCatalogConfig`)                                                                                                                                                 | `aap-backend` (class + config readers) / `aap-node` (interface)                          |
| `./AAPService`           | `ansibleServiceRef` + `createServiceFactory`                                                                                                                                                                                                                                    | `aap-node`                                                                               |
| `./interfaces`           | `IJobTemplate`, `Collection`, `ISurvey`, `InstanceGroup`, `AAPTemplate`                                                                                                                                                                                                         | `aap-common` (AAP types); `Collection` → content                                         |
| `./types`                | ~30 DTOs: `Organization`, `Project`, `JobTemplate`, `ExecutionEnvironment`, `LaunchJobTemplate`, `CleanUp`, `User`, `Team`, config types, `TokenResponse`, etc.                                                                                                                 | `aap-common` (AAP DTOs); `Collections` type → content                                    |
| `./constants`            | `TERMINAL_JOB_STATUSES`, `SCM_INTEGRATION_AUTH_FAILED_CODE`, verbosity helpers, `compareVersions`                                                                                                                                                                               | `aap-common` (job constants); SCM constant → content                                     |
| `./ScmClient`            | `ScmClient` interface, `BaseScmClient`, `GithubClient`, `GitlabClient`, `ScmClientFactory`, `createGithubClientForWorkflowDispatch`, `resolveGithubToken`, SCM types                                                                                                            | **Out of AAP** → content workspace                                                       |
| `./permissions`          | 5 `BasicPermission` exports (EE, git-repos, collections, templates, history), `ansiblePermissions` array, `RESOURCE_TYPE_ANSIBLE_SETTINGS`, `ANSIBLE_SETTINGS_CAPABILITIES`, `AnsibleSettingsCapability` type, `ansibleSettingsViewPermission`, `ansibleSettingsEditPermission` | `aap-common` (templates, history); settings perms → portal-core; others leave eventually |
| `./utils/nameFormatting` | `sanitizeAapName`, `sanitizeAapUsername`, `toOrgEntityName`, `toTeamEntityName`, `toTemplateEntityName`, `toWorkflowEntityName`, `toUserEntityName`, `toUserEntityRef`, `toSourceNamespace`, `toOrgGroupRef`, `toTeamGroupRef`, `CatalogEntityIdentityOptions`, etc.            | `aap-common`                                                                             |
| `./UserProvisioner`      | `userProvisionerRef` (root-scoped service ref), `IUserProvisioner` interface, `IUserProvisionerConnectable` wiring interface, `UserProvisioner` class                                                                                                                           | `aap-node` (service ref + interfaces + default implementation)                           |

**Additional subpath exports** (via `package.json` `"exports"` map, not the barrel):

| Subpath                       | Contents                                                                                          | Architecture bucket                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `./constants`                 | `TERMINAL_JOB_STATUSES`, `SCM_INTEGRATION_AUTH_FAILED_CODE`, `compareVersions`, verbosity helpers | `aap-common` (AAP); SCM const → content          |
| `./permissions`               | All permission objects + settings permissions + `ansiblePermissions` array                        | `aap-common` (AAP perms); settings → portal-core |
| `./permissionRules`           | `AnsibleSettingsResource`, `AnsibleSettingsFilter`, permission rule + resource ref for settings   | Portal-core                                      |
| `./gitRepositoriesCatalog`    | `GitRepositoriesCatalogApi` interface, `gitRepositoriesCatalogApiRef`, default no-op factory      | Content / self-service boundary                  |
| `./gitRepositoriesExtensions` | Host/guest extension contracts for Git Repositories surfaces (tabs, slots)                        | Content / self-service boundary                  |
| `./devSpaces`                 | Dev Spaces configuration types and helpers                                                        | Self-service                                     |
| `./catalogEntity`             | Catalog entity annotation helpers                                                                 | Shared — stays on shim                           |

**Key problems:**

- `AAPClient` class is in the same package as types consumed by frontend plugins
- `ScmClient` (GitHub/GitLab) has nothing to do with AAP Controller
- PAH helper methods (`isValidPAHRepository`, `syncCollectionsByRepositories`, `pahHelpers.ts`) are on `AAPClient` but belong to content
- `IAAPService` interface includes PAH methods (`isValidPAHRepository`, `syncCollectionsByRepositories`) that must be stripped
- `Collection` interface/type crosses the content boundary
- 5 permissions are registered together, but only `templates.view` and `history.view` are purely AAP

**Consumers today** (all use `@ansible/backstage-rhaap-common` via `workspace:^`):

| Consumer                                             | What it imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-backend-module-rhaap`                       | `ansibleServiceRef`, `IAAPService`, `ansiblePermissions`, individual permission objects, `ScmClientFactory`, `SCM_INTEGRATION_AUTH_FAILED_CODE`, `GitlabClient`, `resolveGithubToken`, `createGithubClientForWorkflowDispatch`, `resolveActiveOrganizations`, types (`Organization`, `User`, `Team`, `RoleAssignments`, `IJobTemplate`, `ISurvey`, `InstanceGroup`, `Collection`, `CatalogEntityIdentityOptions`), name utilities (`sanitizeAapName`, `toOrgEntityName`, `toTeamEntityName`, `toUserEntityRef`, `toOrgGroupRef`, `toTeamGroupRef`, `toSourceNamespace`, `DEFAULT_CATALOG_ENTITY_SOURCE`), `compareVersions` |
| `scaffolder-backend-module-backstage-rhaap`          | `ansibleServiceRef`, `IAAPService`, types (`CleanUp`, `ExecutionEnvironment`, `LaunchJobTemplate`, `Collections`, `SourceVersionDetail`), `TERMINAL_JOB_STATUSES`, `ScmClientFactory`, `getAnsibleConfig`, `getVerbosityLevels`                                                                                                                                                                                                                                                                                                                                                                                             |
| `auth-backend-module-rhaap-provider`                 | `ansibleServiceRef`, `IAAPService`, `userProvisionerRef`, `toUserEntityName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `catalog-backend-module-rhaap-user-provisioner`      | `ansibleServiceRef`, `userProvisionerRef`, `IUserProvisionerConnectable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rhaapOrganizationResolver` (in portal-core backend) | `AAPClient` (direct instantiation), `resolveActiveOrganizations`, `toUserEntityName`, `IAAPService`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**`export-dynamic` flag:** All four AAP backend modules use `--embed-package @ansible/backstage-rhaap-common`. The catalog module additionally embeds `@ansible/portal-plugin-node` and `@ansible/portal-extension-common`.

### 2.2 Frontend — `@ansible/plugin-backstage-rhaap`

Frontend plugin (`backstage.role: frontend-plugin`, `pluginId: ansible`) providing the
`/ansible` landing page with sidebar navigation.

**Components:**

| Component                                      | Purpose                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AnsiblePage`                                  | Routable extension at `/ansible` — tabbed layout (Overview, Catalog, Learn, Create) |
| `AppThemeFixer`                                | Component extension — fixes MUI theme in RHDH context                               |
| `OverviewContent`                              | Landing page: QuickAccessCard, Favourites                                           |
| `CatalogContent`                               | Catalog browsing tab                                                                |
| `LearnContent`                                 | Documentation/learning tab                                                          |
| `CreateContent`                                | Content creation tab                                                                |
| `AnsibleLogo`, `WorkspaceIcon`, `DocumentIcon` | Branding assets                                                                     |
| `RatingFeedbackModal`                          | User feedback dialog                                                                |

**Dependencies on common:** None at runtime — this plugin does not import
`@ansible/backstage-rhaap-common`. It communicates with backend via Backstage
proxy/API routes.

**Dynamic plugin export:** `rhdh-cli plugin export` (in `package.json` scripts).

### 2.3 Backend — `@ansible/backstage-plugin-catalog-backend-module-rhaap`

One `createBackendModule({ pluginId: 'catalog', moduleId: 'rhaap' })` that registers
**all** entity providers, permissions, field validators, and a large HTTP router.

**Entity providers registered in `module.ts`:**

| Provider                     | Data source                              | Target after split                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AAPEntityProvider`          | AAP Controller orgs, teams, users        | **AAP** (`catalog-backend-module-aap`)                                                                                                                                                                                                                                            |
| `AAPJobTemplateProvider`     | AAP Controller job templates + surveys   | **AAP** (`catalog-backend-module-aap`)                                                                                                                                                                                                                                            |
| `EEEntityProvider`           | Push-based from scaffolder (no AAP REST) | **Self-service** (catalog-attached module: `createBackendModule({ pluginId: 'catalog', moduleId: 'self-service-ee' })`; owned by self-service, registered via `catalogProcessingExtensionPoint`; existing EE registration endpoint stays stable — callers do not need to migrate) |
| `PAHCollectionProvider`      | Private Automation Hub collections       | **Content** (stays in `catalog-backend-module-aap` via shim until content workspace claims it; see §4.2 transition contract)                                                                                                                                                      |
| `AnsibleGitContentsProvider` | SCM repositories (GitHub/GitLab)         | **Content** workspace (content extraction effort)                                                                                                                                                                                                                                 |

**Permissions:** Registers all 5 `ansiblePermissions` via `permissionsRegistry.addPermissions()`.

**HTTP router** (`router.ts`, ~1200 lines): Handles sync triggers, CI activity data,
collection/repository CRUD, EE registration, permission-gated endpoints. Routes will
split with providers.

**Dependencies:** `@ansible/backstage-rhaap-common` (workspace), `@backstage/plugin-catalog-node`,
`@backstage/plugin-signals-node`, `express`, `zod`.

### 2.4 Backend — `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`

One `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` that registers
**all** template actions, filters, and the autocomplete provider.

**Template actions:**

| Action ID                            | File                              | Target after split                            |
| ------------------------------------ | --------------------------------- | --------------------------------------------- |
| `ansible:content:create`             | `actions/ansible.ts`              | TBD — creator-service; keep with self-service |
| `ansible:create:ee-definition`       | `actions/createEEDefinition.ts`   | `scaffolder-backend-module-self-service`      |
| `ansible:prepare:publish`            | `actions/prepareForPublish.ts`    | `scaffolder-backend-module-self-service`      |
| `rhaap:create-project`               | `actions/aapCreateProject.ts`     | **`scaffolder-backend-module-aap`**           |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts`       | **`scaffolder-backend-module-aap`**           |
| `rhaap:create-job-template`          | `actions/aapCreateJobTemplate.ts` | **`scaffolder-backend-module-aap`**           |
| `rhaap:launch-job-template`          | `actions/aapLaunchJobTemplate.ts` | **`scaffolder-backend-module-aap`**           |
| `rhaap:clean-up`                     | `actions/aapCleanUp.ts`           | **`scaffolder-backend-module-aap`**           |

**Template filters:** `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`,
`uuidFilter` — all AAP template helpers → `scaffolder-backend-module-aap`.

**Autocomplete provider:** `id: 'aap-api-cloud'` with `handleAutocompleteRequest` — mixes
AAP resources (`ansibleService.getResourceData`) with catalog collection queries. Must split.

**Dependencies:** `@ansible/backstage-rhaap-common` (`ansibleServiceRef`), `@backstage/plugin-scaffolder-node`.

### 2.5 Backend — `@ansible/backstage-plugin-auth-backend-module-rhaap-provider`

`createBackendModule({ pluginId: 'auth', moduleId: 'rhaap-provider' })` that registers
the `rhaap` OAuth provider and a user job templates router.

**What it does:**

- Registers OAuth provider (`providerId: 'rhaap'`) using `aapAuthAuthenticator`
- `aapAuthAuthenticator` calls `AAPClient.rhAAPAuthenticate` and `rhAAPRevokeToken`
  directly via `ansibleServiceRef`
- `AAPAuthSignInResolvers` creates users in Backstage catalog via `userProvisionerRef`
- `createUserJobTemplatesRouter` exposes `GET /rhaap/user-job-templates` for the frontend

**Dependencies:** `@ansible/backstage-rhaap-common` (for `ansibleServiceRef`, `userProvisionerRef`),
`@backstage/plugin-auth-node`.

### 2.6 Frontend — `@ansible/aap-app-auth` (already on main)

`@ansible/aap-app-auth` is a frontend-plugin-module (`backstage.role: frontend-plugin-module`)
already merged on main (PR #880) at `workspaces/aap/plugins/aap-app-auth/`.

- `pluginId: 'app'` — required by Backstage `SignInPageBlueprint`
- Provides `SignInPage` and `AAPLogoutButton` as NFS frontend modules
- Must remain a **separate** frontend module (cannot merge into `aap` plugin which has
  `pluginId: 'ansible'`)
- Uses `--no-generate-scalprum-assets` (NFS-only, no Scalprum fallback)

This package is already in the `workspaces/aap/` workspace. No further extraction work
is needed — Phase 6 of this guide is complete.

### 2.7 Frontend — `@ansible/portal-scaffolder`

**Package:** `@ansible/portal-scaffolder`
**Backstage role:** `frontend-plugin` (`pluginId: portal-scaffolder`)
**Directory:** `workspaces/self-service/plugins/portal-scaffolder/`

The self-service plugin is the primary consumer-facing UI for AAP automation. While its
refactor is owned by the portal SDK effort, this section documents its current-state imports from
`backstage-rhaap-common` so that post-split import expectations are clear.

**Imports from `@ansible/backstage-rhaap-common` (via deep subpaths):**

| Import                                | Subpath             | Used in                                                                                        |
| ------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `executionEnvironmentsViewPermission` | `/permissions`      | `SidebarItems.tsx`, `EERoutesPage.tsx`, `RouteView.tsx`                                        |
| `collectionsViewPermission`           | `/permissions`      | `SidebarItems.tsx`, `CollectionsCatalogPage.tsx`, `CollectionDetailsPage.tsx`, `RouteView.tsx` |
| `gitRepositoriesViewPermission`       | `/permissions`      | `SidebarItems.tsx`, `GitRepositoriesPage.tsx`, `RepositoryDetailsPage.tsx`, `RouteView.tsx`    |
| `templatesViewPermission`             | `/permissions`      | `SidebarItems.tsx`, `Home.tsx`, `RouteView.tsx`                                                |
| `historyViewPermission`               | `/permissions`      | `SidebarItems.tsx`, `TaskList.tsx`, `RouteView.tsx`                                            |
| `compareVersions`                     | `/constants`        | `CollectionsCatalog/utils.ts`                                                                  |
| `SCM_INTEGRATION_AUTH_FAILED_CODE`    | `/constants`        | `common/fetchReadme.ts`, re-exported from `common/index.ts`                                    |
| `SourceVersionDetail` (type)          | Barrel (`index.ts`) | `CollectionsPicker/CollectionsPickerExtension.tsx`                                             |

**Routable extensions (6):**

| Extension             | Mount point               | Route                        |
| --------------------- | ------------------------- | ---------------------------- |
| `SelfServicePage`     | `rootRouteRef`            | `/self-service/*`            |
| `EEPage`              | `eeRouteRef`              | `/self-service/ee`           |
| `CollectionsPage`     | `collectionsRouteRef`     | `/self-service/collections`  |
| `GitRepositoriesPage` | `gitRepositoriesRouteRef` | `/self-service/repositories` |
| `TemplatesPage`       | `templatesRouteRef`       | `/self-service` (templates)  |
| `HistoryPage`         | `historyRouteRef`         | `/self-service/create/tasks` |

**Component extensions (8):** `LocationListener`, `AppThemeFixer`, `AAPLogoutButton`,
`EEBuilderSidebarItem`, `CollectionsSidebarItem`, `GitRepositoriesSidebarItem`,
`TemplatesSidebarItem`, `HistorySidebarItem`.

**Scaffolder field extensions (11 exported from `src/index.ts`):**

| Extension                                  | Data source                                       |
| ------------------------------------------ | ------------------------------------------------- |
| `AAPTokenFieldExtension`                   | AAP OAuth token                                   |
| `AAPResourcePickerExtension`               | AAP APIs via plugin apis                          |
| `CollectionsPickerFieldExtension`          | Autocomplete (`aap-api-cloud`) — content boundary |
| `BaseImagePickerFieldExtension`            | Static schema — content boundary                  |
| `FileUploadPickerFieldExtension`           | File upload UX                                    |
| `PackagesPickerFieldExtension`             | Pure form UX (enum/schema driven)                 |
| `AdditionalBuildStepsPickerFieldExtension` | Pure form UX                                      |
| `EEFileNamePickerFieldExtension`           | Catalog entity ref lookup                         |
| `EETagsPickerFieldExtension`               | Pure form UX                                      |
| `ScmSelectorFieldExtension`                | SCM provider selection UX                         |
| `MCPServersPickerFieldExtension`           | Being removed (not shipped to GA)                 |

**Custom API factories (2 owned + 1 supplied separately):** `AAPApis` (`ansibleApiRef` —
sync triggers, user job templates) and `EEBuildApis` (`eeBuildApiRef` — EE build trigger)
are registered by portal-scaffolder's legacy/native plugin. `AapAuthApi` (`rhAapAuthApiRef`)
is supplied separately by `@ansible/aap-app-auth`; portal-scaffolder components consume it
via `useApi(rhAapAuthApiRef)` but do not register the factory.

**Post-split import expectations:** Permissions and `compareVersions` move to `aap-common`.
`SCM_INTEGRATION_AUTH_FAILED_CODE` and `SourceVersionDetail` stay on the `backstage-rhaap-common`
shim (content-boundary — not AAP). Once the content workspace exists, those imports
relocate there. Self-service never imports `AAPClient`, `ansibleServiceRef`, or
`IAAPService` — it communicates with the backend entirely via Backstage proxy/API routes.

---

## 3. Target Package Layout

Per architecture §2.2, all AAP packages live in `workspaces/aap/`. The recommended
approach splits the monolithic common library into three layers plus the frontend:

```
workspaces/aap/
├── package.json  yarn.lock  .changeset/
├── packages/
│   ├── app/     # dev harness — aap workspace standalone
│   └── backend/
└── plugins/
    ├── aap-common/          common-library
    ├── aap-node/            node-library
    ├── aap-backend/         backend-plugin
    ├── aap/                 frontend-plugin
    ├── aap-app-auth/        frontend-plugin  (from PR 744)
    ├── auth-backend-module-aap-provider/    backend-plugin-module
    ├── catalog-backend-module-aap/          backend-plugin-module
    └── scaffolder-backend-module-aap/       backend-plugin-module
```

### 3.1 `aap-common` — common-library (isomorphic, no Node.js, no React)

Everything in this package must run in any JS environment (browser or Node).
Source: extracted from `backstage-rhaap-common`.

**Types (from `src/types/types.ts`):**

| Type                                                                                 | Description                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `Organization`                                                                       | AAP org (`id`, `name`, `namespace`)                                                                     |
| `Inventory`                                                                          | AAP inventory (`id`, `name`)                                                                            |
| `Credential`                                                                         | AAP credential (`id`, `name`, `kind`, `inputs`)                                                         |
| `Project`                                                                            | AAP project (with `scmUrl`, `scmBranch`, `status`, `organization`)                                      |
| `ExecutionEnvironment`                                                               | EE payload (`environmentName`, `organization`, `image`, `pull`)                                         |
| `JobTemplate`                                                                        | Job template payload (`templateName`, `project`, `organization`, `jobInventory`, `playbook`)            |
| `CleanUp`                                                                            | Cleanup payload (optional `project`, `executionEnvironment`, `template`)                                |
| `LaunchJobTemplate`                                                                  | Launch payload (`template`, `jobType`, `inventory`, `credentials`, `verbosity`, `extraVariables`, etc.) |
| `UseCase`                                                                            | Use case (`name`, `version`, `url`)                                                                     |
| `AAPTemplate`                                                                        | Simple template ref (`id`, `name`)                                                                      |
| `User`, `Users`                                                                      | AAP user (`id`, `username`, `email`, `is_superuser`, `is_orguser`)                                      |
| `Team`                                                                               | AAP team (`id`, `name`, `organization`, `groupName`)                                                    |
| `RoleAssignment`, `RoleAssignments`, `RoleAssignmentResponse`, `SummaryField`        | RBAC role assignment types                                                                              |
| `TokenResponse`                                                                      | OAuth token response (`access_token`, `refresh_token`, `expires_in`)                                    |
| `PaginatedResponse`                                                                  | AAP paginated API response (`count`, `next`, `results`)                                                 |
| `AnsibleConfig`, `RHAAPConfig`, `CatalogConfig`                                      | Config shape types (type defs only, not readers)                                                        |
| `DevSpaces`, `AutomationHub`, `CreatorService`, `FeedbackConfig`, `ShowCaseLocation` | Nested config types                                                                                     |
| `CreatedTemplate`, `ParsedTemplate`, `BackstageAAPShowcase`                          | Template/showcase types                                                                                 |

**Interfaces (from `src/interfaces/`):**

| Interface                                                           | File                      | Description                                                                       |
| ------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `IJobTemplate`                                                      | `AAPTemplate.ts`          | Full AAP job template shape (~220 lines: all fields, `related`, `summary_fields`) |
| `IProject`, `ILabel`, `IRecentJob`, `ISummaryFieldCredential`       | `AAPTemplate.ts`          | Supporting interfaces for job template                                            |
| `ISurvey`, `ISpec`                                                  | `Survey.ts`               | Survey spec for job templates                                                     |
| `InstanceGroup`, `SummaryFieldCredential`, `SummaryFieldObjectRole` | `InstanceGroup.ts`        | Instance group shape                                                              |
| `IExecutionEnvironment`                                             | `ExecutionEnvironment.ts` | AAP EE shape (with `related`, `summary_fields`)                                   |

**Not included (content boundary):**

| Interface             | File       | Reason                                                                                                |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `SourceVersionDetail` | `types.ts` | Collection version detail — used only by self-service CollectionsPicker, belongs to content workspace |

**Deprecated temporary exports (PAH transition):**

During the transition period, `aap-common` also exports the following PAH types as
`@deprecated` because `IAAPService` in `aap-node` references them in method signatures
(e.g., `syncCollectionsByRepositories` returns `Promise<Collection[]>`). Without these,
`aap-node` would need to import from the shim, creating a circular dependency.

| Export                          | Reason for temporary inclusion                                  |
| ------------------------------- | --------------------------------------------------------------- |
| `Collection`, `CollectionLinks` | Return type of `syncCollectionsByRepositories` on `IAAPService` |
| `Collections` (type alias)      | Used by scaffolder actions that call `IAAPService` PAH methods  |

These exports are marked `@deprecated` in source and are removed from `aap-common` when
the PAH methods are stripped from `IAAPService` (see §4.2 exit conditions). At that point
they move to the content workspace package.

**Permissions (from `src/permissions.ts` — all 5 during Phase 1):**

| Export                                | Permission name                       |
| ------------------------------------- | ------------------------------------- |
| `executionEnvironmentsViewPermission` | `ansible.execution-environments.view` |
| `gitRepositoriesViewPermission`       | `ansible.git-repositories.view`       |
| `collectionsViewPermission`           | `ansible.collections.view`            |
| `templatesViewPermission`             | `ansible.templates.view`              |
| `historyViewPermission`               | `ansible.history.view`                |
| `ansiblePermissions`                  | Array of all 5 above                  |

**Utilities (from `src/utils/nameFormatting.ts`):**

| Export                          | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| `sanitizeAapName`               | AAP name to Backstage entity name (lowercase, hyphens, 63-char limit) |
| `sanitizeAapNameBase`           | Same without truncation (used as slug in composite names)             |
| `sanitizeAapUsername`           | AAP username to Backstage user entity name                            |
| `toOrgEntityName`               | Org name + ID to entity name (multi-org aware)                        |
| `toTeamEntityName`              | Team name + ID to entity name                                         |
| `toTemplateEntityName`          | Job template name + ID to entity name                                 |
| `toWorkflowEntityName`          | Workflow name + ID to entity name                                     |
| `toUserEntityName`              | Username + user ID to entity name                                     |
| `toUserEntityRef`               | Username to `user:default/<name>` ref                                 |
| `toOrgGroupRef`                 | Org to `group:<ns>/<name>` ref                                        |
| `toTeamGroupRef`                | Team to `group:<ns>/<name>` ref                                       |
| `toSourceNamespace`             | Org to source-scoped namespace (`aap-<orgId>`)                        |
| `DEFAULT_CATALOG_ENTITY_SOURCE` | Constant: `'aap'`                                                     |
| `CatalogEntitySource`           | Type: `'aap' \| 'ao' \| 'scm'`                                        |
| `CatalogEntityIdentityOptions`  | Options interface (`multiOrgEnabled`, `source`, `orgId`)              |

**Constants (from `src/constants.ts`):**

| Export                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `TERMINAL_JOB_STATUSES` | `Set(['successful', 'failed', 'error', 'canceled'])` |
| `getVerbosityLevels`    | Returns array of verbosity level objects (0–5)       |
| `getVerbosityObject`    | Single verbosity level by index                      |
| `compareVersions`       | Semver-like version comparison                       |

**Not included (content boundary):**

| Export                             | Reason                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `SCM_INTEGRATION_AUTH_FAILED_CODE` | SCM constant — belongs with `ScmClient` in content workspace |

**Dependencies:** `@backstage/plugin-permission-common` (for `BasicPermission` type),
`@backstage/integration` (for `GithubIntegrationConfig`, `GitLabIntegrationConfig` in config types).

**Tests:** `permissions.test.ts`, `constants.test.ts`, `nameFormatting.test.ts` — all move with their source files.

---

### 3.2 `aap-node` — node-library (interface + service ref only)

Lightweight package. Holds service contracts consumed via dependency injection.
No HTTP code, no concrete implementations.

**Files:**

| File                     | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/IAAPService.ts`     | `IAAPService` interface — standalone interface declaring method signatures using shared types from `aap-common` (not `Pick<AAPClient, ...>` — that is how it is defined today but would create a cycle; the target declares methods directly and `AAPClient` in `aap-backend` implements it)                                                                                                                                                                                                                                                                           |
| `src/AAPService.ts`      | `ansibleServiceRef` — `createServiceRef<IAAPService>({ id: 'rhaap.client.service' })` with no `defaultFactory` (see §4.3)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/UserProvisioner.ts` | `userProvisionerRef` — `createServiceRef<IUserProvisioner>({ id: 'rhaap.user-provisioner', scope: 'root' })` with default factory (creates `new UserProvisioner()`); `IUserProvisioner` interface (`createUser`); `IUserProvisionerConnectable` wiring interface (`registerCreateUserFn`); `UserProvisioner` class — **throws** if `createUser()` is called before `registerCreateUserFn()` has been called (this is intentional: `catalog-backend-module-rhaap-user-provisioner` must wire in the actual creation callback before any sign-in invokes `createUser()`) |
| `src/index.ts`           | Barrel exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Dependencies:** `@ansible/aap-common` (peer — for types used in `IAAPService` method signatures),
`@backstage/backend-plugin-api` (for `createServiceRef`).

**Tests:** `AAPService.test.ts` (service ref creation test) — move from current `backstage-rhaap-common`.

---

### 3.3 `aap-backend` — backend-plugin (client implementation)

The only package that makes HTTP calls to AAP Controller.

**Files:**

| File                              | Source                                  | Description                                                                                                                                                |
| --------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/AAPClient.ts`                | `AAPClient/AAPClient.ts`                | `AAPClient` class (~1500 lines) implementing `IAAPService` — all AAP REST methods                                                                          |
| `src/service.ts`                  | New                                     | `ansibleServiceFactory` — `createServiceFactory` wiring `AAPClient` to `ansibleServiceRef`                                                                 |
| `src/utils/config.ts`             | `AAPClient/utils/config.ts`             | `getAnsibleConfig()`, `getCatalogConfig()`, `resolveActiveOrganizations()` — reads `ansible.rhaap.*` and `catalog.providers.rhaap.*` from Backstage config |
| `src/utils/jobTemplateHelpers.ts` | `AAPClient/utils/jobTemplateHelpers.ts` | `buildLaunchPayload()` — constructs AAP launch request body from template inputs                                                                           |
| `src/utils/jobStdoutHelpers.ts`   | `AAPClient/utils/jobStdoutHelpers.ts`   | `parseAndLogStdoutMessages()`, `parseStdoutMessages()`, `redactSensitiveLogMessage()` — parses Controller stdout, redacts secrets                          |
| `src/mockData.ts`                 | `AAPClient/mockData.ts`                 | Mock AAP API responses for tests                                                                                                                           |
| `src/index.ts`                    | New                                     | Barrel: `AAPClient`, `IAAPService` (re-export from aap-node), `ansibleServiceFactory`, config readers, helpers                                             |
| `config.d.ts`                     | Split from current                      | Config schema for `ansible.rhaap.*` (baseUrl, token, checkSSL) and `catalog.providers.rhaap.*` (orgs, sync) only                                           |

**Transitional retention (content boundary — retained until claimed):**

| File                                   | Transitional home | Reason                                                                                                                                                                           |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pahHelpers.ts` + `pahHelpers.test.ts` | `aap-backend`     | PAH collection sync — belongs to content workspace long-term; retained in `aap-backend` during transition because `AAPClient` calls it and `IAAPService` exposes the PAH methods |

**PAH methods during transition:** `isValidPAHRepository()`, `syncCollectionsByRepositories()`,
and all `pahHelpers` imports remain on `AAPClient` in `aap-backend` and on `IAAPService` in
`aap-node` during the transition period (see §4.2). The `pahHelpers.ts` source file lives in
`aap-backend` (next to `AAPClient` which calls it), and is also re-exported by the
`backstage-rhaap-common` shim (§3.6) for any unconverted consumers. They are only removed
when the content workspace provides a replacement service contract and
`PAHCollectionProvider` has been migrated.

**Dependencies:** `@ansible/aap-common`, `@ansible/aap-node`, `@backstage/backend-plugin-api`,
`@backstage/config`, `@backstage/plugin-auth-node`, `@backstage/errors`, `@backstage/integration`,
`undici`, `yaml`, `lodash.uniqby`.

**Tests:** `AAPClient.test.ts`, `jobTemplateHelpers.test.ts`, `jobStdoutHelpers.test.ts` — all move with source.

---

### 3.4 `aap` — frontend-plugin (the `/ansible` UI)

Rename of current `plugins/backstage-rhaap/`. No changes to contents — just directory and package name.

**Files:**

| File                                                  | Description                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/plugin.ts`                                       | `createPlugin({ id: 'ansible' })` — registers `AnsiblePage` routable extension and `AppThemeFixer` component extension |
| `src/routes.ts`                                       | `rootRouteRef` for `/ansible`                                                                                          |
| `src/index.ts`                                        | Barrel: re-exports plugin, page, theme fixer                                                                           |
| `src/components/AnsiblePage/AnsiblePage.tsx`          | Tabbed layout: Overview, My Items, Create, Learn                                                                       |
| `src/components/AnsiblePage/RatingsFeedbackModal.tsx` | User feedback dialog                                                                                                   |
| `src/components/OverviewContent/OverviewContent.tsx`  | Landing page with QuickAccessCard, Favourites                                                                          |
| `src/components/OverviewContent/QuickAccessCard.tsx`  | Quick-access links card                                                                                                |
| `src/components/OverviewContent/Favourites.tsx`       | User favourites component                                                                                              |
| `src/components/OverviewContent/quickAccessData.tsx`  | Static quick-access link data                                                                                          |
| `src/components/CatalogContent/CatalogContent.tsx`    | "My Items" tab — catalog components tagged `ansible`                                                                   |
| `src/components/CreateContent/CreateContent.tsx`      | "Create" tab — scaffolder templates tagged `ansible`                                                                   |
| `src/components/LearnContent/LearnContent.tsx`        | "Learn" tab — learning paths and documentation links                                                                   |
| `src/components/LearnContent/data.ts`                 | Learning resource data                                                                                                 |
| `src/components/AppThemeFixer/AppThemeFixer.tsx`      | MUI theme fix for RHDH                                                                                                 |
| `src/components/AnsibleLogo/AnsibleLogo.tsx`          | Ansible branding logo                                                                                                  |
| `src/components/WorkspaceIcon/WorkspaceIcon.tsx`      | Sidebar workspace icon                                                                                                 |
| `src/components/DocumentIcon/DocumentIcon.tsx`        | Document icon component                                                                                                |

**Dependencies:** Backstage core (`@backstage/core-plugin-api`, `@backstage/core-components`,
`@backstage/theme`), MUI v4, `react-use`. **Zero dependency on `aap-common`, `aap-node`, or
`aap-backend`** — communicates with backend via Backstage proxy/API routes.

**Tests:** `AnsiblePage.test.tsx`, `OverviewContent.test.tsx`, `CatalogContent.test.tsx`,
`LearnContent.test.tsx`, `CreateContent.test.tsx`, `RatingFeedbackModal.test.tsx` — all move as-is.

---

### 3.5 Remaining AAP workspace packages (not new, but relocated)

These existing backend modules move to `workspaces/aap/plugins/` and update their
imports from `backstage-rhaap-common` to `aap-common` + `aap-node`:

| Package                                       | Current directory                                | Changes needed                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-backend-module-aap-provider`            | `auth-backend-module-rhaap-provider/`            | Update imports: `ansibleServiceRef` and `userProvisionerRef` from `aap-node`, `IAAPService` from `aap-node`, `toUserEntityName` from `aap-common`                                                                                                                                                                                                                                                                                                        |
| `catalog-backend-module-aap`                  | `catalog-backend-module-rhaap/`                  | Update imports: `ansibleServiceRef` from `aap-node`, types/permissions/utilities from `aap-common`. Remove `ScmClientFactory` imports (leaves with content providers).                                                                                                                                                                                                                                                                                   |
| `catalog-backend-module-aap-user-provisioner` | `catalog-backend-module-rhaap-user-provisioner/` | Update imports: `ansibleServiceRef` and `userProvisionerRef` from `aap-node`, `IUserProvisionerConnectable` from `aap-node`. **Embedding exception:** `UserProvisionerProvider.ts` also imports `resolveActiveOrganizations` from common (post-split: `aap-backend`). Either embed `aap-backend` alongside `aap-common`/`aap-node`, or extract `resolveActiveOrganizations` into a shared config utility in `aap-node`. Align with §4.7 packaging table. |
| `scaffolder-backend-module-aap`               | `scaffolder-backend-module-backstage-rhaap/`     | Update imports: `ansibleServiceRef` and `IAAPService` from `aap-node`, types and `getVerbosityLevels` from `aap-common`. The scaffolder has its own local `getAnsibleConfig` (reads `ansible.creatorService.*`) — it does **not** import the common library's `getAnsibleConfig` (reads `ansible.rhaap.*`). No `aap-backend` dependency needed. Remove `ScmClientFactory` import (leaves with self-service).                                             |

### 3.6 What stays in `backstage-rhaap-common` (backward-compat shim)

Until all consumers migrate, the old package re-exports from the new ones:

| What stays                                                                  | Reason                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScmClient/` (all files)                                                    | Not AAP — belongs to content workspace; no new home yet                                                                                                                                   |
| `Collection`, `CollectionLinks` interfaces                                  | Re-exported from `aap-common` (deprecated); stays on shim for unconverted consumers                                                                                                       |
| `Collections`, `Collection`, `CollectionLinks`, `SourceVersionDetail` types | Temporarily colocated in `aap-common` as deprecated exports (needed by `IAAPService` return types and `CollectionsPicker`); re-exported through shim; content workspace claims them later |
| `SCM_INTEGRATION_AUTH_FAILED_CODE` constant                                 | Not AAP — belongs with `ScmClient`                                                                                                                                                        |
| `pahHelpers.ts` + PAH methods                                               | Source in `aap-backend`; re-exported here for unconverted consumers                                                                                                                       |
| `PAHCollectionProvider` calls `syncCollectionsByRepositories`               | Provider imports from shim until content workspace claims it (see §4.2)                                                                                                                   |
| Re-exports from `aap-common`, `aap-node`, `aap-backend`                     | Backward compatibility for unconverted consumers                                                                                                                                          |

**Naming migration:**

| Current package                                                | Target package                                               | Notes                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `@ansible/backstage-rhaap-common`                              | Split into `aap-common` / `aap-node` / `aap-backend`         | Re-export shim from old name during transition    |
| `@ansible/plugin-backstage-rhaap`                              | `@ansible/plugin-aap` (or keep name, move directory)         | Plugin ID `ansible` unchanged                     |
| `@ansible/backstage-plugin-auth-backend-module-rhaap-provider` | `@ansible/backstage-plugin-auth-backend-module-aap-provider` | Provider ID `rhaap` unchanged for operator compat |
| `@ansible/backstage-plugin-catalog-backend-module-rhaap`       | `@ansible/backstage-plugin-catalog-backend-module-aap`       | Module ID: `aap` (was `rhaap`)                    |
| `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`    | `@ansible/plugin-scaffolder-backend-module-aap`              | Module ID: `aap` (was `ansible`)                  |
| _(PR 744)_ `rhaap-app-auth`                                    | `@ansible/aap-app-auth`                                      | Already merged on main (PR #880), NFS only        |

---

## 4. Design Decisions (Architecture-Aligned)

### 4.1 Four-package layer split

Architecture dependency rules (CEA §2.5, rule 1) require that `common-library` packages contain only isomorphic
code (no Node.js, no React). Today's `backstage-rhaap-common` contains `AAPClient`
(Node.js `undici` fetch), `ansibleServiceRef` (Node.js `@backstage/backend-plugin-api`),
and `ScmClient` (Node.js) — all of which violate this rule.

The recommended split separates concerns into clean layers:

| Package       | Layer                   | What it holds                                                                    |
| ------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `aap-common`  | Isomorphic (types only) | DTOs, permissions, name formatting, constants — no Node.js, no React             |
| `aap-node`    | Node interface          | `IAAPService` interface + `ansibleServiceRef` — no HTTP implementation           |
| `aap-backend` | Node implementation     | `AAPClient` class, config readers, job helpers — the only package that calls AAP |
| `aap`         | Frontend                | `/ansible` UI — communicates via proxy, no direct AAP imports                    |

This ensures backend modules import only `aap-node` (interface via DI), the frontend
imports nothing from common, and `aap-common` is safe to use in any environment.

### 4.2 IAAPService interface — PAH method transition

The current `IAAPService` interface exposes 37 methods via `Pick<AAPClient, ...>`.
In the target architecture, `IAAPService` is redeclared as a standalone interface
with explicit method signatures (using shared types from `aap-common`), breaking
the `Pick<>` dependency on `AAPClient`. `AAPClient` in `aap-backend` then
`implements IAAPService`.

Two of the current 37 methods are PAH (Private Automation Hub) methods that cross the content boundary:

```typescript
// PAH methods on IAAPService today:
| 'isValidPAHRepository'
| 'syncCollectionsByRepositories'
```

**Transition contract (critical):** These two PAH methods **must remain on `IAAPService`
during the transition period** because `PAHCollectionProvider` (in `catalog-backend-module-rhaap`)
actively calls `ansibleServiceRef.syncCollectionsByRepositories()` to sync collections
into the Backstage catalog. Removing them from the interface before a replacement exists
would break the provider at compile time and stop collection sync in production.

The PAH methods are only removed from `IAAPService` when **all** of the following are true:

1. The content workspace provides its own service interface for PAH operations
2. `PAHCollectionProvider` has been migrated to use that new content service
3. No other consumer calls these methods via `ansibleServiceRef`

Until then, the interface retains all **37 methods**. The `pahHelpers.ts` file and the
PAH method implementations remain on `AAPClient` in `aap-backend`. After the content
workspace claims them, `IAAPService` drops to **35 methods**.

**Methods that stay on IAAPService** (all 37 during transition, 35 long-term):

- HTTP primitives: `executePostRequest`, `executeGetRequest`, `executeDeleteRequest`
- Project CRUD: `getProject`, `deleteProject`, `deleteProjectIfExists`, `createProject`
- EE CRUD: `deleteExecutionEnvironmentExists`, `createExecutionEnvironment`, `deleteExecutionEnvironment`
- Job template CRUD: `deleteJobTemplate`, `deleteJobTemplateIfExists`, `createJobTemplate`
- Job execution: `fetchEvents`, `fetchResult`, `launchJobTemplate`, `launchJobTemplateNoWait`, `logJobStdoutMessages`, `getJobStatus`, `cancelJob`
- Cleanup: `cleanUp`
- Resource queries: `checkControllerAvailability`, `getResourceData`, `getJobTemplatesByName`
- Identity/org: `getOrganizations`, `listSystemUsers`, `getTeamsByUserId`, `getUserRoleAssignments`, `getOrgsByUserId`, `getUserInfoById`
- Auth: `rhAAPAuthenticate`, `rhAAPRevokeToken`, `fetchProfile`
- Catalog sync: `syncJobTemplates`
- Utility: `setLogger`

### 4.3 Service reference — no defaultFactory, explicit registration

Today, `ansibleServiceRef` bundles a `defaultFactory` that directly imports `AAPClient`.
This works because both live in the same package. After the split, keeping a
`defaultFactory` in `aap-node` that references `AAPClient` from `aap-backend` would
create a **circular package dependency**:

```
aap-node  →(defaultFactory imports)→  aap-backend
aap-backend  →(implements IAAPService from)→  aap-node
```

A dynamic `await import()` inside the factory would technically avoid the static cycle,
but it makes `aap-backend` a fragile implicit dependency of `aap-node` — missing it
produces a confusing runtime error instead of a clear install-time failure.

**Solution: remove `defaultFactory` from the service ref entirely.** The `aap-backend`
package exports a standalone `ServiceFactory` and registers itself as a backend module.
This follows the same pattern Backstage uses for heavy service implementations (the
`-node` package holds the ref and interface; the `-backend` package provides the factory).

```typescript
// aap-node/src/AAPService.ts — interface + ref only, NO factory
import { createServiceRef } from '@backstage/backend-plugin-api';
import type { IAAPService } from './IAAPService';

export const ansibleServiceRef = createServiceRef<IAAPService>({
  id: 'rhaap.client.service', // DO NOT rename — operator configs reference this
  scope: 'plugin',
  // No defaultFactory — aap-backend must be registered to provide this service.
});
```

```typescript
// aap-backend/src/service.ts — factory lives here, next to the implementation
import {
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { ansibleServiceRef } from '@ansible/aap-node';
import { AAPClient } from './AAPClient';

export const ansibleServiceFactory = createServiceFactory({
  service: ansibleServiceRef,
  deps: {
    rootConfig: coreServices.rootConfig,
    logger: coreServices.logger,
  },
  async factory({ rootConfig, logger }) {
    logger.info('Creating a new AAP client');
    return new AAPClient({ rootConfig, logger });
  },
});
```

```typescript
// packages/backend/src/index.ts — explicit registration
backend.add(import('@ansible/aap-backend')); // provides ansibleServiceRef factory
backend.add(import('@ansible/backstage-plugin-catalog-backend-module-aap'));
backend.add(import('@ansible/plugin-scaffolder-backend-module-aap'));
// ...
```

**Dependency graph (no cycle):**

```
aap-common  ← (types)
    ↑
aap-node    ← (IAAPService interface + ansibleServiceRef)
    ↑
aap-backend ← (AAPClient class + ansibleServiceFactory)
```

`aap-node` depends on `aap-common` (for types) and `@backstage/backend-plugin-api` (for
`createServiceRef`). It has **zero dependency** on `aap-backend`. `aap-backend` depends
downward on both `aap-node` and `aap-common` — a clean one-directional chain.

The service ID `rhaap.client.service` must not change without an operator migration story
because RHDH `dynamic-plugins.yaml` may reference it.

**Migration note:** During the transition, the old `backstage-rhaap-common` can keep its
`defaultFactory` intact (it still lives in one package). The factory is only removed when
consumers switch to importing from `aap-node` + registering `aap-backend`.

### 4.3.1 `alpha.ts` feature loader pattern

The catalog module has a second entry point at `catalog-backend-module-rhaap/src/alpha.ts`
that uses `createBackendFeatureLoader` to yield multiple features in sequence:

```typescript
// Current alpha.ts (on main)
export default createBackendFeatureLoader({
  loader: function* () {
    yield rhaapOrganizationServiceFactory; // org-resolver service
    yield createServiceFactory({
      // UserProvisioner with default impl
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield catalogModuleRhaap; // the catalog module itself
  },
});
```

**Why this matters for the split:**

1. **`rhaapOrganizationServiceFactory`** creates an `AAPClient` directly (same pattern as
   `rhaapOrganizationResolver`). After the split, it must import `AAPClient` from
   `aap-backend` instead of `backstage-rhaap-common`.
2. **`UserProvisioner` factory** — the yielded factory creates a `UserProvisioner` whose
   `createUser()` method **throws** until `registerCreateUserFn()` is called by the
   user-provisioner catalog module (`catalog-backend-module-rhaap-user-provisioner`).
   The auth module is the **consumer** — it calls `createUser()` during sign-in, not
   `registerCreateUserFn()`.
3. After the split, the feature loader imports come from `aap-node` (service refs,
   `UserProvisioner` class) and `aap-backend` (`AAPClient`).

**Post-split `alpha.ts`:** Yielded services reference `aap-node` refs and `aap-backend`
implementations. The loader remains in the catalog module.

```typescript
// Post-split alpha.ts (catalog-backend-module-aap/src/alpha.ts)
import {
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { userProvisionerRef, UserProvisioner } from '@ansible/aap-node';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationServiceFactory';
import { catalogModuleRhaap } from './module';

export default createBackendFeatureLoader({
  loader: function* () {
    yield rhaapOrganizationServiceFactory; // imports AAPClient from @ansible/aap-backend
    yield createServiceFactory({
      service: userProvisionerRef,
      deps: {},
      factory: () => new UserProvisioner(),
    });
    yield catalogModuleRhaap;
  },
});
```

**JIT sign-in callback connection sequence:**

The `UserProvisioner` has three distinct readiness conditions that must be satisfied
before JIT provisioning can succeed:

1. **`alpha.ts` feature loader** yields a `UserProvisioner` factory → Backstage creates
   a `UserProvisioner` instance and registers it under `userProvisionerRef` (root scope).
   At this point, `createUser()` would **throw** if called.
2. **User-provisioner catalog module** (`catalog-backend-module-rhaap-user-provisioner`)
   starts up, resolves `userProvisionerRef` from DI, casts to
   `IUserProvisionerConnectable`, and calls
   `registerCreateUserFn(provider.createUser.bind(provider))`. The provisioner callback
   is now **registered**. This module also registers the `UserProvisionerProvider` as an
   entity provider via the catalog processing extension point.
3. **Catalog plugin calls `connect(connection)`** on the `UserProvisionerProvider`
   instance, supplying the `EntityProviderConnection` needed to write entities.
   `UserProvisionerProvider.createUser()` explicitly throws `NotFoundError` until
   `this.connection` is set — `registerCreateUserFn()` alone is not sufficient.
   The provider is now **connected** and ready to write catalog entities.
4. **Auth module** (`auth-backend-module-rhaap-provider`) resolves `userProvisionerRef`
   from DI. When a user signs in for the first time, the auth resolver calls
   `userProvisioner.createUser(username, userID)` — it is a **consumer**, not the
   registrant.

**Concurrency and ordering:** Backstage initialises plugins **concurrently**, not
sequentially. A shared root-scoped service ref does not guarantee cross-plugin init
ordering. The three readiness conditions above are met in practice because:

- Steps 1–2 occur during module `init()`, which runs before the catalog plugin
  begins processing.
- Step 3 (`connect()`) occurs when the catalog plugin starts its entity provider
  pipeline, which happens after all catalog modules have registered their providers.
- Step 4 (first `createUser()` call) occurs at user sign-in time, which is after
  the backend has fully started.

The migration must preserve this callback-registration → catalog-connection → readiness
sequence. Do **not** await provider connection inside the provisioning module's `init()`,
since the catalog plugin initialises its connection pipeline after its modules complete.

### 4.3.2 `rhaapOrganizationResolver` — direct `AAPClient` instantiation

The canonical implementation lives in
`catalog-backend-module-rhaap/src/rhaapOrganizationResolver.ts`. It exports
`rhaapOrganizationServiceFactory`, which supplies the **root-scoped**
`portalActiveOrganizationServiceRef` (defined in `@ansible/portal-plugin-node`).
This is **not** limited to one-off sign-in — the service resolves organization
memberships at **request time** via Portal's identity middleware
(`createIdentityMiddleware`), supporting ongoing authorization and deny decisions.

The portal backend file (`portal-core/packages/backend/src/rhaapOrganizationResolver.ts`)
is a **re-export** of the catalog module's implementation:

```typescript
export {
  RhaapOrganizationResolver,
  rhaapOrganizationServiceFactory,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap/organization';
```

It is not a second independent implementation. After the split, the canonical file
must import `AAPClient` from `@ansible/aap-backend`, `resolveActiveOrganizations`
from `@ansible/aap-backend`, and `toUserEntityName` from `@ansible/aap-common`.
The portal re-export continues to point at the catalog module's subpath and requires
no changes.

**Why direct `AAPClient` construction instead of `ansibleServiceRef`:**
`ansibleServiceRef` is **plugin-scoped** (ID `rhaap.client.service`), meaning each
backend plugin gets its own instance. `rhaapOrganizationServiceFactory` is a
**root-scoped** factory — it runs outside any plugin's scope, so the plugin-scoped
service ref is not available in that context. Direct `AAPClient` construction with
root config and root logger is the correct pattern for root-scoped factories.

### 4.4 Permissions — phased migration

Today `backstage-rhaap-common/src/permissions.ts` exports 5 permissions:

| Permission                            | AAP-owned?   | Notes                                         |
| ------------------------------------- | ------------ | --------------------------------------------- |
| `ansible.templates.view`              | **Yes**      | Job template listing                          |
| `ansible.history.view`                | **Yes**      | Job execution history                         |
| `ansible.execution-environments.view` | Transitional | EE listing — moves to self-service eventually |
| `ansible.git-repositories.view`       | Transitional | Git repos — moves to content eventually       |
| `ansible.collections.view`            | Transitional | Collections — moves to content eventually     |

**Phase 1:** All 5 permissions move to `aap-common` and continue to be registered by
the AAP catalog module. This preserves backward compatibility.

**Phase 2 (follow-on):** As content and self-service workspaces stand up their own
catalog modules, permissions transfer to their respective owners. `aap-common` keeps
only `templates.view` and `history.view`.

### 4.5 ScmClient — explicitly out of AAP

`ScmClient`, `BaseScmClient`, `GithubClient`, `GitlabClient`, `ScmClientFactory`, and
all SCM types are **not AAP concerns**. They serve `AnsibleGitContentsProvider` (content)
and scaffolder publish actions (self-service).

**Migration:** ScmClient moves to the content workspace when the content extraction effort creates
`automation-content-client` or equivalent. Until then, it remains in `backstage-rhaap-common`
behind a re-export shim — the AAP packages do not import it.

### 4.6 Config schema — split by consumer

The `config.d.ts` config schema (read by `getAnsibleConfig` and `getCatalogConfig`) mixes
AAP connection settings with content-specific settings:

| Config path                                     | Owner                     |
| ----------------------------------------------- | ------------------------- |
| `ansible.rhaap.baseUrl`                         | AAP                       |
| `ansible.rhaap.token`                           | AAP                       |
| `ansible.rhaap.checkSSL`                        | AAP                       |
| `ansible.rhaap.showCaseLocation.*`              | Self-service (scaffolder) |
| `ansible.devSpaces.*`                           | Self-service              |
| `ansible.automationHub.*`                       | Content                   |
| `ansible.creatorService.*`                      | Self-service              |
| `ansible.feedback.*`                            | Portal core               |
| `catalog.providers.rhaap.*.orgs`                | AAP catalog module        |
| `catalog.providers.rhaap.*.sync.jobTemplates.*` | AAP catalog module        |

`aap-backend` reads only `ansible.rhaap.*` and `catalog.providers.rhaap.*`. Other config
paths stay with their respective workspace packages. The `config.d.ts` schema file splits
accordingly.

### 4.7 Dynamic plugin packaging

Today all three backend modules use `--embed-package @ansible/backstage-rhaap-common`.
After the split, all AAP backend modules share the same two common packages within the
AAP workspace. Each module's `export-dynamic` script updates to:

```
--embed-package @ansible/aap-common --embed-package @ansible/aap-node
```

**Exception — catalog module:** The catalog module's `alpha.ts` and
`rhaapOrganizationResolver` directly instantiate `new AAPClient()` (root-scoped
factory context, see §4.3.2). Because of this direct import, the catalog module additionally needs:

```
--embed-package @ansible/aap-backend
```

Other modules (auth, scaffolder) access `AAPClient` only via `ansibleServiceRef` DI
and do not need to embed `aap-backend`. The scaffolder has its own local
`getAnsibleConfig` (reads `ansible.creatorService.*`), distinct from the common
library's `getAnsibleConfig` (reads `ansible.rhaap.*`) that lives in `aap-backend`.
No static import from `aap-backend` is needed by the scaffolder.

**RHDH production deployment — `aap-backend` as a mandatory dynamic plugin:**

In the dev monolith (`packages/backend/src/index.ts`), `ansibleServiceFactory` is
registered via `backend.add()`. RHDH does not use the monolith backend — it loads
separate dynamic plugin artifacts. Since `aap-common` and `aap-node` contain only
types and the service ref (no factory, no `AAPClient`), a mechanism is needed to
register the service implementation at runtime.

The recommended approach is to ship `@ansible/aap-backend` as a **standalone dynamic
plugin** that operators add to `dynamic-plugins.yaml`. On startup it registers
`ansibleServiceFactory`, which backs `ansibleServiceRef` for all other modules.
The other AAP backend modules generally only embed `aap-common` + `aap-node` (types and
the service ref) — they receive the `AAPClient` implementation via dependency injection.
**Exception:** `catalog-backend-module-aap-user-provisioner` also statically imports
`resolveActiveOrganizations` from common (post-split: `aap-backend`). This requires
either embedding `aap-backend` alongside `aap-common`/`aap-node`, or extracting
`resolveActiveOrganizations` into a shared config utility in `aap-node` to avoid the
extra embedding. The chosen approach should be carried into Phase 5.

```yaml
# dynamic-plugins.yaml (RHDH)
plugins:
  - package: '@ansible/aap-backend' # NEW — registers ansibleServiceFactory
    disabled: false
  - package: '@ansible/backstage-plugin-catalog-backend-module-aap'
    disabled: false
    # NOTE: aap-common and aap-node are embedded at build time via
    # --embed-package in the export-dynamic script, not at runtime.
  - package: '@ansible/backstage-plugin-catalog-backend-module-aap-user-provisioner'
    disabled: false
  - package: '@ansible/backstage-plugin-auth-backend-module-aap-provider'
    disabled: false
  - package: '@ansible/plugin-scaffolder-backend-module-aap'
    disabled: false
```

**Load order:** RHDH resolves service refs lazily, so `aap-backend` does not need to
load before the other modules — it just needs to be present. Backstage's service
registry wires the factory to the ref regardless of registration order.

**Transition plan:** During migration, there are two distinct cases:

1. **Unchanged old package (pre-split):** Operators who still embed the old monolithic
   `backstage-rhaap-common` continue to work — the old package retains its
   `defaultFactory` on `ansibleServiceRef`, so service provisioning is automatic.
2. **Replacement shim (post-split):** The backward-compat shim (§4.9) re-exports
   **import paths** so that existing `import { ... } from '@ansible/backstage-rhaap-common'`
   statements resolve. However, the shim does **not** register services — operators
   must explicitly load `@ansible/aap-backend` (via `backend.add()` or
   `dynamic-plugins.yaml`) to get the `ansibleServiceRef` factory. See §4.9 for details.

Once all consumers migrate to the new packages, the shim is removed.

### 4.8 Frontend URL stability

The `aap` frontend plugin keeps `pluginId: 'ansible'` and mounts at `/ansible`. No URL
changes. The `rootRouteRef` is preserved. Sidebar items that render conditionally based on
permissions continue to work — they check permissions via the Backstage permission
framework, not by importing from the common library.

### 4.9 Backward compatibility shim

During the transition, `@ansible/backstage-rhaap-common` becomes a thin re-export shim:

```typescript
// backstage-rhaap-common/src/index.ts (transition period)
export * from '@ansible/aap-common'; // includes deprecated Collection/SourceVersionDetail types
export * from '@ansible/aap-node';
export {
  AAPClient,
  getAnsibleConfig,
  getCatalogConfig,
  resolveActiveOrganizations,
  mockData,
} from '@ansible/aap-backend';
export * from './ScmClient'; // stays here until content workspace claims it
export { SCM_INTEGRATION_AUTH_FAILED_CODE } from './constants'; // retained locally
// Settings permissions retained locally until Portal-owned replacement is available:
export {
  ANSIBLE_SETTINGS_CAPABILITIES,
  type AnsibleSettingsCapability,
  ansibleSettingsViewPermission,
  ansibleSettingsEditPermission,
} from './permissions';
```

The `package.json` `"exports"` map must also preserve the `./UserProvisioner` subpath,
pointing to `@ansible/aap-node`'s UserProvisioner re-export, so that existing consumers
using `import { ... } from '@ansible/backstage-rhaap-common/UserProvisioner'` continue
to work. Similarly, the following existing subpath exports must be preserved:

| Old subpath                   | Shim target                                                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./`                          | Re-exports from `aap-common` + `aap-node` + `aap-backend` (barrel above)                                                                                                                                                                                                               |
| `./constants`                 | Local wrapper: re-exports `@ansible/aap-common/constants` + retains `SCM_INTEGRATION_AUTH_FAILED_CODE` locally (see §3.6)                                                                                                                                                              |
| `./permissions`               | Local wrapper: re-exports `@ansible/aap-common/permissions` + retains `ANSIBLE_SETTINGS_CAPABILITIES`, `AnsibleSettingsCapability`, `ansibleSettingsViewPermission`, `ansibleSettingsEditPermission` locally (APME consumers import these; Portal-owned replacement not yet available) |
| `./UserProvisioner`           | `@ansible/aap-node` (UserProvisioner exports)                                                                                                                                                                                                                                          |
| `./permissionRules`           | Stays in shim (portal-core boundary)                                                                                                                                                                                                                                                   |
| `./gitRepositoriesCatalog`    | Stays in shim (content boundary)                                                                                                                                                                                                                                                       |
| `./gitRepositoriesExtensions` | Stays in shim (content boundary)                                                                                                                                                                                                                                                       |
| `./devSpaces`                 | Stays in shim (self-service boundary)                                                                                                                                                                                                                                                  |
| `./catalogEntity`             | Stays in shim (shared)                                                                                                                                                                                                                                                                 |

This ensures that existing **import paths** continue to resolve. However, re-exporting
from the shim does **not** automatically register services — consumers that relied on
`defaultFactory` in the old `ansibleServiceRef` must now ensure `@ansible/aap-backend`
is loaded (via `backend.add()` or `dynamic-plugins.yaml`). The shim preserves import
compatibility, not service provisioning.

**Default export:** Backend modules that use `backend.add(import(...))` require a default
export that is a `BackendFeature`. Each module already does:

```typescript
export { catalogModuleRhaap as default } from './module';
```

After the rename, the same pattern applies:

```typescript
// aap-backend/src/index.ts
export { ansibleServiceFactory as default } from './service';
```

This ensures `backend.add(import('@ansible/aap-backend'))` works.

**Important:** Adding `@ansible/aap-backend` as a dependency in `package.json` alone
does **not** register `ansibleServiceRef`. The package must be explicitly loaded via
`backend.add(import('@ansible/aap-backend'))` in the monolith backend, or listed in
`dynamic-plugins.yaml` for RHDH. Without this, other modules that depend on
`ansibleServiceRef` will fail at runtime with a missing service error.

---

## 5. Ordered Work Packages

Phases are sequenced by dependency. Phase 1 can start immediately; Phase 4 depends on
sibling spikes.

### Phase 0 — Inventory and contract freeze (this spike)

**Output:** Complete inventory of every export, method, type, config path, and permission
in `backstage-rhaap-common`, classified into target packages. Decision record.

| Item                                                                                                      | Status                              |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Inventory of `backstage-rhaap-common` barrel exports                                                      | Captured in §2–3 and Appendix B     |
| Classify each export as KEEP (aap-common) / MOVE (aap-node, aap-backend) / REMOVE (content, self-service) | Captured in §3.1–3.6 and Appendix B |
| IAAPService method audit (37 methods → 35 AAP + 2 PAH)                                                    | Captured in §4.2 and Appendix A     |
| Permission audit (5 permissions, 2 purely AAP)                                                            | Captured in §3.1 and §4.4           |
| Config path ownership map                                                                                 | Captured in §4.6                    |
| ScmClient classification (out of AAP)                                                                     | Captured in §4.5                    |
| Decision record — 4-package split accepted                                                                | Captured in §4.1                    |
| Cross-spike dependency matrix with AAP-95782, AAP-95785                                                   | Captured in §8                      |
| Document PR 744 constraints on frontend/auth packaging                                                    | Captured in §7.1                    |

---

### Phase 1 — Create `aap-common` (types-only package)

**Output:** `@ansible/aap-common` common-library package with zero Node.js/React dependencies.

| Item                                                                | Source                                                | Notes                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `plugins/aap-common/` with `backstage.role: common-library`  | New                                                   | Package name `@ansible/aap-common`                                                                                                                                                                          |
| Move types from `backstage-rhaap-common/src/types/types.ts`         | AAP DTOs + transitional content types                 | Include `Collections`, `Collection`, `CollectionLinks`, `SourceVersionDetail` as **deprecated** exports (needed by `IAAPService` return types and `CollectionsPicker`); content workspace claims them later |
| Move interfaces from `backstage-rhaap-common/src/interfaces/`       | AAP interfaces + transitional                         | `IJobTemplate`, `ISurvey`, `InstanceGroup`, `AAPTemplate`; include `Collection` interface as **deprecated** (used by PAH methods on `IAAPService`)                                                          |
| Move `permissions.ts` (all 5 initially)                             | Whole file                                            | Phase 2 strips to 2 AAP-only                                                                                                                                                                                |
| Move `utils/nameFormatting.ts`                                      | Whole file + tests                                    | All sanitizers and entity name builders                                                                                                                                                                     |
| Move AAP constants from `constants.ts`                              | `TERMINAL_JOB_STATUSES`, verbosity, `compareVersions` | Leave `SCM_INTEGRATION_AUTH_FAILED_CODE` for content                                                                                                                                                        |
| Move config types (`AnsibleConfig`, `CatalogConfig`, `RHAAPConfig`) | From `types/types.ts`                                 | Type definitions only, not readers                                                                                                                                                                          |
| Add `package.json` exports map                                      | `./`, `./permissions`, `./constants`                  | Match current subpath exports                                                                                                                                                                               |
| Unit tests for nameFormatting                                       | Move existing tests                                   |                                                                                                                                                                                                             |

**Dependency:** None — can start immediately.

**Verification:** `yarn tsc` succeeds, `aap-common` has no `undici`, `express`, or React imports.

---

### Phase 2 — Create `aap-node` (interface + service ref)

**Output:** `@ansible/aap-node` node-library package with `IAAPService` and `ansibleServiceRef`.

| Item                                                           | Source                     | Notes                                                                                 |
| -------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Create `plugins/aap-node/` with `backstage.role: node-library` | New                        | Package name `@ansible/aap-node`                                                      |
| Move `IAAPService` interface                                   | `AAPClient/AAPClient.ts`   | Redeclare as standalone interface; retain all 37 methods during transition (see §4.2) |
| Move `ansibleServiceRef` (without `defaultFactory`)            | `AAPService/AAPService.ts` | Keep service ID `rhaap.client.service`; no factory — see §4.3                         |
| Peer dependency on `@ansible/aap-common`                       | Types                      |                                                                                       |
| Peer dependency on `@backstage/backend-plugin-api`             | `createServiceRef` only    |                                                                                       |

**Dependency:** Phase 1 (`aap-common` types exist).

**Verification:** `yarn tsc` succeeds, no `undici` or `fetch` imports in `aap-node`.

---

### Phase 3 — Create `aap-backend` (client implementation)

**Output:** `@ansible/aap-backend` backend-plugin package with `AAPClient` class and `ansibleServiceFactory`.

| Item                                                                       | Source                                                                   | Notes                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Create `plugins/aap-backend/` with `backstage.role: backend-plugin`        | New                                                                      | Package name `@ansible/aap-backend`                                           |
| Move `AAPClient` class                                                     | `AAPClient/AAPClient.ts`                                                 | Full implementation                                                           |
| Create `ansibleServiceFactory`                                             | New                                                                      | `createServiceFactory` for `ansibleServiceRef` — see §4.3                     |
| Move `utils/config.ts` (`getAnsibleConfig`, `getCatalogConfig`)            | `AAPClient/utils/config.ts`                                              | AAP config readers                                                            |
| Move `utils/jobStdoutHelpers.ts`                                           | `AAPClient/utils/`                                                       | + tests                                                                       |
| Move `utils/jobTemplateHelpers.ts`                                         | `AAPClient/utils/`                                                       | + tests                                                                       |
| Remove PAH methods from `AAPClient`                                        | `isValidPAHRepository`, `syncCollectionsByRepositories`, `pahHelpers.ts` | Retained during transition (§4.2); removed when content workspace claims them |
| Move `AAPClient.test.ts`, `mockData.ts`                                    | `AAPClient/`                                                             | Adapt imports                                                                 |
| Dependency on `@ansible/aap-common` + `@ansible/aap-node`                  |                                                                          |                                                                               |
| Runtime deps: `undici`, `yaml`, `lodash.uniqby`                            | From current common                                                      |                                                                               |
| `config.d.ts` schema: `ansible.rhaap.*` + `catalog.providers.rhaap.*` only | Split from current                                                       |                                                                               |

**Dependency:** Phase 2 (`aap-node` interface exists for `implements IAAPService`).

**Verification:** `AAPClient.test.ts` passes, `export-dynamic` builds.

---

### Phase 4 — Rename frontend to `aap`

**Output:** `@ansible/plugin-aap` frontend plugin (or keep name, physically move directory).

| Item                                                   | Source                | Notes                      |
| ------------------------------------------------------ | --------------------- | -------------------------- |
| Move `plugins/backstage-rhaap/` → `plugins/aap/`       | Directory rename      | Or create new, copy files  |
| Update `package.json` name                             | `@ansible/plugin-aap` | Keep `pluginId: 'ansible'` |
| Verify no imports from `backstage-rhaap-common`        | Current: none         | Confirm stays clean        |
| Update `export-dynamic` script if package name changes |                       |                            |
| Update `packages/app/src/App.tsx` import path          |                       |                            |

**Dependency:** None (frontend is independent of backend splits).

**Verification:** `yarn start` loads `/ansible` page, all frontend tests pass.

---

### Phase 5 — Backward compatibility shim + consumer migration

**Output:** `backstage-rhaap-common` becomes re-export shim; all backend modules import
from `aap-common` / `aap-node`.

| Item                                                                            | Notes                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Replace `backstage-rhaap-common/src/index.ts` with re-exports from new packages |                                                               |
| Update `catalog-backend-module-rhaap` imports → `aap-common` + `aap-node`       |                                                               |
| Update `scaffolder-backend-module-backstage-rhaap` imports → `aap-node`         |                                                               |
| Update `auth-backend-module-rhaap-provider` imports → `aap-node`                |                                                               |
| Update `--embed-package` in each module's `export-dynamic` script               | `aap-common` + `aap-node` instead of `backstage-rhaap-common` |
| Update `packages/backend/src/index.ts` if any module paths change               |                                                               |
| Deprecation notice on `@ansible/backstage-rhaap-common` README                  |                                                               |

**Dependency:** Phases 1–3 complete.

**Verification:** All tests pass, `yarn build`, `yarn lint`, dynamic plugin export succeeds.

---

### Phase 6 — Auth + NFS frontend module (complete)

**Status:** Complete — `@ansible/aap-app-auth` merged on main via PR #880.

| Item                                                        | Status |
| ----------------------------------------------------------- | ------ |
| `aap-app-auth` package created at `workspaces/aap/plugins/` | Done   |
| `pluginId: 'app'` for `SignInPageBlueprint`                 | Done   |
| `SignInPage`, `AAPLogoutButton` as NFS `FrontendModule`     | Done   |
| NFS-only export (`--no-generate-scalprum-assets`)           | Done   |

No further work needed for auth extraction.

---

### Phase 7 — Physical workspace move (partially complete)

The `workspaces/aap/` directory structure already exists on main. All current AAP plugins
are already located under `workspaces/aap/plugins/`. The workspace `package.json` exists.

**Already completed:**

- `workspaces/aap/plugins/` directory with all current AAP plugins
- `workspaces/aap/package.json` workspace definition
- `workspaces/self-service/plugins/portal-scaffolder/` (renamed from `self-service`)
- `workspaces/portal-core/` and `workspaces/apme/` workspace infrastructure

**Remaining (after Phases 1–3):**

- Create new packages (`aap-common`, `aap-node`, `aap-backend`) directly under `workspaces/aap/plugins/`
- Independent workspace `yarn.lock` (currently shared root lockfile — explicit deviation from eventual published-version boundary)
- CI workspace-scoped builds

---

## 6. Contracts Published for Other Teams

| Consumer                     | Contract                                                                                                   | Provided by                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AAP-95785 (catalog split)    | `aap-common` types + `aap-node` `ansibleServiceRef`                                                        | `aap-common`, `aap-node`         |
| AAP-95782 (scaffolder split) | `ansibleServiceRef` + AAP action ID ownership table (§2.4)                                                 | `aap-node` + this guide          |
| Portal SDK effort            | AAP workspace slot in `workspaces/aap/`; no dependency on portal-extension-api                             | This guide                       |
| Content workspace effort     | PAH methods + ScmClient available via deprecated shim until content workspace claims them                  | Shim in `backstage-rhaap-common` |
| PR 744 / RHDH 2.1            | `aap-app-auth` separate FrontendModule; `/ansible` route unchanged                                         | Complete (PR #880)               |
| RHDH operator                | Service ID `rhaap.client.service` unchanged; `--embed-package` targets updated in dynamic plugin manifests | Phase 5                          |
| Template authors             | All `rhaap:*` action IDs unchanged; `aap-api-cloud` autocomplete provider ID unchanged                     | Phase 5 changelog                |

**Semver policy:** Package split is internal packaging — minor bump if action IDs and
service IDs remain stable. Breaking schema changes require major bump + migration guide.

---

## 7. Boundary Agreement Needed Now

The following boundaries must be confirmed with sibling spike owners before implementation
begins:

### 7.1 With NFS auth extraction (complete)

PR 744 has been merged as PR #880. `@ansible/aap-app-auth` is on main with:

1. **`pluginId: 'app'`** for NFS `SignInPageBlueprint` — confirmed.
2. NFS-only export (`--no-generate-scalprum-assets`) — no Scalprum fallback.
3. `/ansible` route exists in the **legacy** `App.tsx` configuration. `AppNfs.tsx` does
   not install the `aap` frontend plugin and there is no alpha entry point for it.
   Native (NFS) availability of the `/ansible` route is separate planned work.

---

## 8. Suggested Sequencing with Sibling Spikes

| This guide phase           | AAP-95785 (catalog)                      | AAP-95782 (scaffolder)                      | Portal SDK effort     |
| -------------------------- | ---------------------------------------- | ------------------------------------------- | --------------------- |
| Phase 0 (inventory)        | Share provider ownership table           | Share action ownership table                | Reference §2.2 layout |
| Phase 1 (aap-common)       | Unblocked — types available              | Unblocked — types available                 | Independent           |
| Phase 2 (aap-node)         | Can start catalog split using `aap-node` | Can start scaffolder split using `aap-node` | Independent           |
| Phase 3 (aap-backend)      | —                                        | —                                           | Independent           |
| Phase 4 (aap frontend)     | —                                        | —                                           | Independent           |
| Phase 5 (shim + migration) | Update imports in catalog module         | Update imports in scaffolder module         | —                     |
| Phase 7 (workspace move)   | Move AAP catalog module together         | Move AAP scaffolder module together         | Workspace infra ready |

**Critical path:** Phases 1–2 unblock both sibling spikes. Prioritize `aap-common` and
`aap-node` to allow parallel work on catalog (95785) and scaffolder (95782) module splits.

---

## 9. Documentation Deliverables

| Document                            | Location                                                      | Status                 |
| ----------------------------------- | ------------------------------------------------------------- | ---------------------- |
| This implementation guide           | `.sdlc/research/aap-integration-implementation-guide.md`      | This file              |
| Phase 0 inventory                   | Inline in §2–3, §3.1–3.6, and Appendix A/B                    | Captured in this guide |
| Decision record                     | Inline in §4.1 (4-package split) and §4.3 (no defaultFactory) | Captured in this guide |
| Cross-spike coordination matrix     | Inline in §8 (sequencing matrix)                              | Captured in this guide |
| Per-package README after split      | `plugins/aap-common/README.md`, `aap-node/README.md`, etc.    | Not started            |
| Dynamic plugin registration guide   | `docs/plugins/aap-integration.md`                             | Not started            |
| Migration guide (old imports → new) | `docs/sdk/migration-aap-packages.md`                          | Not started            |

---

## Appendix A — IAAPService method map (current → target)

| Method                             | AAP Controller? | Target                                                                                                      |
| ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `executePostRequest`               | Yes             | `aap-backend` (on class) + `aap-node` (on interface)                                                        |
| `executeGetRequest`                | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `executeDeleteRequest`             | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getProject`                       | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteProject`                    | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteProjectIfExists`            | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `createProject`                    | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteExecutionEnvironmentExists` | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `createExecutionEnvironment`       | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteExecutionEnvironment`       | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteJobTemplate`                | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `deleteJobTemplateIfExists`        | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `createJobTemplate`                | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `fetchEvents`                      | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `fetchResult`                      | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `launchJobTemplate`                | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `launchJobTemplateNoWait`          | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `logJobStdoutMessages`             | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getJobStatus`                     | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `cancelJob`                        | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `cleanUp`                          | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `checkControllerAvailability`      | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getResourceData`                  | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getJobTemplatesByName`            | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `setLogger`                        | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `rhAAPAuthenticate`                | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `rhAAPRevokeToken`                 | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `fetchProfile`                     | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getOrganizations`                 | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `listSystemUsers`                  | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getTeamsByUserId`                 | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getUserRoleAssignments`           | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `syncJobTemplates`                 | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getOrgsByUserId`                  | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `getUserInfoById`                  | Yes             | `aap-backend` + `aap-node`                                                                                  |
| `isValidPAHRepository`             | **No** (PAH)    | Stays on `IAAPService` during transition; moves to content workspace when content service exists (see §4.2) |
| `syncCollectionsByRepositories`    | **No** (PAH)    | Stays on `IAAPService` during transition; moves to content workspace when content service exists (see §4.2) |

---

## Appendix B — Reference map to source files

| Concern                                  | Path (on `main`)                                                                          | Target package                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Common barrel exports                    | `workspaces/aap/plugins/backstage-rhaap-common/src/index.ts`                              | Replaced by per-package barrels                                    |
| AAPClient class + IAAPService            | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/AAPClient.ts`                | `aap-backend` (class), `aap-node` (interface)                      |
| ansibleServiceRef                        | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPService/AAPService.ts`              | `aap-node`                                                         |
| Permissions (5 basic + settings)         | `workspaces/aap/plugins/backstage-rhaap-common/src/permissions/index.ts`                  | `aap-common` (basic); settings → portal-core                       |
| Wire types (DTOs)                        | `workspaces/aap/plugins/backstage-rhaap-common/src/types/types.ts`                        | `aap-common`                                                       |
| Interfaces (IJobTemplate, ISurvey, etc.) | `workspaces/aap/plugins/backstage-rhaap-common/src/interfaces/`                           | `aap-common` (except `Collection.ts` → content)                    |
| Name formatting utilities                | `workspaces/aap/plugins/backstage-rhaap-common/src/utils/nameFormatting.ts`               | `aap-common`                                                       |
| Constants                                | `workspaces/aap/plugins/backstage-rhaap-common/src/constants.ts`                          | `aap-common` (except `SCM_INTEGRATION_AUTH_FAILED_CODE` → content) |
| Config readers                           | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/utils/config.ts`             | `aap-backend`                                                      |
| Job template helpers                     | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/utils/jobTemplateHelpers.ts` | `aap-backend`                                                      |
| Job stdout helpers                       | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/utils/jobStdoutHelpers.ts`   | `aap-backend`                                                      |
| Mock data                                | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/mockData.ts`                 | `aap-backend`                                                      |
| PAH helpers (out of scope)               | `workspaces/aap/plugins/backstage-rhaap-common/src/AAPClient/pahHelpers.ts`               | Content workspace                                                  |
| ScmClient (out of scope)                 | `workspaces/aap/plugins/backstage-rhaap-common/src/ScmClient/` (11 files)                 | Content workspace                                                  |
| Config schema                            | `workspaces/aap/plugins/backstage-rhaap-common/config.d.ts`                               | Split: AAP keys → `aap-backend`, remainder → content               |
| UserProvisioner service ref + interfaces | `workspaces/aap/plugins/backstage-rhaap-common/src/UserProvisioner/index.ts`              | `aap-node`                                                         |
| Frontend plugin                          | `workspaces/aap/plugins/backstage-rhaap/src/`                                             | `aap` (rename, all files stay)                                     |
| Catalog module registration              | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/module.ts`                       | `catalog-backend-module-aap`                                       |
| Catalog feature loader (alpha.ts)        | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/alpha.ts`                        | `catalog-backend-module-aap` (see §4.3.1)                          |
| Catalog router (~1200 lines)             | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/router.ts`                       | Split: AAP routes stay, content routes leave                       |
| Entity providers                         | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/`                      | AAP providers stay, content providers leave                        |
| Organization resolver                    | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/rhaapOrganizationResolver.ts`    | Stays with catalog module (uses `AAPClient` directly)              |
| Scaffolder module registration           | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`          | `scaffolder-backend-module-aap`                                    |
| Scaffolder actions                       | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/`           | `scaffolder-backend-module-aap`                                    |
| Autocomplete handler                     | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/`      | `scaffolder-backend-module-aap`                                    |
| Auth module                              | `workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/module.ts`                 | `auth-backend-module-aap-provider`                                 |
| User provisioner catalog module          | `workspaces/aap/plugins/catalog-backend-module-rhaap-user-provisioner/src/module.ts`      | `catalog-backend-module-aap-user-provisioner`                      |
| OAuth authenticator                      | `workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/authenticator.ts`          | `auth-backend-module-aap-provider`                                 |
| User job templates router                | `workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/userJobTemplatesRouter.ts` | `auth-backend-module-aap-provider`                                 |
| AAP app auth (NFS)                       | `workspaces/aap/plugins/aap-app-auth/src/`                                                | Already on main — no move needed                                   |
| Backend wiring                           | `workspaces/portal-core/packages/backend/src/index.ts`                                    | `workspaces/aap/packages/backend/src/index.ts`                     |

---

## Appendix C — Architecture validation

### C.1 CEA §2.5 dependency rules — AAP compliance

> **Canonical source:** `ansible-rhdh-plugins` commit
> [`2cbc143`](https://github.com/ansible/ansible-rhdh-plugins/blob/2cbc143ab5064b13edfdb52f409e6395771d1155/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md),
> §2.5 "Sixteen dependency rules, each enforceable as a CI test."

The table below maps each of the 16 canonical rules to AAP's post-split compliance.
Rules that address content-type or source-axis concerns (3, 4, 6, 7, 8, 12–16) are
not directly applicable to the AAP workspace today — AAP is a domain integration, not
a content-type package — but they are listed for completeness.

| #   | Canonical rule (CEA §2.5)                                                                                            | AAP applicability         | Compliance            | Evidence / gap                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `automation-content-common` has no framework dependencies                                                            | `aap-common`              | Compliant after split | `aap-common` will have no Node/React/Backstage runtime deps; today's monolith violates this                                                                                                                                                                                                   |
| 2   | `automation-content-node` names no concrete Git, OCI, Hub, or AAP client                                             | `aap-node`                | Compliant after split | `aap-node` exports service refs and interfaces only; `AAPClient` lives in `aap-backend`                                                                                                                                                                                                       |
| 3   | Content source modules contain no content-type branching                                                             | N/A (axis rule)           | N/A                   | AAP is not a content-source module                                                                                                                                                                                                                                                            |
| 4   | Content type modules use declared capabilities, not source IDs                                                       | N/A (axis rule)           | N/A                   | AAP is not a content-type module                                                                                                                                                                                                                                                              |
| 5   | Frontend, MCP, and Scaffolder never touch modules or the database                                                    | AAP frontend + scaffolder | Compliant             | `aap` frontend is proxy-only; scaffolder accesses AAP via `ansibleServiceRef` DI, not direct DB                                                                                                                                                                                               |
| 6   | MCP imports only the REST client                                                                                     | N/A                       | N/A                   | AAP does not produce an MCP package                                                                                                                                                                                                                                                           |
| 7   | Catalog annotations are not canonical primitive storage                                                              | AAP catalog entities      | Compliant             | AAP entity providers write full entities; annotations are metadata, not the source of truth                                                                                                                                                                                                   |
| 8   | Scaffolder fields call a registered operation, never a URL                                                           | AAP scaffolder fields     | **Transitional**      | Backend actions use `ansibleServiceRef` (compliant). Frontend fields (`AAPResourcePicker`, `CollectionsPicker`) call `scaffolderApi.autocomplete` with `provider: 'aap-api-cloud'`, not Portal's registered-operation dispatcher. Field transport migration deferred to self-service sibling. |
| 9   | `self-service` imports no content-type package                                                                       | N/A                       | N/A                   | AAP does not own `self-service`                                                                                                                                                                                                                                                               |
| 10  | No package imports across a workspace boundary except via a published version                                        | AAP workspace             | **Deviation**         | Shared root `yarn.lock` with `workspace:^` refs today; true published-version boundary deferred to Phase 7. Recorded as deliberate deviation.                                                                                                                                                 |
| 11  | Every `package.json` declares a `backstage.role` from the canonical set                                              | All AAP packages          | Compliant after split | Split packages will declare `common-library`, `node-library`, `backend-plugin`, `frontend-plugin`                                                                                                                                                                                             |
| 12  | OCI packaging logic lives only in a `content-type-*-common` package                                                  | N/A (content axis)        | N/A                   | AAP does not own OCI packaging                                                                                                                                                                                                                                                                |
| 13  | Registry writes happen only in an `…-backend-module-source-*` package                                                | N/A (content axis)        | N/A                   | AAP does not write to registries                                                                                                                                                                                                                                                              |
| 14  | Publish writes to the registry, then triggers normal ingest; never writes a content record directly                  | N/A (content axis)        | N/A                   | AAP does not publish content                                                                                                                                                                                                                                                                  |
| 15  | Content-type adapter imports only `content-model`, `automation-content-node`, and its own `-common`                  | N/A (content axis)        | N/A                   | AAP is not a content-type adapter                                                                                                                                                                                                                                                             |
| 16  | Every governable immutable artifact contains its digest; logical projections are mapped to digest-keyed observations | N/A (content axis)        | N/A                   | AAP does not manage digest-keyed artifacts                                                                                                                                                                                                                                                    |

### C.2 AAP-specific architecture checks

These are additional checks specific to the AAP workspace, derived from CEA principles
but not directly enumerated in §2.5. They cover AAP layering, dynamic plugin embedding,
and workspace hygiene.

| #   | Check                                   | Status                  | Evidence                                                                                                                                             |
| --- | --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No circular deps between workspaces     | Compliant               | `aap` workspace is a leaf; depends only on Backstage core                                                                                            |
| 2   | Frontend must not import backend        | Compliant               | `aap` frontend has no common import; proxy-only communication                                                                                        |
| 3   | Backend must not import frontend        | Compliant               | No backend module imports frontend plugin                                                                                                            |
| 4   | Workspace-scoped lockfiles              | **Deviation**           | Shared root `yarn.lock` today; independent lockfile deferred to Phase 7. This deviates from the CEA's eventual published-version workspace boundary. |
| 5   | Permissions registered by owning module | Transitional            | AAP module registers all 5 + settings; should register only 2 long-term                                                                              |
| 6   | Config schema co-located with reader    | Compliant after split   | `aap-backend/config.d.ts` covers AAP paths only                                                                                                      |
| 7   | Dynamic plugin: embed or shared         | Compliant after Phase 5 | `--embed-package aap-common aap-node`; catalog also embeds `aap-backend` (§4.7)                                                                      |
| 8   | Published packages have changelog       | Not started             | Follow-on for implementation stories                                                                                                                 |
| 9   | Test isolation per workspace            | Compliant after Phase 7 | Workspace-scoped `yarn test`                                                                                                                         |
| 10  | CI must validate workspace boundaries   | Not started             | ESLint import-boundary rules needed                                                                                                                  |
| 11  | Plugin ID stability across renames      | Planned                 | `ansible` (frontend), `rhaap` (auth provider), service ID unchanged                                                                                  |
