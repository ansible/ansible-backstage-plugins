---
render_macros: false
---

# Portal SDK — Developer Quickstart

> **Legacy compatibility example:** The registration helpers below describe the
> legacy registry path, not the default NFS integration. For native declarations
> and current contribution contracts, use [Portal NFS composition](portal-sdk-nfs-composition.md).

> Build your first portal plugin in 30 minutes.

This guide walks you through creating a frontend plugin that contributes a custom tab to the Git Repository detail page, backed by a Node.js backend plugin that reports health and emits audit events.

## Prerequisites

- Familiarity with Backstage plugin development
- Node.js 20 or 22
- Yarn 4 (`corepack enable && corepack prepare yarn@4.9.2 --activate`)
- A running Backstage instance (or this monorepo's dev server: `yarn start`)

## 1. Understand the plugin model

A portal plugin consists of up to three parts:

```
my-plugin/
├── plugins/my-plugin/          # Frontend — React components, contribution registration
├── plugins/my-plugin-backend/  # Backend — Express routes, health, audit events
└── plugins/my-plugin-common/   # Optional — shared types
```

The frontend plugin **registers contributions** with the host at load time. The host **renders** those contributions inside experience slots with error isolation and theme injection.

The key packages:

| Package                          | Your plugin depends on it for                                  |
| -------------------------------- | -------------------------------------------------------------- |
| `@ansible/portal-extension-api`  | Registering tabs, cards, manifests                             |
| `@ansible/portal-plugin-sdk`     | Shared UI components, `usePortalContext`, `useIsSuperuser`     |
| `@ansible/portal-plugin-node`    | Identity middleware, health, audit events                      |
| `@ansible/portal-extension-host` | (Host only) Rendering contributions — you don't depend on this |

## 2. Create the frontend plugin

### 2a. Package setup

In `workspaces/my-plugin/plugins/my-plugin/package.json`:

```json
{
  "name": "@ansible/my-plugin",
  "version": "0.1.0",
  "backstage": { "role": "frontend-plugin" },
  "peerDependencies": {
    "react": "^18.3.0",
    "@material-ui/core": "^4.0.0",
    "@backstage/core-plugin-api": "*"
  },
  "dependencies": {
    "@ansible/portal-extension-api": "workspace:^",
    "@ansible/portal-plugin-sdk": "workspace:^"
  },
  "devDependencies": {
    "react": "^18.3.0",
    "@backstage/core-plugin-api": "^1.9.0"
  }
}
```

### 2b. Write a contributed tab component

```tsx
// src/components/TrustSignalsTab/TrustSignalsTab.tsx
import React from 'react';
import { usePortalContext } from '@ansible/portal-plugin-sdk';
import { SkeletonLoader, EmptyState } from '@ansible/portal-plugin-sdk';
import type { ActionContext } from '@ansible/portal-extension-api';

// This component receives the catalog entity for the current detail page.
export function TrustSignalsTab({ entity }: ActionContext) {
  const { organizationIds, loading, error } = usePortalContext();

  if (loading) return <SkeletonLoader count={3} />;
  if (error) return <p>Organization context is unavailable.</p>;

  // Use CSS custom properties injected by ContributionWrapper (no MUI import needed):
  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ color: 'var(--portal-color-primary)' }}>
        Trust Signals for {entity.metadata.name}
      </h3>
      <p style={{ color: 'var(--portal-color-text-secondary)' }}>
        Organizations: {organizationIds.join(', ')}
      </p>
      {/* your content */}
    </div>
  );
}
```

### 2c. Write your manifest

```ts
// src/manifest.ts
import type { PluginManifest } from '@ansible/portal-extension-api';

export const myPluginManifest: PluginManifest = {
  pluginId: 'my-plugin',
  version: '1.0.0',
  capabilities: [
    {
      capabilityId: 'my-plugin.trust-signals',
      displayName: 'Trust Signals',
      description: 'Supply chain trust scores for Ansible content.',
      entryPoints: [
        {
          surface: 'tab',
          experienceId: 'git-repo-detail',
          launch: {
            type: 'slot',
            slotId: 'git-repo-detail.tab.my-plugin.trust-signals',
          },
          label: 'Trust Signals',
        },
      ],
    },
  ],
};
```

### 2d. Register in the dynamic entry point

```ts
// src/dynamic/index.ts
import {
  registerManifest,
  registerGitRepoDetailTab,
} from '@ansible/portal-extension-api';
import { myPluginManifest } from '../manifest';
import { TrustSignalsTab } from '../components/TrustSignalsTab';

// Register the manifest (validated by the host at startup)
registerManifest(myPluginManifest);

// Register the tab contribution
registerGitRepoDetailTab({
  id: 'my-plugin.trust-signals',
  label: 'Trust Signals',
  component: TrustSignalsTab,
});
```

> **Why two calls?** The manifest describes the plugin's capabilities in a serializable format (used for validation, permission checks, and future features like feature flags). The `registerGitRepoDetailTab` call registers the actual React component. Both are needed.

## 3. Create the backend plugin

### 3a. Package setup

```json
{
  "name": "@ansible/my-plugin-backend",
  "backstage": { "role": "backend-plugin" },
  "dependencies": {
    "@ansible/portal-plugin-node": "workspace:^",
    "express": "^4",
    "express-promise-router": "^4"
  }
}
```

### 3b. Create the plugin instance

```ts
// src/portalPlugin.ts
import { createPortalPlugin } from '@ansible/portal-plugin-node';

// Create once — exported so your router can call emitAuditEvent
export const portalPlugin = createPortalPlugin({ pluginId: 'my-plugin' });
```

### 3c. Create the router

```ts
// src/router.ts
import Router from 'express-promise-router';
import type {
  HttpAuthService,
  UserInfoService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { portalPlugin } from './portalPlugin';
import type { ActiveOrganizationResolver } from '@ansible/portal-plugin-node';

export function createRouter(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  logger: LoggerService;
  organizations: ActiveOrganizationResolver;
}): import('express').Router {
  const router = Router();

  // Attach req.portalContext to every authenticated request
  router.use(portalPlugin.createMiddleware(options));

  router.get('/trust-signals/:repoId', async (req, res) => {
    const { repoId } = req.params;
    const context = req.portalContext;
    if (!context) {
      res
        .status(401)
        .json({ error: 'Authenticated Portal context is required' });
      return;
    }
    const { organizationId } = context;
    if (!organizationId) {
      res
        .status(403)
        .json({ error: 'A single validated organization is required' });
      return;
    }

    // Apply resource RBAC before reading organization-specific plugin state.
    // fetchTrustSignals is your domain implementation, not an SDK export.
    const signals = await fetchTrustSignals({ organizationId, repoId });

    portalPlugin.emitAuditEvent({
      operationId: 'my-plugin.trust-signals.read',
      userId: context.userId,
      organizationId,
      outcome: 'SUCCESS',
    });

    res.json(signals);
  });

  return router;
}
```

### 3d. Create the Backstage backend plugin

```ts
// src/plugin.ts
import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { portalPlugin } from './portalPlugin';
import { portalActiveOrganizationServiceRef } from '@ansible/portal-plugin-node';

export const myBackendPlugin = createBackendPlugin({
  pluginId: 'my-plugin',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        httpRouter: coreServices.httpRouter,
        organizations: portalActiveOrganizationServiceRef,
      },
      async init({ logger, httpAuth, userInfo, httpRouter, organizations }) {
        // Report unknown while initializing
        portalPlugin.pushHealthStatus({
          state: 'UNKNOWN',
          message: 'Initializing...',
        });

        const router = createRouter({
          httpAuth,
          userInfo,
          logger,
          organizations,
        });
        httpRouter.use(router);

        // Signal ready after initialization is complete
        portalPlugin.pushHealthStatus({
          state: 'READY',
          message: 'Plugin healthy.',
        });
      },
    });
  },
});
```

## 4. Register in the host backend

```ts
// packages/backend/src/index.ts
backend.add(import('@ansible/my-plugin-backend'));
```

## 5. Verify

1. Start the dev server: `yarn start`
2. Navigate to any Git Repository catalog entity
3. The **Trust Signals** tab should appear in the tab bar
4. The host's `DynamicExtensionDiscovery` logs manifest validation to the browser console on startup

## Available extension points

| Experience                   | Surface | Registration helper              |
| ---------------------------- | ------- | -------------------------------- |
| Git repository detail        | Tab     | `registerGitRepoDetailTab`       |
| Git repository detail        | Card    | `registerGitRepoDetailCard`      |
| Git repository detail        | Action  | `registerGitRepoDetailAction`    |
| Git repository list          | Tab     | `registerGitRepoListTab`         |
| Git repository list          | Action  | `registerGitRepoListAction`      |
| Execution environment detail | Tab     | `registerEEDetailTab`            |
| Execution environment detail | Card    | `registerEEDetailCard`           |
| Execution environment detail | Action  | `registerEEDetailAction`         |
| Execution environment list   | Tab     | `registerEEListTab`              |
| Collection detail            | Tab     | `registerCollectionDetailTab`    |
| Collection detail            | Card    | `registerCollectionDetailCard`   |
| Collection detail            | Action  | `registerCollectionDetailAction` |
| Job template detail          | Card    | `registerTemplateDetailCard`     |

## Next steps

- **Design tokens** — `docs/next/portal-sdk-design-tokens.md` — CSS custom properties for theme-adaptive styling
- **RHDH dynamic plugin deployment** — `docs/next/portal-sdk-rhdh-dynamic-plugin.md`
- **`SettingsShell`** — `@ansible/portal-extension-host` README — add a settings form to your plugin
- **Health reporting** — `@ansible/portal-plugin-node` README — advanced health deduplication patterns
