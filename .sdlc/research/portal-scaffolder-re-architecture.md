# Portal-Scaffolder Plugin Re-Architecture Plan

**Ticket:** [AAP-96042](https://redhat.atlassian.net/browse/AAP-96042)
**Baseline:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) §2.2, §7.1–§7.7

---

## 1. Current State: What Stays in Portal-Scaffolder vs. Moves to Content / AAP / Portal-Core

`workspaces/portal-scaffolder/plugins/portal-scaffolder/` is a single monolithic frontend plugin (`@ansible/portal-scaffolder`, plugin ID `portal-scaffolder`). This section focuses on the domains relevant to the portal-scaffolder ↔ content ↔ aap ↔ portal-core boundary. The existing `workspaces/content/` workspace is the destination for content experiences.

| Domain                                | Components                                                                                 | Decision                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| **Templates & Scaffolder**            | `Home`, `CatalogItemsDetails`, `CreateTask`, `RunTask`, `TaskList`, `JobTemplatesProvider` | ✅ Stays in `portal-scaffolder`   |
| **Execution Environments**            | `EETabs`, `EEDetailsPage`, `CreateContent` (definition catalog + build flow)               | ✅ Stays in `portal-scaffolder`   |
| **Content experiences**               | Collections and Git Repositories pages                                                     | ❌ Moves to `workspaces/content/` |
| **Infrastructure / Shell**            | `LandingPage`, `AppThemeFixer`, `LocationListener`                                         | ❌ Moves to `portal-core`         |
| **Infrastructure / Shell (AAP auth)** | `SignInPage`, `AAPLogoutButton`                                                            | ❌ Moves to `aap`                 |

Additionally bundled:

- **11 scaffolder field extensions** (AAPTokenField, AAPResourcePicker, CollectionsPicker, BaseImagePicker, EETagsPicker, EEFileNamePicker, PackagesPicker, AdditionalBuildStepsPicker, MCPServersPicker, FileUploadPicker, ScmSelector)
- **3 API factories** (`ansibleApiRef`, `eeBuildApiRef`, `rhAapAuthApiRef`)
- **5 sidebar items** (EEBuilder, Collections, GitRepositories, Templates, History); Collections and GitRepositories move with their content experiences
- **Extension shims** (`DynamicExtensionDiscovery`, `ExtensionRenderer`, `ExperienceSlot`, `ErrorBoundary`, `validateManifest`)

### What's Already Done

- Plugin renamed to `@ansible/portal-scaffolder`
- `selfServiceManifest.ts` declares 4 capabilities with 6 entry points via the `PluginManifest` contract
- Extension host shims in `src/extensions/` re-export from `@ansible/portal-extension-host`
- `DynamicExtensionDiscovery` mounted in `RouteView.tsx` with first-party manifest
- Detail pages wired to `useExtensionTabs` — third-party tabs render without compile-time imports
- Common components extracted to `@ansible/portal-plugin-sdk` (Phase 1 complete)
- `portal-extension-api` and `portal-extension-host` declared as `peerDependencies`
- `portal-core` provides the `ContributionRegistry` singleton

---

## 2. Target State

Per the architecture doc §2.2, the scaffolder workspace target structure is:

```
workspaces/portal-scaffolder/
├── package.json, yarn.lock, .changeset/, catalog-info.yaml
├── packages/app/  packages/backend/           # dev harness
└── plugins/
    ├── portal-scaffolder/                      # frontend-plugin
    │     templates, tasks, history, EE definition catalog
    ├── portal-scaffolder-common/                # common-library
    │     schemas, permissions, wire types; no React or DB
    └── portal-scaffolder-react/                 # web-library
          shared React components, hooks (extracted from portal-scaffolder)
```

**Key rules:** `portal-scaffolder` imports no `content-type-*` package and has no hard dependency on `workspaces/content/` internals. Content data flows through native NFS and registered operations; the content workspace remains independently deployable and configurable.

---

## 3. What Stays, What Moves

### 3.1 Components

| Component                                         | Decision                                                                       | Destination                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `Home` / `HomeComponent`                          | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `CatalogItemsDetails` (template detail)           | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `CreateTask` / `RunTask`                          | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `TaskList`                                        | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `EETabs` + `CreateContent` (definition authoring) | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `EEDetailsPage` (definition detail)               | **Stays**                                                                      | `portal-scaffolder`                                                                                                     |
| `CollectionsPage` / collection detail             | **Moves**                                                                      | `workspaces/content/`                                                                                                   |
| `GitRepositoriesPage` / repository detail         | **Moves**                                                                      | `workspaces/content/`                                                                                                   |
| `LandingPage`                                     | **Moves**                                                                      | `workspaces/portal-core/`                                                                                               |
| `SignInPage`                                      | **Moves**                                                                      | `workspaces/aap/`                                                                                                       |
| `AAPLogoutButton` / `AAPLogoutHandler`            | **Moves**                                                                      | `workspaces/aap/`                                                                                                       |
| `AppThemeFixer`                                   | **Moves**                                                                      | `workspaces/portal-core/`                                                                                               |
| `LocationListener`                                | **Moves**                                                                      | `workspaces/portal-core/`                                                                                               |
| `SidebarItems`                                    | **Split**                                                                      | `portal-scaffolder` keeps EEBuilder, Templates, and History; `workspaces/content/` owns Collections and GitRepositories |
| `notifications/`                                  | **Stays** — portal-scaffolder domain concern                                   | `portal-scaffolder`                                                                                                     |
| `common/` (shared UI components)                  | Already extracted to `portal-plugin-sdk`; remaining domain-specific utils stay | `portal-scaffolder`                                                                                                     |
| `feedback/FeedbackFooter`                         | **Moves**                                                                      | `workspaces/portal-core/`                                                                                               |

**Note on EE scope:** `EETabs`/`EEDetailsPage`/`CreateContent` cover EE _definition_ authoring only. Whether EE _built-image_ content (OCI artifact, digest, trust signals) gets its own tab added here via blueprint, or moves to a separate plugin entirely, is the ANSTRAT-1758 team's call to make. The content workspace owns content experiences; the scaffolder plugin must not become their host.

### 3.2 Scaffolder Field Extensions

| Field Extension              | Data Source    | Decision                                                                                                                                     |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AAPTokenField`              | AAP auth       | **Stays** in `portal-scaffolder`                                                                                                             |
| `AAPResourcePicker`          | AAP API        | **Stays** in `portal-scaffolder`                                                                                                             |
| `ScmSelector`                | Static UI      | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                                                                              |
| `FileUploadPicker`           | Local file     | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                                                                              |
| `CollectionsPicker`          | Content data   | **Optional contribution** — calls `content.collections.list` through the operation bridge; no direct content dependency                      |
| `BaseImagePicker`            | Content data   | **Optional contribution** — calls a registered operation; no direct content dependency                                                       |
| `EETagsPicker`               | User input     | **Stays** — free-text tags, no content-service dependency ([picker contract](../../docs/next/portal-content-picker-contract-proposal.md) §7) |
| `EEFileNamePicker`           | EE definitions | **Stays** — definition data, not built content                                                                                               |
| `PackagesPicker`             | User input     | **Stays** — free-text pip package names, no content-service dependency (same contract §7)                                                    |
| `AdditionalBuildStepsPicker` | Static UI      | **Stays**                                                                                                                                    |
| `MCPServersPicker`           | External       | **Stays**                                                                                                                                    |

`CollectionsPicker` and `BaseImagePicker` are optional UI contributions. If supplied, they live behind the native NFS/operation boundary and fetch data through registered operations (§7.5 operation bridge) per the [picker contract proposal](../../docs/next/portal-content-picker-contract-proposal.md), not direct imports. `EETagsPicker` and `PackagesPicker` are pure user input and carry no content-service dependency.

### 3.3 API Factories

| API Factory                                         | Decision                                                       |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `ansibleApiRef` (sync triggers, user job templates) | **Stays** in `portal-scaffolder`                               |
| `eeBuildApiRef` (EE build trigger)                  | **Stays** — EE definition authoring is portal-scaffolder's job |
| `rhAapAuthApiRef` (OAuth2)                          | **Moves** to `workspaces/aap/` — auth concern                  |

### 3.4 Routes

| Current Route                                             | Decision                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/self-service/catalog` (templates listing)               | **Stays**                                                                                                                          |
| `/self-service/catalog/:namespace/:templateName`          | **Stays**                                                                                                                          |
| `/self-service/create/templates/:namespace/:templateName` | **Stays**                                                                                                                          |
| `/self-service/create/tasks`                              | **Stays**                                                                                                                          |
| `/self-service/create/tasks/:taskId`                      | **Stays**                                                                                                                          |
| `/self-service/ee/*`                                      | **Stays** (EE definitions)                                                                                                         |
| `/self-service/catalog-import`                            | **Stays**                                                                                                                          |
| `/self-service/collections` (collections catalog)         | **Moves** to `workspaces/content/`; preserve the existing URL through an explicit compatibility mount or redirect during migration |
| `/self-service/repositories` (git repositories)           | **Moves** to `workspaces/content/`; preserve the existing URL through an explicit compatibility mount or redirect during migration |

Template, task, history, EE-definition, and catalog-import routes remain in `portal-scaffolder`. Collections and Git Repository routes are content-owned and require an explicit URL transition plan; route preservation must not keep those experiences coupled to scaffolder.

---

## 4. New Packages to Create

### 4.1 `portal-scaffolder-common` (common-library)

Shared types, schemas, and permission constants used by both the frontend plugin and backend modules. No React, no database code.

Extract from current plugin:

- Shared TypeScript interfaces (`EEBuildRequest`, `EEBuildResult`, `UserJobTemplate`, etc.)
- EE definition schemas and validation types
- Route path constants

### 4.2 `portal-scaffolder-react` (web-library)

Reusable React components and hooks. Plugin-independent — no `selfServicePlugin.provide()` calls.

Extract from current plugin:

- Scaffolder field extensions that are generic to portal-scaffolder (ScmSelector, FileUploadPicker, EEFileNamePicker, AdditionalBuildStepsPicker, MCPServersPicker, EETagsPicker, PackagesPicker)
- AAPTokenField and AAPResourcePicker remain with portal-scaffolder
- CollectionsPicker and BaseImagePicker remain optional operation-backed contributions, not direct content imports

The existing content workspace owns Collections and Git Repository pages and their content-specific adapters. This plan extends that workspace rather than adding a new top-level package or importing its implementation into portal-scaffolder.

---

## 5. Action Plan

### Phase 1: Create package scaffolding and extract shared code

1. Create `portal-scaffolder-common` package — move shared types and schemas out of the frontend plugin
2. Create `portal-scaffolder-react` package — move scaffolder field extensions and reusable hooks
3. Update `portal-scaffolder` plugin imports to reference the new packages
4. Verify all existing tests still pass

### Phase 2: Move infrastructure components out

1. Move `LandingPage`, `AppThemeFixer`, `LocationListener`, `FeedbackFooter` → `portal-core`
2. Move `SignInPage` → `aap`
3. Move `AAPLogoutButton` / `AAPLogoutHandler` → `aap`
4. Move `rhAapAuthApiRef` → `aap` (`ansibleApiRef` stays in `portal-scaffolder`)
5. The portal-scaffolder plugin receives the moved refs via Backstage API refs (no direct import)
6. **Deployment note:** a `portal-scaffolder` dependency on `aap-app-auth` doesn't install it — hosts must separately load `aap-app-auth` in `dynamic-plugins.yaml`

### Phase 3: Preserve and extend the native NFS page surface

1. **Inventory what's already native** — `src/alpha.tsx` already declares the templates, EE, and history pages, while `workspaces/content/plugins/automation-content` is the existing content frontend surface. Treat these as the supported composition points.
2. Document the Collections and Git Repository ownership boundary in `workspaces/content/`; extracting those experiences and their adapters is outside the scope of this feature.
3. Document the future compatibility route strategy for `/self-service/collections` and `/self-service/repositories`; any configured mount or redirect is part of the later content migration, not this feature.
4. Preserve the `page:portal-scaffolder/templates` attachment point and its `scaffolderFields` input (`ScaffolderFieldBlueprint` → `collectScaffolderFields`) so native third-party scaffolder fields keep attaching after the restructuring.
5. Treat native NFS as the supported extension surface and add an implementation note stating: **Legacy-related capabilities will be completely decommissioned.**
6. Add acceptance checks: (a) each supported native page mounts independently at its existing path, and (b) a sample third-party `ScaffolderFieldBlueprint` field renders end-to-end inside the templates page.
7. Update RHDH `dynamic-plugins.yaml` config for the reworked plugin set
8. Add `portal-plugin.yaml` beside each package per the delivery contract (§8.5)

---

## 6. Key Constraints

1. **No circular dependencies** between `portal-scaffolder` and `content` workspaces (architecture doc §7.7)
2. **Content ownership is documented** — Collections and Git Repository experiences target `workspaces/content/`; extracting them is outside the scope of this feature, and portal-scaffolder must not import content implementation internals
3. **Future URL transition is documented** — template/scaffolder routes remain stable in this feature; any configured mount or redirect for `/self-service/collections` and `/self-service/repositories` belongs to the later content migration
4. **No regressions** in the existing portal-scaffolder experience during extraction
5. **Content data flows through the operation bridge only** — no direct content-type imports (rule 9)
6. **Native NFS is the supported extension model** for the RHDH 2.1+ baseline
7. **Each package declares `backstage.role`** and ships a `portal-plugin.yaml` (rules 11, §8.5)
8. **`portal-core` must start up without `portal-scaffolder` installed** — no hard runtime dependency from `portal-core` on `portal-scaffolder`
9. **Native third-party contributions keep working through the split** — `ScaffolderFieldBlueprint` on `page:portal-scaffolder/templates` must still render after Phases 1–3
10. **AAP auth is a deployment-level dependency** — hosts running `portal-scaffolder` templates (and `AAPTokenField`) must load `aap-app-auth` in `dynamic-plugins.yaml`; verify via `api:app/rhaap-auth` / `sign-in-page:app/rhaap` discovery

---

## 7. Post-Split Portal-Scaffolder Surface

After all phases, the portal-scaffolder plugin is a focused scaffolder experience:

```
RouteView.tsx
├── /catalog                    → Templates listing (Home)
├── /catalog/:ns/:templateName  → Template detail (CatalogItemsDetails)
├── /create/templates/:ns/:name → Template execution (CreateTask)
├── /create/tasks               → Task history (TaskList)
├── /create/tasks/:taskId       → Task detail (RunTask)
├── /ee/catalog                 → EE definition catalog (EETabs)
├── /ee/create                  → EE definition create (CreateContent)
├── /catalog/:templateName      → EE definition detail (EEDetailsPage)
└── /catalog-import             → Catalog import
```

The content workspace owns the Collections and Git Repository experiences through its own frontend surface and configurable mount. Portal-scaffolder no longer presents those pages as part of its post-split surface.

---
