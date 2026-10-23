# Portal-Scaffolder Plugin Re-Architecture Plan

**Ticket:** [AAP-96042](https://redhat.atlassian.net/browse/AAP-96042)
**Baseline:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) §2.2, §7.1–§7.7

---

## 1. Current State: What Stays in Portal-Scaffolder vs. Moves to AAP / Portal-Core

`workspaces/portal-scaffolder/plugins/portal-scaffolder/` is a single monolithic frontend plugin (`@ansible/portal-scaffolder`, plugin ID `portal-scaffolder`). This section focuses on the domains relevant to the portal-scaffolder ↔ aap ↔ portal-core boundary:

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

**Key rule (architecture doc §2.5 rule 9):** `portal-scaffolder` imports no `content-type-*` package. Content data flows only through the operation bridge.

---

## 3. What Stays, What Moves

### 3.1 Components

| Component                                         | Decision                                                                       | Destination                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `Home` / `HomeComponent`                          | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `CatalogItemsDetails` (template detail)           | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `CreateTask` / `RunTask`                          | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `TaskList`                                        | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `EETabs` + `CreateContent` (definition authoring) | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `EEDetailsPage` (definition detail)               | **Stays**                                                                      | `portal-scaffolder`                                                                                    |
| `LandingPage`                                     | **Moves**                                                                      | `workspaces/portal-core/`                                                                              |
| `SignInPage`                                      | **Moves**                                                                      | `workspaces/aap/`                                                                                      |
| `AAPLogoutButton` / `AAPLogoutHandler`            | **Moves**                                                                      | `workspaces/aap/`                                                                                      |
| `AppThemeFixer`                                   | **Moves**                                                                      | `workspaces/portal-core/`                                                                              |
| `LocationListener`                                | **Moves**                                                                      | `workspaces/portal-core/`                                                                              |
| `SidebarItems`                                    | **Stays**                                                                      | `portal-scaffolder` — all 5 items remain (EEBuilder, Collections, GitRepositories, Templates, History) |
| `notifications/`                                  | **Stays** — portal-scaffolder domain concern                                   | `portal-scaffolder`                                                                                    |
| `common/` (shared UI components)                  | Already extracted to `portal-plugin-sdk`; remaining domain-specific utils stay | `portal-scaffolder`                                                                                    |
| `feedback/FeedbackFooter`                         | **Moves**                                                                      | `workspaces/portal-core/`                                                                              |

**Note on EE scope:** `EETabs`/`EEDetailsPage`/`CreateContent` cover EE _definition_ authoring only. Whether EE _built-image_ content (OCI artifact, digest, trust signals) gets its own tab added here via blueprint, or moves to a separate plugin entirely, is the ANSTRAT-1758 team's call to make — they're still scoping that work. Until that decision lands, EE stays as one undifferentiated surface in `portal-scaffolder`.

### 3.2 Scaffolder Field Extensions

| Field Extension              | Data Source    | Decision                                                                                                                                     |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AAPTokenField`              | AAP auth       | **Stays** in `portal-scaffolder`                                                                                                             |
| `AAPResourcePicker`          | AAP API        | **Stays** in `portal-scaffolder`                                                                                                             |
| `ScmSelector`                | Static UI      | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                                                                              |
| `FileUploadPicker`           | Local file     | **Stays** in `portal-scaffolder` (or `portal-scaffolder-react`)                                                                              |
| `CollectionsPicker`          | Content data   | **Boundary** — calls `content.collections.list` registered operation                                                                         |
| `BaseImagePicker`            | Content data   | **Boundary** — calls registered operation                                                                                                    |
| `EETagsPicker`               | User input     | **Stays** — free-text tags, no content-service dependency ([picker contract](../../docs/next/portal-content-picker-contract-proposal.md) §7) |
| `EEFileNamePicker`           | EE definitions | **Stays** — definition data, not built content                                                                                               |
| `PackagesPicker`             | User input     | **Stays** — free-text pip package names, no content-service dependency (same contract §7)                                                    |
| `AdditionalBuildStepsPicker` | Static UI      | **Stays**                                                                                                                                    |
| `MCPServersPicker`           | External       | **Stays**                                                                                                                                    |

Only `CollectionsPicker` and `BaseImagePicker` cross the content boundary — they stay as UI components in `portal-scaffolder-react` but fetch data through registered operations (§7.5 operation bridge) per the [picker contract proposal](../../docs/next/portal-content-picker-contract-proposal.md), not direct imports. `EETagsPicker` and `PackagesPicker` are pure user input and carry no content-service dependency.

### 3.3 API Factories

| API Factory                                         | Decision                                                       |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `ansibleApiRef` (sync triggers, user job templates) | **Stays** in `portal-scaffolder`                               |
| `eeBuildApiRef` (EE build trigger)                  | **Stays** — EE definition authoring is portal-scaffolder's job |
| `rhAapAuthApiRef` (OAuth2)                          | **Moves** to `workspaces/aap/` — auth concern                  |

### 3.4 Routes

| Current Route                                             | Decision                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/self-service/catalog` (templates listing)               | **Stays**                                                                             |
| `/self-service/catalog/:namespace/:templateName`          | **Stays**                                                                             |
| `/self-service/create/templates/:namespace/:templateName` | **Stays**                                                                             |
| `/self-service/create/tasks`                              | **Stays**                                                                             |
| `/self-service/create/tasks/:taskId`                      | **Stays**                                                                             |
| `/self-service/ee/*`                                      | **Stays** (EE definitions)                                                            |
| `/self-service/catalog-import`                            | **Stays**                                                                             |
| `/self-service/collections` (collections catalog)         | **Stays** — out of scope for this split, pending separate content-workspace migration |
| `/self-service/repositories` (git repositories)           | **Stays** — out of scope for this split, pending separate content-workspace migration |

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

- Scaffolder field extensions that stay with portal-scaffolder outright (ScmSelector, FileUploadPicker, EEFileNamePicker, AdditionalBuildStepsPicker, MCPServersPicker, EETagsPicker, PackagesPicker, AAPTokenField, AAPResourcePicker)
- The 2 content-boundary pickers (CollectionsPicker, BaseImagePicker) — refactored to call registered operations per the [picker contract proposal](../../docs/next/portal-content-picker-contract-proposal.md) instead of direct content imports

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

1. **Inventory what's already native** — `src/alpha.tsx` already declares `templates` (`createPortalScaffolderPage`, mounted at `/self-service`), `collections`, `ee`, `repositories` (`PageBlueprint`, each independently mountable), and `history` (`PageBlueprint` at `/self-service/create/tasks`). This already satisfies the "independently exportable page" goal — this phase preserves and extends it, not reinvents it.
2. During Phases 1–2's file moves, keep each page's `routeRef` (`rootRouteRef`, `collectionsRouteRef`, `eeRouteRef`, `gitRepositoriesRouteRef`, `historyRouteRef`) stable so route paths don't shift.
3. Preserve the `page:portal-scaffolder/templates` attachment point and its `scaffolderFields` input (`ScaffolderFieldBlueprint` → `collectScaffolderFields`) so third-party scaffolder fields keep attaching after the restructuring.
4. Distinguish the two existing extension surfaces and treat them separately:
   - **Native NFS surface** (`alpha.tsx` blueprints) — pages + scaffolder fields; extended per steps 1–3 above.
   - **Legacy capability surface** (`selfServiceManifest.ts`, `DynamicExtensionDiscovery`, `useExtensionTabs`) — detail-page tabs (collection/repository/EE detail); left as-is for this split, verified still functional post-extraction.
5. Add acceptance checks: (a) each native page still mounts independently at its existing path after Phases 1–2, (b) a sample third-party `ScaffolderFieldBlueprint` field still renders end-to-end inside the templates page.
6. Update RHDH `dynamic-plugins.yaml` config for the reworked plugin set
7. Add `portal-plugin.yaml` beside each package per the delivery contract (§8.5)

---

## 6. Key Constraints

1. **No circular dependencies** between `portal-scaffolder` and `content` workspaces (architecture doc §7.7)
2. **URL stability** — no route paths change in this plan; every existing route (including `/self-service/collections` and `/self-service/repositories`) stays mounted exactly as today. Redirects are only required if a future phase actually moves a path (§7.7)
3. **No regressions** in the existing portal-scaffolder experience during extraction
4. **Content data flows through the operation bridge only** — no direct content-type imports (rule 9)
5. **Cross-workspace dependency via published version only** — not `workspace:^` (rule 10)
6. **Each package declares `backstage.role`** and ships a `portal-plugin.yaml` (rules 11, §8.5)
7. **`portal-core` must start up without `portal-scaffolder` installed** — no hard runtime dependency from `portal-core` on `portal-scaffolder`
8. **Third-party contributions keep working through the split** — both the native NFS surface (`ScaffolderFieldBlueprint` on `page:portal-scaffolder/templates`) and the legacy capability-tab surface (`DynamicExtensionDiscovery` / `useExtensionTabs`) must still render third-party extensions after Phases 1–3
9. **AAP auth is a deployment-level dependency** — hosts running `portal-scaffolder` templates (and `AAPTokenField`) must load `aap-app-auth` in `dynamic-plugins.yaml`; verify via `api:app/rhaap-auth` / `sign-in-page:app/rhaap` discovery

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
├── /self-service/collections   → Collections catalog (CollectionsRoutesPage)
├── /self-service/repositories  → Git repositories (GitRepositoriesRoutesPage)
└── /catalog-import             → Catalog import
```

Manifest continues to declare capabilities for all legacy detail-tab entry points (collection, repository, EE definition detail) — unchanged from the current 4-capability/6-entry-point manifest, since §3.4 keeps collections/repositories in `portal-scaffolder` for this split.

---

## 8. Alignment with Sibling Spikes

| Spike                                                                                         | Relevance to Portal-Scaffolder                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [AAP-95778](https://redhat.atlassian.net/browse/AAP-95778) (portal-core ContributionRegistry) | Portal-scaffolder is the first-party proof of the manifest pipeline; manifest evolution must stay aligned |
| [AAP-95782](https://redhat.atlassian.net/browse/AAP-95782) (scaffolder re-architecture)       | Scaffolder field extension ownership classification must match §3.2 above                                 |
| [AAP-95785](https://redhat.atlassian.net/browse/AAP-95785) (portal-core plugin)               | Infrastructure components (LandingPage, AppThemeFixer, LocationListener, etc.) receiving end              |
| [AAP-95802](https://redhat.atlassian.net/browse/AAP-95802) (aap workspace)                    | AAP-specific components (SignInPage, AAPLogoutButton, auth) receiving end                                 |
