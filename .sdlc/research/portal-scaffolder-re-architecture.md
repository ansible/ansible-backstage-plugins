# Portal-Scaffolder Plugin Re-Architecture Plan

**Ticket:** [AAP-96042](https://redhat.atlassian.net/browse/AAP-96042)
**Baseline:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) §2.2, §7.1–§7.7

---

## 1. Current State: What Stays in Portal-Scaffolder vs. Moves to AAP / Portal-Core

`workspaces/scaffolder/plugins/portal-scaffolder/` is a single monolithic frontend plugin (`@ansible/portal-scaffolder`, plugin ID `portal-scaffolder`). This section focuses on the domains relevant to the portal-scaffolder ↔ aap ↔ portal-core boundary:

| Domain                                | Components                                                                                 | Decision                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| **Templates & Scaffolder**            | `Home`, `CatalogItemsDetails`, `CreateTask`, `RunTask`, `TaskList`, `JobTemplatesProvider` | ✅ Stays in `portal-scaffolder` |
| **Execution Environments**            | `EETabs`, `EEDetailsPage`, `CreateContent` (definition catalog + build flow)               | ✅ Stays in `portal-scaffolder` |
| **Infrastructure / Shell**            | `LandingPage`, `AppThemeFixer`, `LocationListener`                                         | ❌ Moves to `portal-core`       |
| **Infrastructure / Shell (AAP auth)** | `SignInPage`, `AAPLogoutButton`                                                            | ❌ Moves to `aap`               |

Additionally bundled:

- **11 scaffolder field extensions** (AAPTokenField, AAPResourcePicker, CollectionsPicker, BaseImagePicker, EETagsPicker, EEFileNamePicker, PackagesPicker, AdditionalBuildStepsPicker, MCPServersPicker, FileUploadPicker, ScmSelector)
- **3 API factories** (`ansibleApiRef`, `eeBuildApiRef`, `rhAapAuthApiRef`)
- **5 sidebar items** (EEBuilder, Collections, GitRepositories, Templates, History)
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
workspaces/scaffolder/
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

**Key rule (architecture doc §2.5 rule 9):** `portal-scaffolder` imports no `content-type-*` package. Content data flows only through the operation bridge.

---

## 3. What Stays, What Moves

### 3.1 Components

| Component                                         | Decision                                                                       | Destination                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `Home` / `HomeComponent`                          | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `CatalogItemsDetails` (template detail)           | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `CreateTask` / `RunTask`                          | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `TaskList`                                        | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `EETabs` + `CreateContent` (definition authoring) | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `EEDetailsPage` (definition detail)               | **Stays**                                                                      | `portal-scaffolder`                                                      |
| `LandingPage`                                     | **Moves**                                                                      | `workspaces/portal-core/`                                                |
| `SignInPage`                                      | **Moves**                                                                      | `workspaces/aap/`                                                        |
| `AAPLogoutButton` / `AAPLogoutHandler`            | **Moves**                                                                      | `workspaces/aap/`                                                        |
| `AppThemeFixer`                                   | **Moves**                                                                      | `workspaces/portal-core/`                                                |
| `LocationListener`                                | **Moves**                                                                      | `workspaces/portal-core/`                                                |
| `SidebarItems`                                    | **Stays**                                                                      | `portal-scaffolder` — EEBuilder, Templates, History sidebar items remain |
| `notifications/`                                  | **Stays** — portal-scaffolder domain concern                                   |
| `common/` (shared UI components)                  | Already extracted to `portal-plugin-sdk`; remaining domain-specific utils stay |
| `feedback/FeedbackFooter`                         | **Moves**                                                                      | `workspaces/portal-core/`                                                |

### 3.2 Scaffolder Field Extensions

| Field Extension              | Data Source    | Decision                                                                                 |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `AAPTokenField`              | AAP auth       | **Undecided** — could stay in `portal-scaffolder` or move to a new `aap` frontend plugin |
| `AAPResourcePicker`          | AAP API        | **Undecided** — could stay in `portal-scaffolder` or move to a new `aap` frontend plugin |
| `ScmSelector`                | Static UI      | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                          |
| `FileUploadPicker`           | Local file     | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                          |
| `CollectionsPicker`          | Content data   | **Boundary** — calls `content.collections.list` registered operation                     |
| `BaseImagePicker`            | Content data   | **Boundary** — calls registered operation                                                |
| `EETagsPicker`               | Content data   | **Boundary** — calls registered operation                                                |
| `EEFileNamePicker`           | EE definitions | **Stays** — definition data, not built content                                           |
| `PackagesPicker`             | Content data   | **Boundary** — calls registered operation                                                |
| `AdditionalBuildStepsPicker` | Static UI      | **Stays**                                                                                |
| `MCPServersPicker`           | External       | **Stays**                                                                                |

The 4 "Boundary" fields stay as UI components in `portal-scaffolder-react` but fetch data through registered operations (§7.5 operation bridge), not direct imports.

### 3.3 API Factories

| API Factory                                         | Decision                                                       |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `ansibleApiRef` (sync triggers, user job templates) | **Stays** in `portal-scaffolder`                               |
| `eeBuildApiRef` (EE build trigger)                  | **Stays** — EE definition authoring is portal-scaffolder's job |
| `rhAapAuthApiRef` (OAuth2)                          | **Moves** to `workspaces/aap/` — auth concern                  |

### 3.4 Routes

| Current Route                                             | Decision                   |
| --------------------------------------------------------- | -------------------------- |
| `/self-service/catalog` (templates listing)               | **Stays**                  |
| `/self-service/catalog/:namespace/:templateName`          | **Stays**                  |
| `/self-service/create/templates/:namespace/:templateName` | **Stays**                  |
| `/self-service/create/tasks`                              | **Stays**                  |
| `/self-service/create/tasks/:taskId`                      | **Stays**                  |
| `/self-service/ee/*`                                      | **Stays** (EE definitions) |
| `/self-service/catalog-import`                            | **Stays**                  |

All self-service routes stay; no redirects are required across the self-service ↔ aap / portal-core boundary.

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

- Scaffolder field extensions that stay with portal-scaffolder (AAPTokenField, AAPResourcePicker, ScmSelector, FileUploadPicker, EEFileNamePicker, AdditionalBuildStepsPicker, MCPServersPicker)
- The 4 content-boundary pickers (CollectionsPicker, BaseImagePicker, EETagsPicker, PackagesPicker) — refactored to call registered operations instead of direct content imports

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

### Phase 3: Make each page section independently exportable

1. Each remaining section (Templates, History, EE Definitions) becomes an independently mountable routable extension
2. Already partially done: `TemplatesPage`, `HistoryPage`, `EEPage` exist as `createRoutableExtension` in `plugin.ts`
3. Update `selfServiceManifest.ts` to declare only the capabilities self-service still owns
4. Update RHDH `dynamic-plugins.yaml` config for the reworked plugin set
5. Add `portal-plugin.yaml` beside each package per the delivery contract (§8.5)

---

## 6. Key Constraints

1. **No circular dependencies** between `portal-scaffolder` and `content` workspaces (architecture doc §7.7)
2. **URL stability** — old routes must redirect; no broken bookmarks (§7.7)
3. **No regressions** in the existing portal-scaffolder experience during extraction
4. **Content data flows through the operation bridge only** — no direct content-type imports (rule 9)
5. **Cross-workspace dependency via published version only** — not `workspace:^` (rule 10)
6. **Each package declares `backstage.role`** and ships a `portal-plugin.yaml` (rules 11, §8.5)

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

Manifest declares capabilities only for EE definition detail.

---

## 8. Alignment with Sibling Spikes

| Spike                                                                                         | Relevance to Portal-Scaffolder                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [AAP-95778](https://redhat.atlassian.net/browse/AAP-95778) (portal-core ContributionRegistry) | Portal-scaffolder is the first-party proof of the manifest pipeline; manifest evolution must stay aligned |
| [AAP-95782](https://redhat.atlassian.net/browse/AAP-95782) (scaffolder re-architecture)       | Scaffolder field extension ownership classification must match §3.2 above                                 |
| [AAP-95785](https://redhat.atlassian.net/browse/AAP-95785) (portal-core plugin)               | Infrastructure components (LandingPage, AppThemeFixer, LocationListener, etc.) receiving end              |
| [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) (aap workspace)                    | AAP-specific components (SignInPage, AAPLogoutButton, auth) receiving end                                 |
