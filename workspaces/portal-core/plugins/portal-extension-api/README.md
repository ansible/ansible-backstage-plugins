# @ansible/portal-extension-api

Frontend extension API for Automation Portal. Provides the `ContributionRegistry` singleton, React hooks for consuming contributions, and registration helpers that plugins call from their dynamic entry points.

## NFS composition (experimental)

The `./alpha` entry point exports `EntityDetailTabBlueprint`,
`EntityOverviewCardBlueprint`, `EntityActionBlueprint`,
`CatalogItemActionBlueprint`, and `ScaffolderFieldBlueprint`.
Entity, catalog, and scaffolder-field descriptors attach to the host-owned
`api:portal/contributions` provider, consumed through `portalContributionsApiRef`.
Validated field declarations are exposed as `scaffolderFields`; declaring a field
does not require portal-scaffolder or load its widget implementation. An installed
templates adapter consumes the declarations when needed. Native declarations do
not register with the singleton.

`AppProfileMenuItemBlueprint` declares profile rows in `appProfileMenuItems`.
Use `type: 'navigation'` with an owned `targetPage`, or `type: 'action'` with
`loadAction` returning a UI handler. Declare `authorization` explicitly as
`{ type: 'authenticated' }` or `{ type: 'permission', requirement }`. Optional
`order` and `enabledByConfig` control presentation. The host binds identity,
checks eligibility before loading, and supplies `{ apis }` to a deliberately
activated UI handler. Backend effects still require registered operations.
See the [profile authoring example](../../../../docs/next/portal-sdk-plugin-author-guide.md#declaring-a-profile-menu-item).

See the [NFS composition guide](../../../../docs/next/portal-sdk-nfs-composition.md)
for provider installation, applicability, deployment, and remaining work.

The registration APIs below describe the legacy app migration path, not the
recommended NFS integration for a new contributor.

## When to use this package

- You are writing a **frontend plugin** that contributes tabs, cards, or actions into an existing experience (e.g. a new tab on the Git Repository detail page).
- You need to **register a `PluginManifest`** so the host validates and surfaces your capabilities.
- You need to **read registered contributions** in a host component via React hooks.

Do _not_ depend on this package from backend plugins. Use `@ansible/portal-plugin-node` instead.

## Installation

```bash
yarn workspace my-plugin add @ansible/portal-extension-api
```

## API

### Registration

Call these in your plugin's `dynamic/index.ts`:

```ts
import {
  registerManifest,
  registerGitRepoDetailTab,
  registerGitRepoDetailCard,
} from '@ansible/portal-extension-api';

// 1. Register your manifest (validated by the host at startup)
registerManifest(myPluginManifest);

// 2. Register individual contributions
registerGitRepoDetailTab({
  id: 'my-plugin.trust-signals',
  label: 'Trust Signals',
  component: TrustSignalsTab,
});
```

Available registration helpers:

| Helper                                    | Registers                               |
| ----------------------------------------- | --------------------------------------- |
| `registerManifest(manifest)`              | Full `PluginManifest` with the registry |
| `registerGitRepoDetailTab(contribution)`  | Tab on the Git Repository detail page   |
| `registerGitRepoDetailCard(contribution)` | Card on the Git Repository detail page  |

### React Hooks

Use these in host components to read registered contributions:

```tsx
import { useExtensionTabs, useExtensionCards, useExtensionActions } from '@ansible/portal-extension-api';

function MyHostComponent() {
  const tabs = useExtensionTabs('git-repo-detail');
  const cards = useExtensionCards('git-repo-detail');
  return (/* render contributions */);
}
```

| Hook                                | Returns                                         |
| ----------------------------------- | ----------------------------------------------- |
| `useExtensionTabs(experienceId)`    | `TabContribution[]` for the given experience    |
| `useExtensionCards(experienceId)`   | `CardContribution[]` for the given experience   |
| `useExtensionActions(experienceId)` | `ActionContribution[]` for the given experience |

### `ContributionRegistry`

The singleton registry backing all hooks and registration calls. Exported for testing and for advanced host scenarios:

```ts
import { contributionRegistry } from '@ansible/portal-extension-api';

// Register a manifest programmatically (e.g. in a test)
contributionRegistry.registerManifest(myManifest);

// Subscribe to registry changes
const unsubscribe = contributionRegistry.subscribe(() => {
  // re-render host UI
});
```

### Types

```ts
import type {
  PluginManifest,
  CapabilityContribution,
  CapabilityEntryPoint,
  TabContribution,
  CardContribution,
  ActionContribution,
  CapabilityLaunch,
  SlotLaunch,
  WorkflowLaunch,
  OperationLaunch,
  EXTENSION_POINTS,
  EXPERIENCE_IDS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';
```

All types from `@ansible/portal-extension-common` are re-exported here — no need to depend on both packages.

## Extension point constants

```ts
import {
  EXTENSION_POINTS,
  EXPERIENCE_IDS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';

EXTENSION_POINTS.GIT_REPO_DETAIL_TAB; // 'git-repo-detail.tab'
EXPERIENCE_IDS.GIT_REPO_DETAIL; // 'git-repo-detail'
CONTENT_TYPES.GIT_REPOSITORY; // 'git-repository'
```

## Contribution types

### `TabContribution`

```ts
interface TabContribution {
  id: string; // Unique stable ID, e.g. 'my-plugin.trust-signals'
  label: string; // Tab label shown in the UI
  component: ComponentType<ActionContext>;
  icon?: ComponentType;
}
```

### `CardContribution`

```ts
interface CardContribution {
  id: string;
  title: string;
  component: ComponentType<ActionContext>;
}
```

### `ActionContext`

Context object passed to every contributed component as props:

```ts
interface ActionContext {
  entity: Entity; // The Backstage catalog entity for this page
  entityRef: string; // Compact entity reference string
  organizationId?: string; // Org ID derived from the entity namespace
}
```

## Manifest validation

The host's `DynamicExtensionDiscovery` component validates every registered manifest at startup and logs the result. Validation checks:

- Required fields are present and non-empty
- All `experienceId` values reference known experiences
- All `surface` values reference known extension points
- `launch.type` matches the slot/workflow/operation model

To validate a manifest in tests or CI:

```ts
import { validateManifest } from '@ansible/portal-extension-host';

const result = validateManifest(myManifest);
if (!result.valid) {
  console.error(result.errors);
}
```

## Singleton behaviour and RHDH

`contributionRegistry` is a module-level singleton. In RHDH's dynamic plugin environment, multiple plugins may load as separate JS bundles. The registry must be shipped as a **shared package** (not bundled per-plugin) to ensure all plugins write to the same instance that the host reads from.

Add to `dynamic-plugins.yaml`:

```yaml
# In the host plugin's sharedPackages
- package: '@ansible/portal-extension-api'
  singleton: true
```

See `docs/next/portal-sdk-rhdh-dynamic-plugin.md` for the full configuration guide.
