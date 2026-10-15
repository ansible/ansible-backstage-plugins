# @ansible/portal-extension-common

Serializable types shared between frontend and backend portal plugins. **No React, no DOM, no Node APIs** — safe to import in any context.

## Purpose

This package is the single source of truth for the Portal's manifest and capability model. It defines the types that describe what a plugin can contribute (entry points, capabilities, operations, entitlements) and the constants that identify where those contributions appear in the host.

Both frontend packages (`portal-extension-api`, `portal-extension-host`) and backend packages (`portal-plugin-node`) depend on `portal-extension-common`. Frontend plugin authors typically do not import from this package directly — use `@ansible/portal-extension-api` instead, which re-exports everything here plus adds the React registry, hooks, and registration helpers.

## What lives here

| Export                   | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `PluginManifest`         | Top-level declaration of all a plugin's contributions      |
| `CapabilityContribution` | A single capability with its entry points and settings     |
| `CapabilityEntryPoint`   | How a capability is surfaced (tab, card, action, inline)   |
| `CapabilityLaunch`       | Discriminated union of how an entry point is activated     |
| `SlotLaunch`             | Renders a React component inside an experience slot        |
| `WorkflowLaunch`         | Opens a Backstage scaffolder workflow                      |
| `OperationLaunch`        | Triggers a server-side operation                           |
| `ExperienceDefinition`   | Declares a new experience (tab bar + page) the plugin owns |
| `OperationDescriptor`    | API contract for a server-side operation                   |
| `SettingsContribution`   | Per-capability settings form declaration                   |
| `EntitlementDefinition`  | Feature-flag / entitlement check for a capability          |
| `EXTENSION_POINTS`       | Constant IDs for host extension slots                      |
| `EXPERIENCE_IDS`         | Constant IDs for built-in experience pages                 |
| `CONTENT_TYPES`          | Constant IDs for entity content types                      |

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
  pluginId: 'my-plugin',
  version: '1.0.0',
  capabilities: [
    {
      capabilityId: 'my-plugin.my-capability',
      displayName: 'My Capability',
      description: 'What this capability does.',
      entryPoints: [
        {
          surface: 'tab',
          experienceId: 'git-repo-detail',
          launch: { type: 'slot', slotId: 'git-repo-detail.tab.my-plugin' },
          label: 'My Tab',
        },
      ],
    },
  ],
};
```

See `docs/next/portal-sdk-quickstart.md` for the full step-by-step guide.

## Extension point and experience IDs

```ts
import {
  EXTENSION_POINTS,
  EXPERIENCE_IDS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-common';

EXTENSION_POINTS.GIT_REPO_DETAIL_TAB; // 'git-repo-detail.tab'
EXPERIENCE_IDS.GIT_REPO_DETAIL; // 'git-repo-detail'
CONTENT_TYPES.GIT_REPOSITORY; // 'git-repository'
```
