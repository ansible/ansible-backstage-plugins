# @ansible/portal-extension-common

Serializable types shared between frontend and backend portal plugins. **No React, no DOM, no Node APIs** — safe to import in any context.

## Purpose

This package is the single source of truth for the Portal's manifest and capability model. It defines the types that describe what a plugin can contribute (entry points, capabilities, operations, entitlements) and the constants that identify where those contributions appear in the host.

Both frontend packages (`portal-extension-api`, `portal-extension-host`) and backend packages (`portal-plugin-node`) depend on `portal-extension-common`. Frontend plugin authors typically do not import from this package directly — use `@ansible/portal-extension-api` instead, which re-exports everything here plus adds the React registry, hooks, and registration helpers.

## What lives here

| Export                   | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `PluginManifest`         | Top-level declaration of all a plugin's contributions    |
| `CapabilityContribution` | A single capability with its entry points and settings   |
| `CapabilityEntryPoint`   | How a capability is surfaced (tab, card, action, inline) |
| `CapabilityLaunch`       | Discriminated union of how an entry point is activated   |
| `SlotLaunch`             | Renders a React component inside an experience slot      |
| `WorkflowLaunch`         | Opens a Backstage scaffolder workflow                    |
| `OperationLaunch`        | Triggers a server-side operation                         |
| `OperationDescriptor`    | API contract for a server-side operation                 |
| `SettingsContribution`   | Per-capability settings form declaration                 |
| `EntitlementDefinition`  | Feature-flag / entitlement check for a capability        |
| `EXTENSION_POINTS`       | Constant IDs for host extension slots                    |
| `CONTENT_TYPES`          | Constant IDs for entity content types                    |

## What does NOT live here

| Concern                                                                                  | Package                          |
| ---------------------------------------------------------------------------------------- | -------------------------------- |
| `ContributionRegistry` and `useExtensionTabs` hooks                                      | `@ansible/portal-extension-api`  |
| `TabContribution`, `CardContribution`, `ActionContribution` (legacy compatibility types) | `@ansible/portal-extension-api`  |
| `createPortalPlugin()`, identity middleware, audit emitter                               | `@ansible/portal-plugin-node`    |
| Host components (`ExperienceSlot`, `PortalHealthStatus`)                                 | `@ansible/portal-extension-host` |

## Usage

Plugin authors typically do not import `portal-extension-common` directly. The right entry points are:

```ts
// Frontend plugin
import type { PluginManifest } from '@ansible/portal-extension-api';

// Backend plugin
import type { PluginManifest } from '@ansible/portal-plugin-node';
// (re-exported from portal-extension-common)
```

Direct import is appropriate when writing code that must be importable in both Node.js and browser contexts — for example, a manifest validation library or a shared test fixture.

## `PluginManifest` shape

```ts
const manifest: PluginManifest = {
  id: 'my-plugin',
  version: '1.0.0',
  apiVersion: '0.1.0',
  capabilities: [
    {
      id: 'my-plugin.my-capability',
      ownerPlugin: 'my-plugin',
      displayName: 'My Capability',
      description: 'What this capability does.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: 'my-plugin.details',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
          label: 'My Tab',
        },
      ],
    },
  ],
  entitlements: [],
};
```

The host owns placement. Capabilities declare supported entry points without
`experienceId` or recommendation metadata. The previous `ExperienceDefinition`,
`EXPERIENCE_IDS` and `ExperienceId` exports have been removed.

See `docs/next/portal-sdk-plugin-author-guide.md` for the authoring guide.

## Extension point and content type IDs

```ts
import {
  EXTENSION_POINTS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-common';

EXTENSION_POINTS.GIT_REPO_DETAIL_TABS; // 'rhaap.git-repository.detail.tabs'
CONTENT_TYPES.PLAYBOOK_REPOSITORY; // 'playbook-repository'
```
