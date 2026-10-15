# Portal SDK — Legacy Dynamic Plugin Deployment Notes

> **Historical compatibility notes:** The singleton, Scalprum, Janus CLI and
> mount-point YAML examples below describe the earlier implementation. They are not instructions
> for the current native app or RHDH `next-2.1` deployment. Native composition is
> now the default and does not use a shared mutable registry for contributions.
> Use the [plugin author guide](portal-sdk-plugin-author-guide.md) and
> [NFS composition guide](portal-sdk-nfs-composition.md) for current contracts.
> Use checked-in `export-dynamic` scripts and the local development runbook for
> current packaging; do not copy the legacy commands or compatibility table as
> supported-release guidance.

This guide covers how to export and deploy portal frontend and backend plugins as RHDH dynamic plugins, with specific attention to the singleton registry requirement.

## Background

RHDH loads plugins as separate JavaScript bundles at runtime using [Scalprum](https://github.com/scalprum/scaffolding). Each bundle is isolated — when two plugins both import `@ansible/portal-extension-api`, they would normally each get their own copy of the `contributionRegistry` singleton, making it impossible for host components to see contributions from community plugins.

The solution is to configure `portal-extension-api` (and other shared packages) as **externals** — RHDH serves a single shared copy that all plugins share at runtime.

## The singleton problem

```
Without shared packages:
  ┌─ host plugin ──────────────────────────┐
  │  portal-extension-api (copy A)         │
  │  contributionRegistry → (empty)        │
  └────────────────────────────────────────┘

  ┌─ community plugin ─────────────────────┐
  │  portal-extension-api (copy B)         │
  │  registerGitRepoDetailTab(...)         │
  │  contributionRegistry → (has tabs)     │ ← different object!
  └────────────────────────────────────────┘

With shared packages:
  ┌─ shared package ───────────────────────┐
  │  portal-extension-api (single copy)    │
  │  contributionRegistry → (has tabs)     │ ← same object
  └────────────────────────────────────────┘
         ↑ host plugin reads from here
         ↑ community plugin writes to here
```

## Export a frontend plugin as a dynamic plugin

### 1. Add the export-dynamic script

In your plugin's `package.json`:

```json
{
  "scripts": {
    "export-dynamic": "janus-cli package export-dynamic-plugin --embed-as-dependencies"
  }
}
```

### 2. Create `src/dynamic/index.ts`

This is the entry point RHDH calls when the plugin loads:

```ts
// src/dynamic/index.ts
import {
  registerManifest,
  registerGitRepoDetailTab,
} from '@ansible/portal-extension-api';
import { myPluginManifest } from '../manifest';
import { TrustSignalsTab } from '../components/TrustSignalsTab';

registerManifest(myPluginManifest);

registerGitRepoDetailTab({
  id: 'my-plugin.trust-signals',
  label: 'Trust Signals',
  component: TrustSignalsTab,
});
```

> **Important:** The `dynamic/index.ts` entry point is called once when RHDH loads the bundle. Keep it side-effect-only — register contributions, but do not fetch data or mount React trees here.

### 3. Configure shared packages

In your plugin's `package.json`, declare the portal SDK packages as peer dependencies (not bundled dependencies):

```json
{
  "peerDependencies": {
    "react": "^18.3.0",
    "@backstage/core-plugin-api": "*",
    "@ansible/portal-extension-api": "workspace:^",
    "@ansible/portal-plugin-sdk": "workspace:^"
  },
  "devDependencies": {
    "@ansible/portal-extension-api": "workspace:^",
    "@ansible/portal-plugin-sdk": "workspace:^"
  }
}
```

Peer dependencies are **not bundled** into the dynamic plugin output — they are loaded from the shared package store at runtime.

### 4. Configure in `dynamic-plugins.yaml`

In the RHDH configuration file that controls which dynamic plugins are loaded:

```yaml
plugins:
  # Host plugin (always enabled — owns the shared packages)
  - package: '@ansible/plugin-backstage-self-service'
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          ansible.plugin-backstage-self-service:
            mountPoints:
              - mountPoint: 'entity.page.overview/cards'
                importName: 'EntitySwitch'

  # Community plugin
  - package: '@my-org/my-plugin'
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          my-org.my-plugin:
            # Dynamic entry point is called automatically on load
            dynamicRoutes: []

sharedPackages:
  # The portal SDK packages MUST be declared here as singletons.
  # This ensures all plugins share one registry instance.
  - package: '@ansible/portal-extension-api'
    singleton: true
  - package: '@ansible/portal-plugin-sdk'
    singleton: true
  - package: '@ansible/portal-extension-common'
    singleton: true

  # Standard Backstage shared packages (also required)
  - package: '@backstage/core-plugin-api'
    singleton: true
  - package: 'react'
    singleton: true
  - package: 'react-dom'
    singleton: true
  - package: '@material-ui/core'
    singleton: true
```

## Export a backend plugin as a dynamic plugin

Backend plugins are deployed as Node.js modules. The export process is simpler because there is no singleton concern — Node.js `require()` caches modules by file path within a single process.

### 1. Add the export script

```json
{
  "scripts": {
    "export-dynamic": "janus-cli package export-dynamic-plugin"
  }
}
```

### 2. Register the backend plugin

RHDH backend dynamic plugins are registered via the `dynamic-plugins.yaml` backend section:

```yaml
plugins:
  - package: '@ansible/portal-health-backend'
    disabled: false

  - package: '@my-org/my-plugin-backend'
    disabled: false
```

### 3. Configure in `app-config.yaml`

Your backend plugin's configuration goes under its `pluginId`:

```yaml
my-plugin:
  # Plugin-specific configuration
  syncIntervalMinutes: 30
  retryCount: 3
```

Access it in your plugin via `coreServices.rootConfig`.

## Build and publish

```bash
# Build the dynamic plugin export
yarn workspace @my-org/my-plugin export-dynamic

# The output is in dist-dynamic/
ls dist-dynamic/

# For RHDH, package it as an OCI image:
yarn workspace @my-org/my-plugin build-image \
  --tag quay.io/my-org/my-plugin:1.0.0
```

## Verify singleton wiring locally

To verify that the registry singleton is shared correctly in the local dev environment:

1. Start the dev server: `yarn start`
2. Open the browser console
3. Look for `DynamicExtensionDiscovery` log messages — they appear on startup and list all registered manifests
4. If a plugin registered a contribution but it doesn't appear in the UI, it's likely a singleton misconfiguration

In the dev environment (`yarn start`), all packages are loaded from the monorepo and the singleton works automatically — no special configuration is needed.

## Troubleshooting

### "Contribution registered but not rendered"

The plugin's `registerGitRepoDetailTab` call hit a different `contributionRegistry` instance than the host reads from. Fix: ensure `@ansible/portal-extension-api` is listed in `sharedPackages` with `singleton: true`.

### "Cannot find module '@ansible/portal-extension-api'"

The package is listed as a peer dependency but is not in `sharedPackages`. Add it, or temporarily add it to `dependencies` (which bundles it — workaround only, breaks the singleton).

### "Manifest validation failed"

Check the browser console for `[DynamicExtensionDiscovery]` error messages. The most common causes:

- `capabilityId` contains spaces or uppercase
- `experienceId` references an ID not in `EXPERIENCE_IDS`
- `launch.type` is misspelled

Run `validateManifest` in a test to catch these before deployment:

```ts
import { validateManifest } from '@ansible/portal-extension-host';

test('my manifest is valid', () => {
  const result = validateManifest(myPluginManifest);
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});
```

### Health status shows "UNKNOWN"

The backend plugin has not called `pushHealthStatus`. Check that:

1. `createPortalPlugin({ pluginId: '...' })` is called with the correct `pluginId`
2. `pushHealthStatus({ state: 'READY', ... })` is called in the `registerInit` callback after initialization
3. `@ansible/portal-health-backend` is registered in `packages/backend/src/index.ts`

## Version compatibility

| Portal SDK version | Backstage version | RHDH version |
| ------------------ | ----------------- | ------------ |
| `0.x` (historical) | ^1.39.1           | 2.0+         |

The SDK packages follow semantic versioning. Shared package declarations in `dynamic-plugins.yaml` should pin to a minor version to prevent breaking changes from automatically deployed updates.
