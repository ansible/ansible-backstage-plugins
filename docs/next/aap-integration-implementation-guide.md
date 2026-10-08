# AAP Integration Re-Architecture — Implementation Guide

> **Canonical architecture:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) (§2.2 workspace layout, §2.5 dependency rules, §7.3–7.4 AAP provider/keep-leave boundaries)
> **Related Jira:** [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) (this spike — AAP integration research), [AAP-95782](https://redhat.atlassian.net/browse/AAP-95782) (scaffolder split), [AAP-95785](https://redhat.atlassian.net/browse/AAP-95785) (catalog split), [AAP-95616](https://redhat.atlassian.net/browse/AAP-95616) (Research Spikes Epic)
> **Companion docs (under `docs/next/`):** [ANSTRAT-2497 portal implementation guide](https://github.com/abhikdps/ansible-backstage-plugins/tree/anstrat-2497-poc/docs/next/anstrat-2497-implementation-guide.md), [Scaffolder implementation guide](https://github.com/ansible/ansible-backstage-plugins/pull/801) (PR 801)
> **Related PRs:** [PR #744](https://github.com/ansible/ansible-backstage-plugins/pull/744) (RHDH 2.1 NFS migration + `rhaap-app-auth`), [PR #801](https://github.com/ansible/ansible-backstage-plugins/pull/801) (scaffolder implementation guide)
> **Status:** Research complete — 4-package layer split recommended
> **Branch baseline:** `main` in `ansible-backstage-plugins`
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

2. **`aap-node`** — `IAAPService` interface (stripped of PAH methods) and
   `ansibleServiceRef` (Backstage service reference). Backend modules depend on this
   to interact with AAP — never on the concrete client.

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

- Content management (PAH collections, git repository browsing, OCI adapters) → ANSTRAT-1758
- Self-service UI, scaffolder field extensions, EE definition catalog → ANSTRAT-2497 / portal-scaffolder
- Portal SDK (`portal-extension-common`, `portal-extension-api`, `portal-plugin-sdk`) → ANSTRAT-2497
- Physically splitting the catalog module into AAP + content providers → AAP-95785
- Physically splitting the scaffolder module into AAP + self-service actions → AAP-95782
- Repo rename to `automation-portal-plugins` and `workspaces/` physical move → ANSTRAT-2497 Phase 7

---

## 2. Current Baseline (What Ships Today)

### 2.1 Common library — `@ansible/backstage-rhaap-common`

Single `common-library` package that bundles **everything shared** across all plugins.
This is the core problem — it mixes AAP concerns with content concerns, frontend-safe
types with backend-only implementations, and interface contracts with concrete clients.

**Barrel exports** (`src/index.ts`):

| Re-export | Contents | Architecture bucket |
| --- | --- | --- |
| `./AAPClient` | `AAPClient` class, `IAAPService` interface, `mockData` (test fixtures), config readers (`getAnsibleConfig`, `getCatalogConfig`) | `aap-backend` (class + config readers) / `aap-node` (interface) |
| `./AAPService` | `ansibleServiceRef` + `createServiceFactory` | `aap-node` |
| `./interfaces` | `IJobTemplate`, `Collection`, `ISurvey`, `InstanceGroup`, `AAPTemplate` | `aap-common` (AAP types); `Collection` → content |
| `./types` | ~30 DTOs: `Organization`, `Project`, `JobTemplate`, `ExecutionEnvironment`, `LaunchJobTemplate`, `CleanUp`, `User`, `Team`, config types, `TokenResponse`, etc. | `aap-common` (AAP DTOs); `Collections` type → content |
| `./constants` | `TERMINAL_JOB_STATUSES`, `SCM_INTEGRATION_AUTH_FAILED_CODE`, verbosity helpers, `compareVersions` | `aap-common` (job constants); SCM constant → content |
| `./ScmClient` | `ScmClient` interface, `BaseScmClient`, `GithubClient`, `GitlabClient`, `ScmClientFactory`, `createGithubClientForWorkflowDispatch`, `resolveGithubToken`, SCM types | **Out of AAP** → content workspace |
| `./permissions` | 5 `BasicPermission` exports (EE, git-repos, collections, templates, history) | `aap-common` (templates, history); others leave eventually |
| `./utils/nameFormatting` | `sanitizeAapName`, `sanitizeAapUsername`, `toOrgEntityName`, `toTeamEntityName`, `toTemplateEntityName`, `toWorkflowEntityName`, `toUserEntityName`, `toUserEntityRef`, `toSourceNamespace`, `toOrgGroupRef`, `toTeamGroupRef`, `CatalogEntityIdentityOptions`, etc. | `aap-common` |

**Key problems:**
- `AAPClient` class is in the same package as types consumed by frontend plugins
- `ScmClient` (GitHub/GitLab) has nothing to do with AAP Controller
- PAH helper methods (`isValidPAHRepository`, `syncCollectionsByRepositories`, `pahHelpers.ts`) are on `AAPClient` but belong to content
- `IAAPService` interface includes PAH methods (`isValidPAHRepository`, `syncCollectionsByRepositories`) that must be stripped
- `Collection` interface/type crosses the content boundary
- 5 permissions are registered together, but only `templates.view` and `history.view` are purely AAP

**Consumers today** (all use `@ansible/backstage-rhaap-common` via `workspace:^`):

| Consumer | What it imports |
| --- | --- |
| `catalog-backend-module-rhaap` | `ansibleServiceRef`, `IAAPService`, `ansiblePermissions`, individual permission objects, `ScmClientFactory`, `SCM_INTEGRATION_AUTH_FAILED_CODE`, `GitlabClient`, `resolveGithubToken`, `createGithubClientForWorkflowDispatch`, `resolveActiveOrganizations`, types (`Organization`, `User`, `Team`, `RoleAssignments`, `IJobTemplate`, `ISurvey`, `InstanceGroup`, `Collection`, `CatalogEntityIdentityOptions`), name utilities (`sanitizeAapName`, `toOrgEntityName`, `toTeamEntityName`, `toUserEntityRef`, `toOrgGroupRef`, `toTeamGroupRef`, `toSourceNamespace`, `DEFAULT_CATALOG_ENTITY_SOURCE`), `compareVersions` |
| `scaffolder-backend-module-backstage-rhaap` | `ansibleServiceRef`, `IAAPService`, types (`CleanUp`, `ExecutionEnvironment`, `LaunchJobTemplate`, `Collections`, `SourceVersionDetail`), `TERMINAL_JOB_STATUSES`, `ScmClientFactory`, `getAnsibleConfig`, `getVerbosityLevels` |
| `auth-backend-module-rhaap-provider` | `ansibleServiceRef`, `IAAPService`, `toUserEntityName` |

**`export-dynamic` flag:** All three backend modules use `--embed-package @ansible/backstage-rhaap-common` — the common package is bundled into each dynamic plugin artifact.

### 2.2 Frontend — `@ansible/plugin-backstage-rhaap`

Frontend plugin (`backstage.role: frontend-plugin`, `pluginId: ansible`) providing the
`/ansible` landing page with sidebar navigation.

**Components:**

| Component | Purpose |
| --- | --- |
| `AnsiblePage` | Routable extension at `/ansible` — tabbed layout (Overview, Catalog, Learn, Create) |
| `AppThemeFixer` | Component extension — fixes MUI theme in RHDH context |
| `OverviewContent` | Landing page: QuickAccessCard, Favourites |
| `CatalogContent` | Catalog browsing tab |
| `LearnContent` | Documentation/learning tab |
| `CreateContent` | Content creation tab |
| `AnsibleLogo`, `WorkspaceIcon`, `DocumentIcon` | Branding assets |
| `RatingFeedbackModal` | User feedback dialog |

**Dependencies on common:** None at runtime — this plugin does not import
`@ansible/backstage-rhaap-common`. It communicates with backend via Backstage
proxy/API routes.

**Dynamic plugin export:** `rhdh-cli plugin export` (in `package.json` scripts).

### 2.3 Backend — `@ansible/backstage-plugin-catalog-backend-module-rhaap`

One `createBackendModule({ pluginId: 'catalog', moduleId: 'rhaap' })` that registers
**all** entity providers, permissions, field validators, and a large HTTP router.

**Entity providers registered in `module.ts`:**

| Provider | Data source | Target after split |
| --- | --- | --- |
| `AAPEntityProvider` | AAP Controller orgs, teams, users | **AAP** (`catalog-backend-module-aap`) |
| `AAPJobTemplateProvider` | AAP Controller job templates + surveys | **AAP** (`catalog-backend-module-aap`) |
| `EEEntityProvider` | Push-based from scaffolder (no AAP REST) | **Self-service** (`scaffolder-backend-module-self-service`) |
| `PAHCollectionProvider` | Private Automation Hub collections | **Content** (ANSTRAT-1758) |
| `AnsibleGitContentsProvider` | SCM repositories (GitHub/GitLab) | **Content** (ANSTRAT-1758) |

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

| Action ID | File | Target after split |
| --- | --- | --- |
| `ansible:content:create` | `actions/ansible.ts` | TBD — creator-service; keep with self-service |
| `ansible:create:ee-definition` | `actions/createEEDefinition.ts` | `scaffolder-backend-module-self-service` |
| `ansible:prepare:publish` | `actions/prepareForPublish.ts` | `scaffolder-backend-module-self-service` |
| `rhaap:create-project` | `actions/aapCreateProject.ts` | **`scaffolder-backend-module-aap`** |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts` | **`scaffolder-backend-module-aap`** |
| `rhaap:create-job-template` | `actions/aapCreateJobTemplate.ts` | **`scaffolder-backend-module-aap`** |
| `rhaap:launch-job-template` | `actions/aapLaunchJobTemplate.ts` | **`scaffolder-backend-module-aap`** |
| `rhaap:clean-up` | `actions/aapCleanUp.ts` | **`scaffolder-backend-module-aap`** |

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
- `AAPAuthSignInResolvers` creates users in Backstage catalog
- `createUserJobTemplatesRouter` exposes `GET /rhaap/user-job-templates` for the frontend

**Dependencies:** `@ansible/backstage-rhaap-common` (for `ansibleServiceRef`),
`@backstage/plugin-auth-node`.

### 2.6 Frontend — `rhaap-app-auth` (PR 744 branch, not yet on main)

PR 744 introduces a new package for RHDH 2.1 Native Federation Scope (NFS):

- `pluginId: 'app'` — required by Backstage `SignInPageBlueprint`
- Provides `SignInPage` and `AAPLogoutButton` as frontend modules
- Must remain a **separate** frontend module (cannot merge into `aap` plugin which has
  `pluginId: 'ansible'`)
- Cookie-parser middleware for session management

This package is **not in the architecture §2.2 layout** but is required for RHDH 2.1
compatibility. Target name: `aap-app-auth` (under `workspaces/aap/`).

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
    ├── aap-common/                          common-library
    │     Wire types: Organization, Project, JobTemplate, ExecutionEnvironment,
    │     LaunchJobTemplate, CleanUp, User, Team, TokenResponse, AAPTemplate,
    │     ISurvey, InstanceGroup, IJobTemplate.
    │     Permissions: templatesViewPermission, historyViewPermission
    │       (+ temporary re-exports of EE/git/collections permissions during migration).
    │     Utilities: sanitizeAapName, sanitizeAapUsername, toOrgEntityName,
    │       toTeamEntityName, toTemplateEntityName, toWorkflowEntityName,
    │       toUserEntityName, toUserEntityRef, toSourceNamespace, entity ref builders.
    │     Constants: TERMINAL_JOB_STATUSES, getVerbosityLevels, compareVersions.
    │     Config types: AnsibleConfig, RHAAPConfig, CatalogConfig.
    │     No Node.js runtime. No React. No HTTP. No dependencies beyond
    │       @backstage/plugin-permission-common and @backstage/integration (for config types).
    │
    ├── aap-node/                            node-library
    │     IAAPService interface (Pick<AAPClient, ...> minus PAH methods).
    │     ansibleServiceRef (createServiceRef, NO defaultFactory).
    │     Depends on: aap-common (for types), @backstage/backend-plugin-api.
    │     Must NOT contain AAPClient class, service factory, or any HTTP code.
    │     Consumers: catalog-backend-module-aap, scaffolder-backend-module-aap,
    │       auth-backend-module-aap-provider — all via ansibleServiceRef DI.
    │
    ├── aap-backend/                         backend-plugin
    │     AAPClient class (full HTTP implementation against AAP Controller).
    │     ansibleServiceFactory (createServiceFactory for ansibleServiceRef).
    │     pahHelpers.ts removed (PAH methods → content workspace).
    │     Config readers: getAnsibleConfig, getCatalogConfig.
    │     Job stdout helpers, job template helpers.
    │     Service factory that backs ansibleServiceRef.
    │     export-dynamic: standalone dynamic plugin (no --embed-package needed
    │       if aap-common + aap-node are in sharedPackages).
    │
    ├── aap/                                 frontend-plugin
    │     Plugin ID: 'ansible' (unchanged for URL stability).
    │     Routes: /ansible (AnsiblePage, Overview, Catalog, Learn, Create).
    │     AppThemeFixer component extension.
    │     Branding: AnsibleLogo, WorkspaceIcon, DocumentIcon.
    │     No dependency on aap-common or aap-node (communicates via proxy).
    │
    ├── aap-app-auth/                        frontend-plugin
    │     Plugin ID: 'app' (NFS SignInPageBlueprint constraint).
    │     SignInPage, AAPLogoutButton as FrontendModules.
    │     Cookie-parser middleware.
    │     From PR 744 rhaap-app-auth, renamed.
    │
    ├── auth-backend-module-aap-provider/    backend-plugin-module
    │     OAuth provider (providerId: 'rhaap').
    │     aapAuthAuthenticator, sign-in resolvers.
    │     User job templates router.
    │     Depends on: aap-node (ansibleServiceRef).
    │
    ├── catalog-backend-module-aap/          backend-plugin-module
    │     AAPEntityProvider (orgs, teams, users).
    │     AAPJobTemplateProvider (job templates, surveys, instance groups).
    │     SyncStateTracker (architecture §7.4 says content, but only used by AAP providers today — needs explicit decision).
    │     AAP-only permissions registration (templates, history).
    │     AAP-only router endpoints (sync triggers, CI activity for AAP entities).
    │     Depends on: aap-node (ansibleServiceRef), aap-common (types).
    │     Does NOT contain: PAHCollectionProvider, AnsibleGitContentsProvider,
    │       EEEntityProvider, collection/git routes, ScmClient.
    │
    └── scaffolder-backend-module-aap/       backend-plugin-module
          Actions: rhaap:create-project, rhaap:create-execution-environment,
            rhaap:create-job-template, rhaap:launch-job-template, rhaap:clean-up.
          Template filters: useCaseNameFilter, resourceFilter,
            multiResourceFilter, uuidFilter.
          Autocomplete: AAP resource branch of aap-api-cloud provider
            (organizations, inventories, projects, credentials, job_templates,
            execution_environments, verbosity, aaphostname).
          Depends on: aap-node (ansibleServiceRef), aap-common (types).
```

**Naming migration:**

| Current package | Target package | Notes |
| --- | --- | --- |
| `@ansible/backstage-rhaap-common` | Split into `aap-common` / `aap-node` / `aap-backend` | Re-export shim from old name during transition |
| `@ansible/plugin-backstage-rhaap` | `@ansible/plugin-aap` (or keep name, move directory) | Plugin ID `ansible` unchanged |
| `@ansible/backstage-plugin-auth-backend-module-rhaap-provider` | `@ansible/backstage-plugin-auth-backend-module-aap-provider` | Provider ID `rhaap` unchanged for operator compat |
| `@ansible/backstage-plugin-catalog-backend-module-rhaap` | `@ansible/backstage-plugin-catalog-backend-module-aap` | Module ID: `aap` (was `rhaap`) |
| `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` | `@ansible/plugin-scaffolder-backend-module-aap` | Module ID: `aap` (was `ansible`) |
| _(PR 744)_ `rhaap-app-auth` | `@ansible/plugin-aap-app-auth` | New package, NFS only |

---

## 4. Design Decisions (Architecture-Aligned)

### 4.1 Four-package layer split

Architecture §2.5 rule 2 requires that `common-library` packages contain only isomorphic
code (no Node.js, no React). Today's `backstage-rhaap-common` contains `AAPClient`
(Node.js `undici` fetch), `ansibleServiceRef` (Node.js `@backstage/backend-plugin-api`),
and `ScmClient` (Node.js) — all of which violate this rule.

The recommended split separates concerns into clean layers:

| Package | Layer | What it holds |
| --- | --- | --- |
| `aap-common` | Isomorphic (types only) | DTOs, permissions, name formatting, constants — no Node.js, no React |
| `aap-node` | Node interface | `IAAPService` interface + `ansibleServiceRef` — no HTTP implementation |
| `aap-backend` | Node implementation | `AAPClient` class, config readers, job helpers — the only package that calls AAP |
| `aap` | Frontend | `/ansible` UI — communicates via proxy, no direct AAP imports |

This ensures backend modules import only `aap-node` (interface via DI), the frontend
imports nothing from common, and `aap-common` is safe to use in any environment.

### 4.2 IAAPService interface — strip PAH methods

The current `IAAPService` interface exposes 37 methods via `Pick<AAPClient, ...>`.
Two of these are PAH (Private Automation Hub) methods that cross the content boundary:

```typescript
// REMOVE from IAAPService in aap-node:
| 'isValidPAHRepository'
| 'syncCollectionsByRepositories'
```

These methods, along with `pahHelpers.ts`, move to the content workspace when
ANSTRAT-1758 ships. Until then, they can remain on `AAPClient` in `aap-backend`
as internal implementation but **must not** appear on the published `IAAPService`
interface in `aap-node`.

**Methods that stay on IAAPService** (35 total):

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
  id: 'rhaap.client.service',   // DO NOT rename — operator configs reference this
  scope: 'plugin',
  // No defaultFactory — aap-backend must be registered to provide this service.
});
```

```typescript
// aap-backend/src/service.ts — factory lives here, next to the implementation
import { createServiceFactory, coreServices } from '@backstage/backend-plugin-api';
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
backend.add(import('@ansible/aap-backend'));   // provides ansibleServiceRef factory
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

### 4.4 Permissions — phased migration

Today `backstage-rhaap-common/src/permissions.ts` exports 5 permissions:

| Permission | AAP-owned? | Notes |
| --- | --- | --- |
| `ansible.templates.view` | **Yes** | Job template listing |
| `ansible.history.view` | **Yes** | Job execution history |
| `ansible.execution-environments.view` | Transitional | EE listing — moves to self-service eventually |
| `ansible.git-repositories.view` | Transitional | Git repos — moves to content eventually |
| `ansible.collections.view` | Transitional | Collections — moves to content eventually |

**Phase 1:** All 5 permissions move to `aap-common` and continue to be registered by
the AAP catalog module. This preserves backward compatibility.

**Phase 2 (follow-on):** As content and self-service workspaces stand up their own
catalog modules, permissions transfer to their respective owners. `aap-common` keeps
only `templates.view` and `history.view`.

### 4.5 ScmClient — explicitly out of AAP

`ScmClient`, `BaseScmClient`, `GithubClient`, `GitlabClient`, `ScmClientFactory`, and
all SCM types are **not AAP concerns**. They serve `AnsibleGitContentsProvider` (content)
and scaffolder publish actions (self-service).

**Migration:** ScmClient moves to the content workspace when ANSTRAT-1758 creates
`automation-content-client` or equivalent. Until then, it remains in `backstage-rhaap-common`
behind a re-export shim — the AAP packages do not import it.

### 4.6 Config schema — split by consumer

The `config.d.ts` config schema (read by `getAnsibleConfig` and `getCatalogConfig`) mixes
AAP connection settings with content-specific settings:

| Config path | Owner |
| --- | --- |
| `ansible.rhaap.baseUrl` | AAP |
| `ansible.rhaap.token` | AAP |
| `ansible.rhaap.checkSSL` | AAP |
| `ansible.rhaap.showCaseLocation.*` | Self-service (scaffolder) |
| `ansible.devSpaces.*` | Self-service |
| `ansible.automationHub.*` | Content |
| `ansible.creatorService.*` | Self-service |
| `ansible.feedback.*` | Portal core |
| `catalog.providers.rhaap.*.orgs` | AAP catalog module |
| `catalog.providers.rhaap.*.sync.jobTemplates.*` | AAP catalog module |

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

This is a direct replacement — one shared common package becomes two, both still embedded
by every AAP backend module that needs them.

### 4.8 Frontend URL stability

The `aap` frontend plugin keeps `pluginId: 'ansible'` and mounts at `/ansible`. No URL
changes. The `rootRouteRef` is preserved. Sidebar items that render conditionally based on
permissions continue to work — they check permissions via the Backstage permission
framework, not by importing from the common library.

### 4.9 Backward compatibility shim

During the transition, `@ansible/backstage-rhaap-common` becomes a thin re-export shim:

```typescript
// backstage-rhaap-common/src/index.ts (transition period)
export * from '@ansible/aap-common';
export * from '@ansible/aap-node';
export { AAPClient } from '@ansible/aap-backend';
export * from './ScmClient';  // stays here until content workspace claims it
```

This ensures that any unconverted consumer (external forks, RHDH operator entries) does
not break immediately. The shim is deprecated from day one and removed once all consumers
have migrated.

---

## 5. Ordered Work Packages

Phases are sequenced by dependency. Phase 1 can start immediately; Phase 4 depends on
sibling spikes.

### Phase 0 — Inventory and contract freeze (this spike)

**Output:** Complete inventory of every export, method, type, config path, and permission
in `backstage-rhaap-common`, classified into target packages. Decision record.

| Item | Status |
| --- | --- |
| Inventory of `backstage-rhaap-common` barrel exports | Done — `exports.yaml` |
| Classify each export as KEEP (aap-common) / MOVE (aap-node, aap-backend) / REMOVE (content, self-service) | Done |
| IAAPService method audit (37 methods → 35 AAP + 2 PAH) | Done |
| Permission audit (5 permissions, 2 purely AAP) | Done |
| Config path ownership map | Done |
| ScmClient classification (out of AAP) | Done |
| Decision record — 4-package split accepted | Done |
| Cross-spike dependency matrix with AAP-95782, AAP-95785 | Done |
| Document PR 744 constraints on frontend/auth packaging | Done |

---

### Phase 1 — Create `aap-common` (types-only package)

**Output:** `@ansible/aap-common` common-library package with zero Node.js/React dependencies.

| Item | Source | Notes |
| --- | --- | --- |
| Create `plugins/aap-common/` with `backstage.role: common-library` | New | Package name `@ansible/aap-common` |
| Move types from `backstage-rhaap-common/src/types/types.ts` | AAP DTOs only | Exclude `Collections` type (→ content) |
| Move interfaces from `backstage-rhaap-common/src/interfaces/` | AAP interfaces | `IJobTemplate`, `ISurvey`, `InstanceGroup`, `AAPTemplate`; exclude `Collection` |
| Move `permissions.ts` (all 5 initially) | Whole file | Phase 2 strips to 2 AAP-only |
| Move `utils/nameFormatting.ts` | Whole file + tests | All sanitizers and entity name builders |
| Move AAP constants from `constants.ts` | `TERMINAL_JOB_STATUSES`, verbosity, `compareVersions` | Leave `SCM_INTEGRATION_AUTH_FAILED_CODE` for content |
| Move config types (`AnsibleConfig`, `CatalogConfig`, `RHAAPConfig`) | From `types/types.ts` | Type definitions only, not readers |
| Add `package.json` exports map | `./`, `./permissions`, `./constants` | Match current subpath exports |
| Unit tests for nameFormatting | Move existing tests | |

**Dependency:** None — can start immediately.

**Verification:** `yarn tsc` succeeds, `aap-common` has no `undici`, `express`, or React imports.

---

### Phase 2 — Create `aap-node` (interface + service ref)

**Output:** `@ansible/aap-node` node-library package with `IAAPService` and `ansibleServiceRef`.

| Item | Source | Notes |
| --- | --- | --- |
| Create `plugins/aap-node/` with `backstage.role: node-library` | New | Package name `@ansible/aap-node` |
| Move `IAAPService` interface | `AAPClient/AAPClient.ts` | Strip `isValidPAHRepository`, `syncCollectionsByRepositories` from Pick list |
| Move `ansibleServiceRef` (without `defaultFactory`) | `AAPService/AAPService.ts` | Keep service ID `rhaap.client.service`; no factory — see §4.3 |
| Peer dependency on `@ansible/aap-common` | Types | |
| Peer dependency on `@backstage/backend-plugin-api` | `createServiceRef` only | |

**Dependency:** Phase 1 (`aap-common` types exist).

**Verification:** `yarn tsc` succeeds, no `undici` or `fetch` imports in `aap-node`.

---

### Phase 3 — Create `aap-backend` (client implementation)

**Output:** `@ansible/aap-backend` backend-plugin package with `AAPClient` class and `ansibleServiceFactory`.

| Item | Source | Notes |
| --- | --- | --- |
| Create `plugins/aap-backend/` with `backstage.role: backend-plugin` | New | Package name `@ansible/aap-backend` |
| Move `AAPClient` class | `AAPClient/AAPClient.ts` | Full implementation |
| Create `ansibleServiceFactory` | New | `createServiceFactory` for `ansibleServiceRef` — see §4.3 |
| Move `utils/config.ts` (`getAnsibleConfig`, `getCatalogConfig`) | `AAPClient/utils/config.ts` | AAP config readers |
| Move `utils/jobStdoutHelpers.ts` | `AAPClient/utils/` | + tests |
| Move `utils/jobTemplateHelpers.ts` | `AAPClient/utils/` | + tests |
| Remove PAH methods from `AAPClient` | `isValidPAHRepository`, `syncCollectionsByRepositories`, `pahHelpers.ts` | Move to content workspace or leave on deprecated shim |
| Move `AAPClient.test.ts`, `mockData.ts` | `AAPClient/` | Adapt imports |
| Dependency on `@ansible/aap-common` + `@ansible/aap-node` | | |
| Runtime deps: `undici`, `yaml`, `lodash.uniqby` | From current common | |
| `config.d.ts` schema: `ansible.rhaap.*` + `catalog.providers.rhaap.*` only | Split from current | |

**Dependency:** Phase 2 (`aap-node` interface exists for `implements IAAPService`).

**Verification:** `AAPClient.test.ts` passes, `export-dynamic` builds.

---

### Phase 4 — Rename frontend to `aap`

**Output:** `@ansible/plugin-aap` frontend plugin (or keep name, physically move directory).

| Item | Source | Notes |
| --- | --- | --- |
| Move `plugins/backstage-rhaap/` → `plugins/aap/` | Directory rename | Or create new, copy files |
| Update `package.json` name | `@ansible/plugin-aap` | Keep `pluginId: 'ansible'` |
| Verify no imports from `backstage-rhaap-common` | Current: none | Confirm stays clean |
| Update `export-dynamic` script if package name changes | | |
| Update `packages/app/src/App.tsx` import path | | |

**Dependency:** None (frontend is independent of backend splits).

**Verification:** `yarn start` loads `/ansible` page, all frontend tests pass.

---

### Phase 5 — Backward compatibility shim + consumer migration

**Output:** `backstage-rhaap-common` becomes re-export shim; all backend modules import
from `aap-common` / `aap-node`.

| Item | Notes |
| --- | --- |
| Replace `backstage-rhaap-common/src/index.ts` with re-exports from new packages | |
| Update `catalog-backend-module-rhaap` imports → `aap-common` + `aap-node` | |
| Update `scaffolder-backend-module-backstage-rhaap` imports → `aap-node` | |
| Update `auth-backend-module-rhaap-provider` imports → `aap-node` | |
| Update `--embed-package` in each module's `export-dynamic` script | `aap-common` + `aap-node` instead of `backstage-rhaap-common` |
| Update `packages/backend/src/index.ts` if any module paths change | |
| Deprecation notice on `@ansible/backstage-rhaap-common` README | |

**Dependency:** Phases 1–3 complete.

**Verification:** All tests pass, `yarn build`, `yarn lint`, dynamic plugin export succeeds.

---

### Phase 6 — Auth + NFS frontend module

**Output:** `aap-app-auth` frontend module aligned with PR 744.

| Item | Notes |
| --- | --- |
| Integrate PR 744 `rhaap-app-auth` package | Rename to `aap-app-auth` if agreed |
| Verify `pluginId: 'app'` for `SignInPageBlueprint` | NFS requirement |
| `SignInPage`, `AAPLogoutButton` as `FrontendModule` | |
| Cookie-parser middleware | |
| Test: NFS login flow + Scalprum fallback | |
| Document in RHDH `dynamic-plugins.yaml`: disable stock `app-auth`, enable `aap-app-auth` | |

**Dependency:** PR 744 merged (or cherry-picked).

---

### Phase 7 — Physical workspace move

Coordinate with ANSTRAT-2497 Phase 7 (rename and restructure):

- `plugins/aap-common/` → `workspaces/aap/plugins/aap-common/`
- `plugins/aap-node/` → `workspaces/aap/plugins/aap-node/`
- `plugins/aap-backend/` → `workspaces/aap/plugins/aap-backend/`
- `plugins/aap/` → `workspaces/aap/plugins/aap/`
- AAP backend modules → `workspaces/aap/plugins/`
- Workspace `package.json` + independent `yarn.lock`
- CI workspace-scoped builds

**Dependency:** ANSTRAT-2497 workspace infrastructure ready.

---

## 6. Contracts Published for Other Teams

| Consumer | Contract | Provided by |
| --- | --- | --- |
| AAP-95785 (catalog split) | `aap-common` types + `aap-node` `ansibleServiceRef` | `aap-common`, `aap-node` |
| AAP-95782 (scaffolder split) | `ansibleServiceRef` + AAP action ID ownership table (§2.4) | `aap-node` + this guide |
| ANSTRAT-2497 (portal SDK) | AAP workspace slot in `workspaces/aap/`; no dependency on portal-extension-api | This guide |
| ANSTRAT-1758 (content) | PAH methods + ScmClient available via deprecated shim until content workspace claims them | Shim in `backstage-rhaap-common` |
| PR 744 / RHDH 2.1 | `aap-app-auth` separate FrontendModule; `/ansible` route unchanged | Phase 6 |
| RHDH operator | Service ID `rhaap.client.service` unchanged; `--embed-package` targets updated in dynamic plugin manifests | Phase 5 |
| Template authors | All `rhaap:*` action IDs unchanged; `aap-api-cloud` autocomplete provider ID unchanged | Phase 5 changelog |

**Semver policy:** Package split is internal packaging — minor bump if action IDs and
service IDs remain stable. Breaking schema changes require major bump + migration guide.

---

## 7. Boundary Agreement Needed Now

The following boundaries must be confirmed with sibling spike owners before implementation
begins:

### 7.1 With PR 744 (Nilashish)

1. **`rhaap-app-auth`** becomes `aap-app-auth` — package rename timing.
2. **`pluginId: 'app'`** must remain for NFS `SignInPageBlueprint`.
3. Dual Scalprum + NFS exports preserved during transition.
4. `/ansible` alpha wiring not broken by package renames.

---

## 8. Suggested Sequencing with Sibling Spikes

| This guide phase | AAP-95785 (catalog) | AAP-95782 (scaffolder) | ANSTRAT-2497 (portal) |
| --- | --- | --- | --- |
| Phase 0 (inventory) | Share provider ownership table | Share action ownership table | Reference §2.2 layout |
| Phase 1 (aap-common) | Unblocked — types available | Unblocked — types available | Independent |
| Phase 2 (aap-node) | Can start catalog split using `aap-node` | Can start scaffolder split using `aap-node` | Independent |
| Phase 3 (aap-backend) | — | — | Independent |
| Phase 4 (aap frontend) | — | — | Independent |
| Phase 5 (shim + migration) | Update imports in catalog module | Update imports in scaffolder module | — |
| Phase 7 (workspace move) | Move AAP catalog module together | Move AAP scaffolder module together | Workspace infra ready |

**Critical path:** Phases 1–2 unblock both sibling spikes. Prioritize `aap-common` and
`aap-node` to allow parallel work on catalog (95785) and scaffolder (95782) module splits.

---

## 9. Documentation Deliverables

| Document | Location | Status |
| --- | --- | --- |
| This implementation guide | `docs/next/aap-integration-implementation-guide.md` | This file |
| Phase 0 inventory (YAML) | Spike working tree (`inventory/exports.yaml`) | Done |
| Decision record | Spike working tree (`decisions/ADR-module-boundaries.md`) | Done |
| Cross-spike coordination matrix | Spike working tree (`09-CROSS-SPIKE-COORDINATION.md`) | Done |
| Per-package README after split | `plugins/aap-common/README.md`, `aap-node/README.md`, etc. | Not started |
| Dynamic plugin registration guide | `docs/plugins/aap-integration.md` | Not started |
| Migration guide (old imports → new) | `docs/sdk/migration-aap-packages.md` | Not started |

---

## Appendix A — IAAPService method map (current → target)

| Method | AAP Controller? | Target |
| --- | --- | --- |
| `executePostRequest` | Yes | `aap-backend` (on class) + `aap-node` (on interface) |
| `executeGetRequest` | Yes | `aap-backend` + `aap-node` |
| `executeDeleteRequest` | Yes | `aap-backend` + `aap-node` |
| `getProject` | Yes | `aap-backend` + `aap-node` |
| `deleteProject` | Yes | `aap-backend` + `aap-node` |
| `deleteProjectIfExists` | Yes | `aap-backend` + `aap-node` |
| `createProject` | Yes | `aap-backend` + `aap-node` |
| `deleteExecutionEnvironmentExists` | Yes | `aap-backend` + `aap-node` |
| `createExecutionEnvironment` | Yes | `aap-backend` + `aap-node` |
| `deleteExecutionEnvironment` | Yes | `aap-backend` + `aap-node` |
| `deleteJobTemplate` | Yes | `aap-backend` + `aap-node` |
| `deleteJobTemplateIfExists` | Yes | `aap-backend` + `aap-node` |
| `createJobTemplate` | Yes | `aap-backend` + `aap-node` |
| `fetchEvents` | Yes | `aap-backend` + `aap-node` |
| `fetchResult` | Yes | `aap-backend` + `aap-node` |
| `launchJobTemplate` | Yes | `aap-backend` + `aap-node` |
| `launchJobTemplateNoWait` | Yes | `aap-backend` + `aap-node` |
| `logJobStdoutMessages` | Yes | `aap-backend` + `aap-node` |
| `getJobStatus` | Yes | `aap-backend` + `aap-node` |
| `cancelJob` | Yes | `aap-backend` + `aap-node` |
| `cleanUp` | Yes | `aap-backend` + `aap-node` |
| `checkControllerAvailability` | Yes | `aap-backend` + `aap-node` |
| `getResourceData` | Yes | `aap-backend` + `aap-node` |
| `getJobTemplatesByName` | Yes | `aap-backend` + `aap-node` |
| `setLogger` | Yes | `aap-backend` + `aap-node` |
| `rhAAPAuthenticate` | Yes | `aap-backend` + `aap-node` |
| `rhAAPRevokeToken` | Yes | `aap-backend` + `aap-node` |
| `fetchProfile` | Yes | `aap-backend` + `aap-node` |
| `getOrganizations` | Yes | `aap-backend` + `aap-node` |
| `listSystemUsers` | Yes | `aap-backend` + `aap-node` |
| `getTeamsByUserId` | Yes | `aap-backend` + `aap-node` |
| `getUserRoleAssignments` | Yes | `aap-backend` + `aap-node` |
| `syncJobTemplates` | Yes | `aap-backend` + `aap-node` |
| `getOrgsByUserId` | Yes | `aap-backend` + `aap-node` |
| `getUserInfoById` | Yes | `aap-backend` + `aap-node` |
| `isValidPAHRepository` | **No** (PAH) | **Remove from IAAPService** → content |
| `syncCollectionsByRepositories` | **No** (PAH) | **Remove from IAAPService** → content |

---

## Appendix B — Reference map to source files

| Concern | Path (current `plugins/` directory) |
| --- | --- |
| Common barrel exports | `backstage-rhaap-common/src/index.ts` |
| AAPClient class + IAAPService | `backstage-rhaap-common/src/AAPClient/AAPClient.ts` |
| ansibleServiceRef | `backstage-rhaap-common/src/AAPService/AAPService.ts` |
| Permissions (5) | `backstage-rhaap-common/src/permissions.ts` |
| Wire types (DTOs) | `backstage-rhaap-common/src/types/types.ts` |
| Interfaces (IJobTemplate, etc.) | `backstage-rhaap-common/src/interfaces/` |
| Name formatting utilities | `backstage-rhaap-common/src/utils/nameFormatting.ts` |
| Constants | `backstage-rhaap-common/src/constants.ts` |
| ScmClient (out of scope) | `backstage-rhaap-common/src/ScmClient/` |
| PAH helpers (out of scope) | `backstage-rhaap-common/src/AAPClient/pahHelpers.ts` |
| Config readers | `backstage-rhaap-common/src/AAPClient/utils/config.ts` |
| Frontend plugin | `backstage-rhaap/src/plugin.ts` |
| Catalog module registration | `catalog-backend-module-rhaap/src/module.ts` |
| Catalog router (1200 lines) | `catalog-backend-module-rhaap/src/router.ts` |
| Entity providers | `catalog-backend-module-rhaap/src/providers/` |
| Scaffolder module registration | `scaffolder-backend-module-backstage-rhaap/src/module.ts` |
| Scaffolder actions | `scaffolder-backend-module-backstage-rhaap/src/actions/` |
| Autocomplete handler | `scaffolder-backend-module-backstage-rhaap/src/autocomplete/` |
| Auth module | `auth-backend-module-rhaap-provider/src/module.ts` |
| OAuth authenticator | `auth-backend-module-rhaap-provider/src/authenticator.ts` |
| User job templates router | `auth-backend-module-rhaap-provider/src/userJobTemplatesRouter.ts` |
| Backend wiring | `packages/backend/src/index.ts` |

---

## Appendix C — Architecture rule validation (§2.5)

| Rule | Description | AAP compliance | Evidence |
| --- | --- | --- | --- |
| 1 | No circular deps between workspaces | Compliant | `aap` workspace is a leaf; depends only on Backstage core |
| 2 | `common-library` = isomorphic only | Compliant after split | `aap-common` has no Node/React; today's monolith violates this |
| 3 | Frontend must not import backend | Compliant | `aap` frontend has no common import; proxy-only communication |
| 4 | Backend must not import frontend | Compliant | No backend module imports frontend plugin |
| 5 | `node-library` for service refs + interfaces | Compliant after split | `aap-node` holds `ansibleServiceRef` + `IAAPService` |
| 6 | Backend modules use DI, not direct imports | Compliant | All modules use `ansibleServiceRef` via `deps` |
| 7 | Workspace-scoped lockfiles | Compliant after Phase 7 | `workspaces/aap/yarn.lock` |
| 8 | No handler URLs in manifests | N/A | AAP has no plugin manifest (not extension host) |
| 9 | Additive semver for extension points | N/A | AAP publishes no extension points |
| 10 | Permissions registered by owning module | Transitional | AAP module registers all 5; should register only 2 long-term |
| 11 | Config schema co-located with reader | Compliant after split | `aap-backend/config.d.ts` covers AAP paths only |
| 12 | Dynamic plugin: embed or shared | Compliant after Phase 5 | `--embed-package aap-common aap-node` |
| 13 | Published packages have changelog | Not started | Follow-on for implementation stories |
| 14 | Test isolation per workspace | Compliant after Phase 7 | Workspace-scoped `yarn test` |
| 15 | CI must validate workspace boundaries | Not started | ESLint import-boundary rules needed |
| 16 | Plugin ID stability across renames | Planned | `ansible` (frontend), `rhaap` (auth provider), service ID unchanged |
