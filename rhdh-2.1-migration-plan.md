# RHDH 2.1 Dynamic Plugin Migration Plan

**Repository:** `ansible-backstage-plugins`
**Date:** September 30, 2026 (last updated October 1, 2026 — rhdh-local NFS validation)
**Goal:** Make all plugins loadable as dynamic plugins in RHDH 2.1 (New Frontend System + Module Federation) **while preserving full backward compatibility with RHDH 1.10** (Scalprum-based dynamic plugin host)

**Validation status:** Sign-in, Templates, EE, Collections, and Git Repos routes were exercised on `rhdh-local` (`quay.io/rhdh-community/rhdh:next`) with locally packed dynamic plugin tarballs. Phase 0 (`rhaap-app-auth`) and Phase 1 (`self-service` `alpha.tsx`) are **implemented** in this repo; `backstage-rhaap` `alpha.tsx` exists but full portal parity is still Phase 2.

---

## Dual-Compatibility Strategy (RHDH 1.10 + 2.1)

This migration is **additive, never subtractive**. Both RHDH 1.10 and 2.1
must work from the same exported dynamic plugin bundle:

- **RHDH 1.10** loads via Scalprum (`dist-scalprum/`) using `PluginRoot` →
  `src/index.ts`. It reads `pluginConfig.dynamicPlugins.frontend.<pkg>.*`
  YAML keys to wire sign-in pages, API factories, routes, scaffolder
  fields, and mount points.
- **RHDH 2.1** loads via Module Federation (`dist/remoteEntry.js`) using
  the `./alpha` entry point. It checks the default export for
  `$$type === '@backstage/FrontendPlugin'` or `'@backstage/FrontendModule'`.
  Extensions are self-describing — legacy YAML keys are ignored but
  harmless (the `dynamicPlugins` config schema is a loose `type: object`
  with no strict validation).

Both paths coexist in the same exported bundle. The `yarn export-dynamic`
CLI already produces both `dist-scalprum/` and `dist/` outputs from a
single run.

### Non-Negotiable Rules

1. **Never remove** named exports from `src/index.ts` — RHDH 1.10's
   Scalprum host resolves `importName` YAML keys against these exports.
2. **Never remove** `pluginConfig.dynamicPlugins.frontend` YAML blocks
   from overlays — RHDH 1.10 needs them to wire features.
3. **Always add** `src/alpha.tsx` alongside existing files, never replacing.
4. Legacy YAML keys are **harmless on RHDH 2.1** (silently ignored).
   RHDH 1.10 ignores the `./alpha` MF entry point.
5. The `rhaap-app-auth` package is **RHDH 2.1-only**; on RHDH 1.10 it
   loads as a no-op (no `pluginConfig` references it). The sign-in page
   on 1.10 continues to come from `self-service`'s `SignInPage` export.

---

## Background: What Changed in RHDH 2.1

RHDH 2.1 uses the **Backstage New Frontend System (NFS)** exclusively for
its frontend app shell (`packages/app`). The legacy Scalprum-based dynamic
plugin host is **gone**:

- RHDH's `packages/app/src/App.tsx` calls `createApp()` from
  `@backstage/frontend-defaults` with `dynamicFrontendFeaturesLoader()`
  from `@backstage/frontend-dynamic-feature-loader`.
- The MF (Module Federation) loader checks every remote's default export
  for `$$type === '@backstage/FrontendPlugin'` or `'@backstage/FrontendModule'`.
  Anything else (including legacy `createPlugin()` objects) is **silently
  skipped** with a debug log:
  `"Skipping dynamic plugin remote module '...' since it doesn't export a
new 'FrontendFeature' as default export."`

### Dead YAML config keys (RHDH 2.1 only — still required for RHDH 1.10)

The following `dynamicPlugins.frontend.<pkg>.*` keys are **no longer
consumed** by the RHDH 2.1 NFS app shell, but **must be retained** in
overlay YAMLs for RHDH 1.10 backward compatibility:

| Legacy YAML key                          | NFS replacement                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `signInPage.importName`                  | `SignInPageBlueprint` extension in a `FrontendModule` targeting `pluginId: 'app'` |
| `apiFactories[].importName`              | `ApiBlueprint` extensions (auto-discovered from the plugin)                       |
| `dynamicRoutes[].importName`             | `PageBlueprint` extensions (auto-discovered; nav derived from `title`/`icon`)     |
| `dynamicRoutes[].menuItem.importName`    | Nav items derived from `PageBlueprint`'s `title`/`icon` params                    |
| `mountPoints[].importName`               | `AppRootElementBlueprint` / `AppRootWrapperBlueprint`                             |
| `scaffolderFieldExtensions[].importName` | `FormFieldBlueprint` from `@backstage/plugin-scaffolder-react/alpha`              |
| `providerSettings`                       | Auth provider settings extensions                                                 |

**Exception (still consumed on RHDH 2.1):** `mountPoints` under
`pluginConfig.dynamicPlugins.frontend.*` remain in use for plugins that have
not migrated to NFS (notably RHDH `global-header` and our
`AAPLogoutButton` → `global.header/profile`). Keep the self-service
`mountPoints` block on **both** 1.10 and 2.1.

In the NFS model, **plugins declare their own extensions in code** (via
blueprints), and adopters override behavior (title, path, visibility,
ordering, disable) through `app.extensions` in app-config.

### Dynamic plugins list & `pluginConfig` changes (rhdh-local / RHDH 2.1)

**Canonical reference:** `rhdh-local/configs/dynamic-plugins/dynamic-plugins.yaml`
(aligned with the RHAAP block in `ansible-portal-chart/values.yaml`, plus
2.1-only entries). Use `configs/dynamic-plugins/dynamic-plugins.override.yaml`
for local overrides without editing the default file.

#### A. Top-level `plugins:` entries (package list)

| Package                                                                                     | Setting                                   | RHDH 2.1 rationale                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `oci://…/backstage-plugin-auth-backend-module-guest-provider`                               | `enabled: true`                           | RHDH 2+ no longer bundles guest auth statically ([RHIDP-15348](https://redhat.atlassian.net/browse/RHIDP-15348))      |
| `ref://backstage-community-plugin-rbac`                                                     | **`enabled: true` (added)**               | Required when app-config sets `permission.enabled` and `permission.rbac` (self-service pages use `RequirePermission`) |
| Quay backend / frontend OCI plugins                                                         | **`enabled: false` (local)**              | Without a `quay:` app-config block, backend schema validation fails; re-enable when Quay is configured                |
| `ref://red-hat-developer-hub-backstage-plugin-app-auth`                                     | **`enabled: false` (changed)**            | RHDH’s built-in `SignInPageBlueprint` competes with `rhaap-app-auth`; two extensions → guest-only sign-in             |
| `./local-plugins/ansible-plugin-backstage-rhaap-app-auth-dynamic-*.tgz`                     | **`enabled: true` (added)**               | Phase 0 NFS sign-in + OAuth2 API (`pluginId: 'app'`); **no `pluginConfig` block**                                     |
| `./local-plugins/ansible-backstage-plugin-auth-backend-module-rhaap-provider-dynamic-*.tgz` | `enabled: true`, `pluginConfig: {}`       | Same as Helm chart                                                                                                    |
| `./local-plugins/ansible-backstage-plugin-catalog-backend-module-rhaap-dynamic-*.tgz`       | `enabled: true`                           | Same as Helm chart                                                                                                    |
| `./local-plugins/ansible-plugin-scaffolder-backend-module-backstage-rhaap-dynamic-*.tgz`    | `enabled: true` + backend `pluginConfig`  | Same as Helm chart                                                                                                    |
| `./local-plugins/ansible-plugin-backstage-self-service-dynamic-*.tgz`                       | `enabled: true` + frontend `pluginConfig` | See table below                                                                                                       |

`automation-portal-local` overlays (`overlay/dynamic-plugins.portal.yaml` and
`.portal.dev.yaml`) should add the same **`rhaap-app-auth`** package entry and
**disable RHDH `app-auth`** when the target image is RHDH 2.1 / NFS. Keep
host-contract parity between dev and tarball YAMLs per `automation-portal-local/AGENTS.md`.

#### B. `pluginConfig.dynamicPlugins.frontend.ansible.plugin-backstage-self-service`

Compared to **`ansible-portal-chart/values.yaml`** (production 1.10-shaped wiring)
and **`automation-portal-local`** (which still lists `apiFactories` for Scalprum):

| YAML key                    | Portal Helm chart                                      | rhdh-local (2.1 testing) | RHDH 2.1 effective source                                                                                                                    |
| --------------------------- | ------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `signInPage`                | `SignInPage`                                           | **Kept**                 | Ignored → `rhaap-app-auth` `SignInPageBlueprint`                                                                                             |
| `providerSettings`          | RHAAP provider row                                     | **Kept**                 | Largely ignored on NFS; keep for 1.10 YAML parity                                                                                            |
| `apiFactories`              | _not in Helm values_                                   | **Omitted**              | `AAPApis` + `EEBuildApis` via `ApiBlueprint` in `self-service/alpha.tsx`; OAuth via `rhaap-app-auth` (not `AapAuthApi` in self-service YAML) |
| `scaffolderFieldExtensions` | 10 extensions                                          | **Kept** (same list)     | `FormFieldBlueprint` in `alpha.tsx` + YAML for 1.10                                                                                          |
| `dynamicRoutes`             | Full splat routes + `menuItem`                         | **Kept** (same paths)    | **Ignored for routing** → `PageBlueprint` paths in `alpha.tsx`; do not remove until 1.10 is dropped                                          |
| `mountPoints`               | `LocationListener`, `AppThemeFixer`, `AAPLogoutButton` | **Unchanged**            | **Still required on 2.1** for listeners + profile sign-out                                                                                   |

**`apiFactories` on dual-version fleets:** For RHDH **1.10 only**, keep in overlay YAML:

```yaml
apiFactories:
  - importName: AAPApis
  - importName: AapAuthApi
  - importName: EEBuildApis
```

On **2.1-only** hosts, omit `apiFactories` from self-service YAML (duplicate
registration risk is low but unnecessary). Never list `AapAuthApi` on 2.1 if
`rhaap-app-auth` already registers the OAuth client.

**`dynamicRoutes` on 2.1:** Safe to leave in YAML for chart parity; NFS page
navigation comes from `alpha.tsx`. Removing `dynamicRoutes` on 2.1-only
deployments is optional once 1.10 is out of scope.

#### C. Minimal snippets to copy into a 2.1 overlay

RBAC + sign-in stack:

```yaml
plugins:
  - package: ref://backstage-community-plugin-rbac
    enabled: true

  - package: ref://red-hat-developer-hub-backstage-plugin-app-auth
    enabled: false

  - package: ./local-plugins/ansible-plugin-backstage-rhaap-app-auth-dynamic-2.2.8.tgz
    enabled: true
```

Self-service `pluginConfig` — **keep** at minimum for 2.1:

```yaml
- package: ./local-plugins/ansible-plugin-backstage-self-service-dynamic-2.2.8.tgz
  enabled: true
  pluginConfig:
    dynamicPlugins:
      frontend:
        ansible.plugin-backstage-self-service:
          # 1.10 parity (harmless on 2.1):
          signInPage:
            importName: SignInPage
          providerSettings:
            - title: RHAAP
              description: Sign in with RHAAP
              provider: ansible.auth.rhaap
          scaffolderFieldExtensions:
            # … same importName list as Helm chart …
          dynamicRoutes:
            # … same path list as Helm chart …
          # Still consumed on 2.1:
          mountPoints:
            - mountPoint: application/listener
              importName: LocationListener
            - mountPoint: application/listener
              importName: AppThemeFixer
            - importName: AAPLogoutButton
              mountPoint: global.header/profile
              config:
                priority: 100
```

`AppRootElementBlueprint` registrations in `self-service/alpha.tsx` cover
`LocationListener` and `AppThemeFixer` for NFS; the YAML `mountPoints` remain
for global-header integration and 1.10.

#### D. Related app-config (not `dynamicPlugins`, but required with RBAC)

Pair the RBAC plugin entry with app-config (e.g. `rhdh-local/configs/app-config/app-config.local.yaml`):

- `permission.enabled: true`
- `permission.rbac` (admin rules, policy file path such as `policies-csv-file`)
- `auth.providers.rhaap` and matching `app.baseUrl` / OAuth redirect URI

#### E. Follow-up for `ansible-portal-chart`

When productizing RHDH 2.1:

1. Add the `rhaap-app-auth` dynamic plugin package to Helm `values.yaml`.
2. Disable `red-hat-developer-hub-backstage-plugin-app-auth` on 2.1 images (or document operator toggle).
3. Keep the existing self-service `pluginConfig` block for 1.10 until that release line ends; split or template `apiFactories` / `dynamicRoutes` by RHDH major version if needed.

### Backend plugins are unaffected

Backend dynamic plugins using `createBackendModule()` from
`@backstage/backend-plugin-api` are **not affected** by the NFS migration.
They continue to work as-is.

---

## Current State Audit

### Plugins with source code (migration targets)

| Plugin                                      | Package                                                        | Role                     | NFS Ready | Notes                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| `rhaap-app-auth`                            | `@ansible/plugin-backstage-rhaap-app-auth`                     | `frontend-plugin-module` | ✅        | `FrontendModule` with `pluginId: 'app'` — sign-in + OAuth2 API (RHDH 2.1 only)            |
| `self-service`                              | `@ansible/plugin-backstage-self-service`                       | `frontend-plugin`        | ✅        | `src/alpha.tsx` + `compatWrapper`; legacy `src/index.ts` / `plugin.ts` unchanged for 1.10 |
| `backstage-rhaap`                           | `@ansible/plugin-backstage-rhaap`                              | `frontend-plugin`        | ⚠️        | `alpha.tsx` added; verify `/ansible` on 2.1 in Phase 2                                    |
| `backstage-rhaap-common`                    | `@ansible/backstage-rhaap-common`                              | `common-library`         | ✅        | Shared types/clients — no plugin registration needed                                      |
| `catalog-backend-module-rhaap`              | `@ansible/backstage-plugin-catalog-backend-module-rhaap`       | `backend-plugin-module`  | ✅        | Already uses `createBackendModule()`                                                      |
| `scaffolder-backend-module-backstage-rhaap` | `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`    | `backend-plugin-module`  | ✅        | Already uses `createBackendModule()`                                                      |
| `auth-backend-module-rhaap-provider`        | `@ansible/backstage-plugin-auth-backend-module-rhaap-provider` | `backend-plugin-module`  | ✅        | Already uses `createBackendModule()`                                                      |

### Dist-only plugins (out of scope — no source in this repo)

| Plugin                        | Contents                         |
| ----------------------------- | -------------------------------- |
| `backstage-apme`              | Pre-built dist/dist-dynamic only |
| `backstage-apme-common`       | Pre-built dist only              |
| `catalog-backend-module-apme` | Pre-built dist/dist-dynamic only |

### `self-service` — inventory of extensions to migrate

The `self-service` plugin is the largest frontend plugin. Its current YAML
wiring declares:

**Sign-in page** (1):

- `SignInPage` — custom component wrapping `@backstage/core-components`'s
  `SignInPage` with the RHAAP auth provider

**API factories** (3):

- `AAPApis` — Ansible API client (sync templates, user job templates)
- `AapAuthApi` — RHAAP OAuth2 auth API factory
- `EEBuildApis` — Execution Environment build trigger API

**Dynamic routes with sidebar items** (legacy Scalprum / RHDH 1.10 — still in overlay YAML):

- `/` → `LandingPage`
- `/self-service` → `SelfServicePage` / `RouteView` (1.10)
- `/self-service/*` → `TemplatesPage` + `TemplatesSidebarItem`
- `/self-service/create/tasks` → `HistoryPage` + `HistorySidebarItem`
- `/self-service/ee`, `/self-service/ee/*` → `EEPage` + `EEBuilderSidebarItem`
- `/self-service/collections`, `/self-service/collections/*` → `CollectionsPage` + `CollectionsSidebarItem`
- `/self-service/repositories`, `/self-service/repositories/*` → `GitRepositoriesPage` + `GitRepositoriesSidebarItem`

**RHDH 2.1 NFS `PageBlueprint` paths** (see `plugins/self-service/src/alpha.tsx` — **no splat mounts**):
| Area | NFS paths | Legacy route wrapper (1.10) |
|---|---|---|
| Index | `/self-service` → redirect `/self-service/catalog` | `RouteView` / `TemplatesRoutesPage` |
| Templates | `/self-service/catalog`, `/self-service/catalog/:namespace/:templateName`, `/self-service/create/templates/:namespace/:templateName` | `TemplatesRoutesPage` at `/self-service/*` |
| EE | `/self-service/ee` → `/self-service/ee/catalog`, `/self-service/ee/catalog`, `/self-service/ee/create` | `EERoutesPage` at `/self-service/ee/*` |
| Collections | `/self-service/collections`, `/self-service/collections/:collectionName` | `CollectionsRoutesPage` at `/self-service/collections/*` |
| Git repos | `/self-service/repositories` → `.../catalog`, `.../catalog`, `.../ci-activity`, `.../:repositoryName` | `GitRepositoriesRoutesPage` at `/self-service/repositories/*` |
| History | `/self-service/create/tasks` | `HistoryRoutesPage` |
| Landing | `/` | `LandingPage` |

**Scaffolder field extensions** (11):

- `AAPTokenFieldExtension`
- `AAPResourcePickerExtension`
- `AdditionalBuildStepsPickerFieldExtension`
- `BaseImagePickerFieldExtension`
- `CollectionsPickerFieldExtension`
- `EEFileNamePickerFieldExtension`
- `FileUploadPickerFieldExtension`
- `PackagesPickerFieldExtension`
- `MCPServersPickerFieldExtension`
- `ScmSelectorFieldExtension`
- `GitHubRepoUrlFieldExtension`

**Mount points / app-root elements** (3):

- `LocationListener` → `application/listener`
- `AppThemeFixer` → `application/listener`
- `AAPLogoutButton` → `global.header/profile`

### `backstage-rhaap` — inventory of extensions to migrate

- `AnsiblePage` — routable extension at `/ansible`
- `AppThemeFixer` — component extension

---

## Critical Constraint: Sign-In Page

### The problem

In the NFS, `app/root`'s `signInPage` input is declared with
`internal: true`:

```js
signInPage: createExtensionInput([componentDataRef], {
  singleton: true,
  optional: true,
  internal: true,
});
```

`internal: true` means **only extensions belonging to the same plugin**
(i.e., the `app` plugin, which owns `app/root`) can attach to it. A
`FrontendPlugin` with `pluginId: 'self-service'` **cannot** fill this
slot — Backstage's tree resolution silently excludes it. No error, no
warning, just never attached.

This was confirmed empirically: adding `console.warn` inside our
`SignInPageBlueprint` loader and rebuilding showed the loader function
**was never invoked**.

The upstream doc on `SignInPageBlueprint` explicitly states:

> _"Creates an extension that replaces the sign in page. This blueprint
> is limited to use by the app plugin."_

### The solution: `FrontendModule` targeting `pluginId: 'app'`

RHDH's own `@red-hat-developer-hub/backstage-plugin-app-auth`
([source](https://github.com/redhat-developer/rhdh-plugins/blob/main/workspaces/app-defaults/plugins/app-auth/src/appAuthModule.tsx))
demonstrates the correct pattern:

```typescript
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';

const signInPage = SignInPageBlueprint.make({
  params: {
    loader: () => import('./components/SignInPage').then(m => m.SignInPage),
  },
});

export const appAuthModule = createFrontendModule({
  pluginId: 'app', // ← targets the app plugin itself
  extensions: [signInPage, rhaapAuthApi],
});
```

A `FrontendModule` explicitly declares which plugin it _extends_ (via
`pluginId`). Its extensions are treated as belonging to that plugin,
bypassing the `internal: true` restriction. The comment in RHDH's own
source confirms: _"Default-export this module for dynamic frontend
loading."_

**This must be a separate package** (or at minimum a separately-exported
MF remote module) because:

1. A package's default export can only be ONE `FrontendPlugin` or
   `FrontendModule`.
2. `self-service` needs its own `FrontendPlugin` for pages/APIs/nav/scaffolder.
3. The sign-in module needs `pluginId: 'app'`, incompatible with
   `pluginId: 'self-service'`.

---

## Implementation Plan

### Phase 0 — `rhaap-app-auth` module (unblocks login on RHDH 2.1) — **DONE**

**Priority:** Highest — without this, RHAAP sign-in doesn't work on RHDH 2.1.

**Implemented:** `plugins/rhaap-app-auth/` with `src/alpha.ts` default-exporting
`createFrontendModule({ pluginId: 'app', extensions: [signInPage, rhaapAuthApi] })`.
Packaged as `ansible-plugin-backstage-rhaap-app-auth-dynamic-*.tgz`.

**rhdh-local / overlay wiring (required on RHDH 2.1):**

- Enable the `rhaap-app-auth` dynamic plugin package (no `pluginConfig` block).
- **Disable** `ref://red-hat-developer-hub-backstage-plugin-app-auth` — two
  `SignInPageBlueprint` extensions targeting `pluginId: 'app'` cause RHDH to fall
  back to guest-only sign-in (no RHAAP provider).
- Set `auth.providers.rhaap` + matching `app.baseUrl` / OAuth redirect URI
  (`…/api/auth/rhaap/handler/frame`).
- For popup OAuth failures (`PopupClosedError`), set
  `auth.providers.rhaap.signIn.resolvers` / app-level
  `enableExperimentalRedirectFlow: true` where your deployment supports it
  (see `app-config.yaml` in this repo and portal overlays).

**Do not duplicate OAuth in `self-service` alpha:** `AapAuthApi` remains exported
from `self-service` for RHDH 1.10 YAML `apiFactories`; NFS registers OAuth only
via `rhaap-app-auth`.

**RHDH 1.10 behavior:** This package is listed in `dynamic-plugins.yaml`
but has no `pluginConfig.dynamicPlugins.frontend` entry referencing it.
RHDH 1.10 loads it via Scalprum (auto-generated `PluginRoot` →
`src/index.ts`) and ignores it — a harmless no-op. The sign-in page on
1.10 continues to come from `self-service`'s `SignInPage` named export
via `signInPage.importName: SignInPage`.

**RHDH 2.1 behavior:** MF loader reads `./alpha`, finds the
`FrontendModule` default export with `pluginId: 'app'`, and registers
`SignInPageBlueprint` + RHAAP OAuth2 `ApiBlueprint`.

**Create:** `plugins/rhaap-app-auth/`

**Structure:**

```
plugins/rhaap-app-auth/
├── package.json
├── src/
│   ├── index.ts            # re-export for legacy compat
│   ├── alpha.ts            # default export = the FrontendModule
│   └── components/
│       └── SignInPage.tsx   # custom RHAAP sign-in page (move from self-service)
└── config.d.ts
```

**`src/alpha.ts`:**

```typescript
import {
  createFrontendModule,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { OAuth2 } from '@backstage/core-app-api';
import {
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';

// RHAAP auth API factory
const rhaapAuthApi = ApiBlueprint.make({
  name: 'rhaap-auth',
  params: define =>
    define({
      api: rhAapAuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
        OAuth2.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
          provider: { id: 'rhaap', title: 'RH AAP', icon: () => null },
          environment: configApi.getOptionalString('auth.environment'),
          defaultScopes: ['read', 'write'],
        }),
    }),
});

// Sign-in page extension (attaches to app/root.signInPage — internal)
const signInPage = SignInPageBlueprint.make({
  params: {
    loader: () => import('./components/SignInPage').then(m => m.SignInPage),
  },
});

/**
 * RHAAP sign-in page + OAuth2 API (pluginId: 'app').
 * Default-export for dynamic frontend loading.
 */
export default createFrontendModule({
  pluginId: 'app',
  extensions: [signInPage, rhaapAuthApi],
});
```

**`package.json` key fields:**

```json
{
  "name": "@ansible/backstage-plugin-rhaap-app-auth",
  "version": "0.1.0",
  "backstage": { "role": "frontend-plugin-module" },
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./alpha": "./src/alpha.ts"
  },
  "dependencies": {
    "@backstage/core-app-api": "...",
    "@backstage/core-plugin-api": "...",
    "@backstage/frontend-plugin-api": "...",
    "@backstage/plugin-app-react": "..."
  }
}
```

**`dynamic-plugins.yaml` entry:**

```yaml
- package: ./local-plugins/portal-dev/rhaap-app-auth
  disabled: false
```

No `pluginConfig` block needed — NFS extensions are self-describing.

**Files to update in `automation-portal-local`:**

- `overlay/dynamic-plugins.portal.dev.yaml` — add the new package entry
- `overlay/dynamic-plugins.portal.yaml` — add the tarball package entry

---

### Phase 1 — `self-service` NFS migration — **DONE** (with rhdh-local caveats below)

**RHDH 1.10 behavior:** Completely unchanged. Scalprum loads `PluginRoot`
→ `src/index.ts`. All existing named exports (`SignInPage`, `AAPApis`,
`AapAuthApi`, `EEBuildApis`, `LandingPage`, `SelfServicePage`, scaffolder
field extensions, etc.) continue to work. The YAML wiring in
`pluginConfig.dynamicPlugins.frontend.ansible.plugin-backstage-self-service`
is consumed as-is.

**RHDH 2.1 behavior:** MF loader reads `./alpha`, finds the
`FrontendPlugin` default export, registers all NFS extensions.

**Do NOT modify:** `src/index.ts`, `src/plugin.ts`, `src/apis.ts`, or any
existing component/scaffolder files. These are the RHDH 1.10 code path.

**Create:** `plugins/self-service/src/alpha.tsx`

**Blueprint mapping:**

| Legacy                                      | NFS Blueprint                             | Import from                                         |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `createRoutableExtension` → page route      | `PageBlueprint`                           | `@backstage/frontend-plugin-api`                    |
| `createApiFactory` in `apiFactories` YAML   | `ApiBlueprint`                            | `@backstage/frontend-plugin-api`                    |
| `createScaffolderFieldExtension`            | `FormFieldBlueprint`                      | `@backstage/plugin-scaffolder-react/alpha`          |
| `createComponentExtension` → app listener   | `AppRootElementBlueprint`                 | `@backstage/plugin-app-react`                       |
| Sidebar items from `menuItem.importName`    | `PageBlueprint`'s `title` + `icon` params | (derived automatically)                             |
| `AAPLogoutButton` → `global.header/profile` | TBD — check RHDH global-header extensions | `@red-hat-developer-hub/backstage-plugin-app-react` |

**Pages:** Do **not** use a single `PageBlueprint` at `/self-service/*` on RHDH 2.1.
That renders the NFS shell but leaves the outlet empty or breaks child routing.
Use **one blueprint per concrete URL** (see inventory table above). Wrap every
legacy tree with `compatWrapper` from `@backstage/core-compat-api`.

**Section entry components (NFS):**

- Templates: `TemplatesCatalogPage`, `TemplateDetailPage`, `TemplateCreatePage` (`Home.tsx`)
- EE: `EESectionPage` (`EERoutesPage.tsx`)
- Collections: `CollectionsSectionPage` (`CollectionsCatalogPage.tsx`)
- Git: `GitRepositoriesSectionPage` (`GitRepositoriesPage.tsx`)

**Scalprum (1.10) unchanged:** `RouteView`, `*RoutesPage` components still use
inner `<Routes>` where the host mounts a single splat path.

**Sidebar links (both hosts):** point at canonical NFS URLs — e.g.
`${root}/ee/catalog`, `${root}/repositories/catalog`, `${root}/catalog` — via
`useSelfServiceRootLink()` in `SidebarItems.tsx`.

**APIs (2 — rhaapAuthApi moved to Phase 0):**

```typescript
const ansibleApi = ApiBlueprint.make({
  name: 'ansible',
  params: define => define(AAPApis),
});
const eeBuildApi = ApiBlueprint.make({
  name: 'ee-build',
  params: define => define(EEBuildApis),
});
```

**Scaffolder field extensions (11):**

```typescript
import { FormFieldBlueprint } from '@backstage/plugin-scaffolder-react/alpha';

const aapTokenField = FormFieldBlueprint.make({
  name: 'aap-token-field',
  params: {
    field: {
      component: AAPTokenField,
      schema: AAPTokenFieldFieldSchema,
    },
  },
});
// ... similarly for all 11 field extensions
```

**App-root elements (2):**

```typescript
import { AppRootElementBlueprint } from '@backstage/plugin-app-react';

const locationListener = AppRootElementBlueprint.make({
  name: 'location-listener',
  params: {
    element: lazy(() => import('./components/LocationListener').then(m => <m.LocationListener />)),
  },
});
// ... similarly for AppThemeFixer
```

**Plugin definition:** `createFrontendPlugin` in `alpha.tsx` registers all
page blueprints listed in the inventory table, `ansibleApi` + `eeBuildApi`,
scaffolder `FormFieldBlueprint`s, `AppRootElementBlueprint`s (`LocationListener`,
`AppThemeFixer`), and legacy route refs for compat (`convertLegacyRouteRef`).
`AAPLogoutButton` remains **YAML-only** (`mountPoints` → `global.header/profile`).

**`package.json` changes (additive only — keep all existing fields):**

```json
"exports": {
  ".": "./src/index.ts",
  "./alpha": "./src/alpha.tsx"
}
```

**Dependencies to add:**

```json
"@backstage/frontend-plugin-api": "^0.17.1",
"@backstage/plugin-app-react": "^0.2.3",
"@backstage/plugin-scaffolder-react": "^1.20.0"
```

Do not modify `main`, `types`, or any other existing `package.json` fields.

---

### Phase 2 — `backstage-rhaap` NFS migration

Same dual-compat pattern as Phase 1: add `alpha.tsx`, keep `index.ts` untouched.

**Do NOT modify:** `src/index.ts`, `src/plugin.ts`, or any existing files.

**Create:** `plugins/backstage-rhaap/src/alpha.tsx`

```typescript
import { createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';
import { rootRouteRef } from './routes';

const ansiblePage = PageBlueprint.make({
  name: 'ansible',
  params: {
    path: '/ansible',
    title: 'Ansible',
    routeRef: rootRouteRef,
    loader: () => import('./components/AnsiblePage').then(m => <m.AnsiblePage />),
  },
});

export default createFrontendPlugin({
  pluginId: 'ansible',
  extensions: [ansiblePage],
});
```

**`package.json` changes (additive only):**

```json
"exports": {
  ".": "./src/index.ts",
  "./alpha": "./src/alpha.tsx"
}
```

---

### Phase 3 — Verification & overlay updates

1. **Build & typecheck:** `yarn tsc && yarn build:all`
2. **Run tests:** `yarn test`
3. **Export dynamic plugins:** `make reload-fe` / `make reload PLUGINS=...`
4. **Verify in browser:**
   - RHAAP sign-in page appears (Phase 0)
   - Self-service pages load: templates, EE, collections, git repos, history
   - Scaffolder fields render in template forms
   - Sidebar navigation items appear with correct icons
   - Ansible page loads at `/ansible`
5. **Update `automation-portal-local` overlays:**
   - **ADD** `rhaap-app-auth` dynamic plugin entry (no `pluginConfig` block)
   - **KEEP** all existing `pluginConfig.dynamicPlugins.frontend` YAML blocks
     (signInPage, apiFactories, dynamicRoutes, mountPoints,
     scaffolderFieldExtensions) — these are still required for RHDH 1.10
     and are harmlessly ignored by RHDH 2.1 for **routing/sign-in** (NFS uses
     `alpha.tsx`). Some keys (e.g. `mountPoints`, `apiFactories` on 2.1) may
     still be processed for non-NFS plugins — do not delete without parity review.
   - Ensure host-contract parity: update BOTH `overlay/dynamic-plugins.portal.dev.yaml` AND `overlay/dynamic-plugins.portal.yaml`

6. **rhdh-local loop** (repeat after every `export-dynamic` + `npm pack`):
   - `yarn workspace @ansible/plugin-backstage-self-service export-dynamic`
   - Copy/repack tarball to `rhdh-local/local-plugins/`
   - Run compose so `prepare-and-install-dynamic-plugins.sh` clears stale
     `plugin-backstage-self-service-dynamic` under `dynamic-plugins-root`
   - `podman compose up -d` and hard-refresh the browser (or clear site data)

---

## RHDH 2.1 NFS runtime learnings (rhdh-local validation)

These issues appeared when running the exported MF bundle on RHDH 2.1 and were
fixed in `ansible-backstage-plugins` without breaking the RHDH 1.10 code path.

### 1. Nested `<Routes>` + splat `PageBlueprint` paths do not work

**Symptoms:** Blank page (only plugin title shell), or wrong page content.

**Cause:** Mounting at `/self-service/*` (or `ee/*`, `repositories/*`) does not
give inner React Router a matching parent route for segments like `catalog` or
`create` against the **full** browser pathname (`/self-service/ee/catalog`).

**Fix:**

- Register **explicit** `PageBlueprint` paths per screen (templates catalog,
  template detail, EE catalog/create, git catalog/CI/detail, collections list/detail).
- Inside legacy wrappers, resolve the view with `useLocation().pathname` +
  `matchPath` and **absolute** paths (see `resolveTemplatesRouteElement` in
  `Home.tsx`, `resolveEERouteElement`, `resolveGitRepositoriesRouteElement`,
  `resolveCollectionsRouteElement`).

### 2. Relative `<Navigate to="catalog" />` redirects to Templates

**Symptoms:** EE or Git Repos “open” then immediately land on `/self-service/catalog`.

**Cause:** When inner routes fail to match, a catch-all `Navigate to="catalog"`
resolves relative to the URL incorrectly under MF/NFS (often to `/catalog`).
`LocationListener` then maps `/catalog` → `/self-service/catalog`.

**Fix:** Never use relative `Navigate` for section defaults. Use absolute targets
(`/self-service/ee/catalog`, `/self-service/repositories/catalog`) in both
`alpha.tsx` index pages and pathname resolvers.

### 3. `useRouteRef(rootRouteRef)` throws on section pages

**Symptoms:** `No path for routeRef{id=self-service.root,…}` on EE / Collections / Git.

**Cause:** NFS binds `routeRef` only on the `PageBlueprint` that declares it
(e.g. `templatesRouteRef` on `/self-service/catalog`). Section pages do not bind
`rootRouteRef`.

**Fix:**

- `SELF_SERVICE_ROOT_PATH` + `(rootRouteRef as { optional?: boolean }).optional = true`
  in `routes.ts`.
- `useSelfServiceRootLink()` — `useRouteRef(rootRouteRef)` with fallback to
  `/self-service` (`hooks/useSelfServiceRootLink.ts`).
- Replace direct `useRouteRef(rootRouteRef)` across EE, collections, git, sidebar,
  task list, catalog cards, etc.

### 4. `react-router` vs `react-router-dom` / `useNavigate` under MF

**Symptoms:** Generic runtime error in `HomeComponent` or navigation hooks.

**Fix:** Import routing hooks from `react-router-dom` in plugin UI code. Avoid
`useNavigate` in components that must run in fragile MF contexts where possible
(e.g. “Add template” uses `window.location.assign('/self-service/catalog-import')`).

### 5. `compatWrapper` is mandatory

Legacy components use `@backstage/core-plugin-api` (`useApi`, `useRouteRef`,
`RequirePermission`). Every `PageBlueprint` / `AppRootElementBlueprint` loader
must wrap the tree with `compatWrapper(...)` from `@backstage/core-compat-api`.

### 6. `ChunkLoadError` on lazy route chunks

**Symptoms:** Templates works; EE or Collections shows `ChunkLoadError` loading
chunk `5085.*.js`, `8500.*.js`, etc. from
`/.backstage/dynamic-features/remotes/@ansible/plugin-backstage-self-service-dynamic/static/…`.

**Cause:** `PageBlueprint` loaders use `import('./components/…')`, which emits
async chunks. Reinstalling a new build into a **persistent** `dynamic-plugins-root`
volume without removing the old `plugin-backstage-self-service-dynamic` directory
leaves mismatched `remoteEntry.js` hashes vs on-disk chunk files (or browser cache).

**Mitigation (implemented in `rhdh-local/prepare-and-install-dynamic-plugins.sh`):**
When a local self-service `.tgz` is present, delete
`dynamic-plugins-root/**/plugin-backstage-self-service-dynamic` before
`install-dynamic-plugins.sh`.

**Operator checklist:**

- Re-export + repack after code changes; do not mix tarballs from different builds.
- Hard-refresh or clear site data after deploy.
- If error persists, wipe the entire `dynamic-plugins-root` volume once, then
  recreate the stack.

**Future option (not implemented):** Eager-import section modules in `alpha.tsx`
to reduce the number of async chunks (trade-off: larger initial MF payload).

### 7. Backend / config notes for local AAP integration

Observed while testing catalog and permissions on rhdh-local (not NFS-specific but
required for a working stack):

- **Catalog module:** `catalog.providers.rhaap` schedule/provider toggles — disable
  heavy providers (e.g. job templates / PAH collections) in dev if the controller
  lacks those endpoints (avoids backend crash during sync).
- **Database:** Non-Postgres local compose may need SQLite backend overrides in
  `app-config.local.yaml`.
- **RBAC:** Enable `permission.enabled` / `permission.rbac` and supply
  `policies-csv-file` (e.g. `ansible.templates.view`, `ansible.execution-environments.view`)
  so `RequirePermission` matches production expectations.
- **Community RBAC plugin:** Enable `backstage-community-plugin-rbac` in
  `dynamic-plugins.yaml` when testing permission-gated pages.

### 8. `LocationListener` legacy URL normalization

`LocationListener` still redirects bare `/`, `/create`, and `/catalog` paths to
self-service templates URLs for bookmarks and old links. Fixing relative navigates
(§2) prevents **incorrect** hits on `/catalog` when users are on EE/Git routes.

---

## Available NFS Packages (installed versions)

| Package                              | Version | Provides                                                                                                                       |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@backstage/frontend-plugin-api`     | 0.17.1  | `createFrontendPlugin`, `createFrontendModule`, `PageBlueprint`, `ApiBlueprint`, `AppRootElementBlueprint`, `SubPageBlueprint` |
| `@backstage/plugin-app-react`        | 0.2.3   | `SignInPageBlueprint`, `AppRootWrapperBlueprint`, `NavContentBlueprint`, `ThemeBlueprint`, `TranslationBlueprint`              |
| `@backstage/plugin-scaffolder-react` | 1.20.0  | `FormFieldBlueprint` (from `/alpha` export)                                                                                    |
| `@backstage/frontend-defaults`       | 0.5.2   | `createApp()` (used by RHDH, useful for dev/test app)                                                                          |
| `@backstage/core-compat-api`         | 0.5.11  | Legacy-to-NFS compatibility wrappers (transition aid)                                                                          |

---

## Key References

- [RHDH: Migrating Plugins to NFS](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md)
- [RHDH: Migrating Config to NFS](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-config-to-new-frontend-system.md)
- [RHDH: Legacy Frontend Plugin Wiring](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/frontend-plugin-wiring.md)
- [RHDH `app-auth` module source](https://github.com/redhat-developer/rhdh-plugins/blob/main/workspaces/app-defaults/plugins/app-auth/src/appAuthModule.tsx)
- [RHDH `App.tsx` source](https://github.com/redhat-developer/rhdh/blob/main/packages/app/src/App.tsx)
- [Backstage: Frontend System Introduction](https://backstage.io/docs/frontend-system/)
- [Backstage: `SignInPageBlueprint` API](https://backstage.io/api/stable/variables/_backstage_plugin-app-react.SignInPageBlueprint.html)

---

## Risk Register

| Risk                                                                                                                 | Impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFS splat routes + nested `<Routes>`                                                                                 | Blank pages or redirects to Templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Explicit `PageBlueprint` paths + pathname `matchPath` resolvers (documented above)                                                                                                                                                           |
| Stale MF chunks in `dynamic-plugins-root`                                                                            | `ChunkLoadError` on EE/Collections/Git lazy imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Clear plugin dir on reinstall; hard-refresh browser                                                                                                                                                                                          |
| `useRouteRef(rootRouteRef)` on NFS section pages                                                                     | Runtime error, page crash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `optional` root ref + `useSelfServiceRootLink()`                                                                                                                                                                                             |
| Two `SignInPageBlueprint` extensions                                                                                 | Guest-only login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Disable RHDH `app-auth`; enable only `rhaap-app-auth` on 2.1                                                                                                                                                                                 |
| `FormFieldBlueprint` API changed since our `@backstage/plugin-scaffolder-react` version                              | Scaffolder fields don't render                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pin version, check RHDH's bundled version matches                                                                                                                                                                                            |
| `AppRootElementBlueprint` doesn't support `LocationListener` pattern                                                 | Theme/location listeners break                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Check if `AppRootWrapperBlueprint` is more appropriate                                                                                                                                                                                       |
| Legacy exports removed accidentally                                                                                  | Breaks RHDH 1.10 deployments                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Dual exports (`src/index.ts` + `src/alpha.tsx`) and legacy YAML blocks are **permanent** — not transitional. Enforce via code review.                                                                                                        |
| Legacy YAML blocks removed from overlays                                                                             | RHDH 1.10 loses all frontend wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Never strip `pluginConfig.dynamicPlugins.frontend` blocks — they are harmless on 2.1, required on 1.10                                                                                                                                       |
| Multiple sign-in-page extensions conflict                                                                            | Guest-only fallback renders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ensure only `rhaap-app-auth` is enabled; disable RHDH's default `app-auth` if present                                                                                                                                                        |
| Pre-existing, repo-wide `nanoid@^5.1.6` (ESM-only, PR #604 security bump) breaks `postcss`'s CJS `require('nanoid')` | `yarn build:all` / plain `backstage-cli package build` (and `rhdh-cli plugin export --embed-package`, used by `auth-backend-module-rhaap-provider` and other backend modules) fail with `ERR_REQUIRE_ESM`. **Confirmed pre-existing on clean `main`, unrelated to this migration** — reproduces identically with zero of this migration's changes applied. Frontend-plugin exports (`self-service`, `backstage-rhaap`, `rhaap-app-auth`) are unaffected — their `rhdh-cli plugin export` path doesn't hit `postcss`. | Out of scope for this migration; needs a separate fix (e.g. `packageExtensions`-scoped resolution back to a CJS-compatible `nanoid` for `postcss`'s dependency chain, or an upstream `postcss`/`nanoid` compat fix). Flagged to repo owners. |

---

## Investigation Findings (Phase 3 follow-ups)

### `AAPLogoutButton` mount point (`global.header/profile`) — **no code change needed**

**Finding:** RHDH's own `@red-hat-developer-hub/backstage-plugin-global-header` (v1.20.3, bundled with RHDH 2.1) has **not** migrated to NFS blueprints itself — it still declares `role: frontend-plugin` with no `./alpha` export, and its own shipped `app-config.dynamic.yaml` wires every one of its extension points (`global.header/component`, `global.header/profile`, `global.header/application-launcher`, etc.) exclusively via the legacy `pluginConfig.dynamicPlugins.frontend.<pluginId>.mountPoints` YAML mechanism — the same mechanism our `AAPLogoutButton` already uses. RHDH 2.1 must therefore keep fully processing this legacy YAML mount-point config for **any** installed plugin (its own core header plugin depends on it), independent of whether that plugin _also_ ships an NFS `./alpha` feature.

There is no NFS blueprint exposed by `global-header` for profile-menu items (no `ProfileMenuItemBlueprint` or similar) — the only integration surface it offers is the legacy YAML `mountPoints` list. Consequently there is no "NFS equivalent" to migrate to; the legacy path _is_ the only path, on both RHDH versions.

**Conclusion:** The existing legacy block in `self-service`'s `pluginConfig.dynamicPlugins.frontend.ansible.plugin-backstage-self-service.mountPoints` (`AAPLogoutButton` → `global.header/profile`), which this migration deliberately preserves unchanged, should continue to register the sign-out menu item on **both** RHDH 1.10 and RHDH 2.1. No new `rhaap-app-auth`/alpha.tsx code was added for this — there is nothing to add.

**Caveat:** Not empirically confirmed in a live RHDH 2.1 browser session (out of scope for this pass — no browser-automation tool available, and starting a full local RHDH 2.1 stack requires bypassing this environment's sandbox). Recommended manual check: log into a running RHDH 2.1 instance with these plugins installed and confirm "Sign out" appears (with the AAP-branded logout that revokes the RHAAP OAuth token) in the profile dropdown.

### Permission-gated sidebar items (`EEBuilderSidebarItem`, `CollectionsSidebarItem`, etc.) — **known UX gap, security boundary intact**

**Finding:** NFS's `PageBlueprint` only supports static `title`/`icon` params (verified via `@backstage/frontend-plugin-api`'s type definitions) — there is no per-item, per-user visibility predicate. Nav items are derived from each page's `core.title`/`core.icon` extension-data outputs at plugin-registration time, before any user/auth context exists, so a runtime `usePermission()` check (as the legacy `PermissionGatedSidebarItem` component does) cannot gate them.

The only nav-customization surface NFS exposes is `NavContentBlueprint` (`@backstage/plugin-app-react`), which **replaces the entire nav bar** and is explicitly "limited to use by the app plugin" (same restriction as `SignInPageBlueprint`). Using it from a scoped feature plugin to filter just a handful of items would mean reimplementing/owning RHDH's _entire_ global nav rendering — a large, high-maintenance, upgrade-fragile undertaking, and not appropriate for this plugin's scope.

Because of this, `self-service/src/alpha.tsx`'s pages with `title`/`icon` on their
`PageBlueprint` (`eeCatalogPage`, `collectionsListPage`, `gitRepositoriesCatalogPage`,
`templatesCatalogPage`, `historyPage`, etc.) show nav sidebar entries **unconditionally**
on RHDH 2.1, regardless of RBAC (`ansible.execution-environments.view`, etc.) —
unlike RHDH 1.10, where `PermissionGatedSidebarItem` hides them.

**This is a UX regression only, not a security regression:** every one of the underlying page components already wraps its content in `<RequirePermission permission={...}>` (`@backstage/plugin-permission-react`) — confirmed in `EERoutesPage.tsx`, `GitRepositoriesPage.tsx`, `CollectionsCatalogPage.tsx`, `Home.tsx` (Templates), and `TaskList.tsx` (History). A user without the relevant view permission who clicks an always-visible nav link (or navigates directly by URL) is shown `RequirePermission`'s "Unauthorized" fallback, not the actual feature — the enforcement boundary is unchanged.

**Recommendation:** Accept the interim UX gap (nav items always visible; content still gated) rather than attempting a full `NavContentBlueprint` takeover. Revisit if/when Backstage's NFS ships a native per-extension visibility predicate tied to permissions, or if the UX gap becomes a real user complaint (in which case a dedicated ADR/design review for a custom `NavContentBlueprint` wrapper — using its `navItems.take()`/`.rest()` API to selectively wrap only our own items — would be the next step).

**Caveat:** Same as above — not empirically confirmed in a live browser session; based on static analysis of `@backstage/frontend-plugin-api` and `@backstage/plugin-app-react` type definitions plus the existing `RequirePermission` usage in this codebase.

---

## File index (NFS-related changes)

| File                                                                                | Role                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `plugins/rhaap-app-auth/src/alpha.ts`                                               | RHDH 2.1 sign-in + OAuth (`pluginId: 'app'`)                                         |
| `plugins/self-service/src/alpha.tsx`                                                | All NFS blueprints and page paths                                                    |
| `plugins/self-service/src/routes.ts`                                                | `SELF_SERVICE_ROOT_PATH`, optional `rootRouteRef`                                    |
| `plugins/self-service/src/hooks/useSelfServiceRootLink.ts`                          | Safe root path for links                                                             |
| `plugins/self-service/src/components/Home/Home.tsx`                                 | Templates NFS pages + pathname routing                                               |
| `plugins/self-service/src/components/ExecutionEnvironments/EERoutesPage.tsx`        | EE pathname routing + `EESectionPage`                                                |
| `plugins/self-service/src/components/GitRepositories/GitRepositoriesPage.tsx`       | Git pathname routing + `GitRepositoriesSectionPage`                                  |
| `plugins/self-service/src/components/CollectionsCatalog/CollectionsCatalogPage.tsx` | Collections pathname routing + `CollectionsSectionPage`                              |
| `plugins/self-service/src/components/SidebarItems/SidebarItems.tsx`                 | Canonical `/ee/catalog`, `/repositories/catalog` links                               |
| `plugins/self-service/src/components/LocationListener/LocationListener.ts`          | Legacy `/catalog` → templates redirects                                              |
| `rhdh-local/prepare-and-install-dynamic-plugins.sh`                                 | Clear stale self-service MF install (ChunkLoadError)                                 |
| `rhdh-local/configs/dynamic-plugins/dynamic-plugins.yaml`                           | RHDH 2.1 plugin list + self-service `pluginConfig` (§ Dynamic plugins list)          |
| `automation-portal-local/overlay/dynamic-plugins.portal.yaml`                       | Production-shaped tarball overlay; add `rhaap-app-auth` + disable `app-auth` for 2.1 |
| `automation-portal-local/overlay/dynamic-plugins.portal.dev.yaml`                   | Dev overlay; keep `apiFactories` for 1.10 Scalprum loop                              |
| `ansible-portal-chart/values.yaml`                                                  | Baseline RHAAP `pluginConfig` (no `rhaap-app-auth` until chart updated)              |

---

_Assisted-by: Composer_
