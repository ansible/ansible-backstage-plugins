# @ansible/portal-extension-host

Runtime host for portal plugin contributions. Provides per-contribution error isolation, rendering wrappers for tabs/cards/actions, experience slots, manifest validation, and the dynamic extension discovery component.

## NFS composition (experimental)

Install `createPortalContributionProvider` once in the `portal` frontend plugin.
It validates typed NFS inputs and publishes an app-scoped contribution snapshot
at `api:portal/contributions`; pages share this snapshot without global registry
registration. `createPortalEntityPage` and `createPortalCatalogPage` consume it
for generic pages. `useNativeEntityPage`, `NativeEntityActionMenu`, and
`NativeCatalogItemActions` adapt existing layouts without changing their URLs.

The alpha renderers filter and authorize before loading contributed components.
Entitled contributions fail closed without a host entitlement resolver.
Scaffolder fields use the same collector. `createPortalScaffolderPage` is an
optional templates-page adapter that reads its validated `scaffolderFields`
snapshot. `NativeScaffolderFields` applies configuration, experience, permission,
and reserved-name checks before loading widgets, preserving their value/UI
schemas and asynchronous validators. Without a templates consumer, declarations
remain inspectable and widget loaders do not run. The collector does not import
the optional portal-scaffolder implementation. See
the [NFS composition guide](../../../../docs/next/portal-sdk-nfs-composition.md).
The registry/discovery examples below are legacy migration APIs.

`useNativeAppProfileMenuItems()` resolves validated navigation and UI-action
declarations. Every item requires a resolved user identity and, when declared,
an allowed permission. Owned-page, configuration, and native enablement checks
apply before code loading. Action handlers load only on activation and receive
the app API holder. The host rechecks eligibility on activation and ignores
obsolete resolutions or code loaded after the consumer unmounts. Source and
RHDH renderers share these decisions; neither maintains a contributor-specific list.

## Purpose

`portal-extension-host` is the **consumer side** of the contribution system. It is used by the pages and layouts that _display_ contributed content — not by the plugins that _produce_ it. Plugin authors rarely depend on this package directly; they depend on `@ansible/portal-extension-api`.

Host page components depend on `portal-extension-host` to:

- Render community tabs and cards with error isolation (`ExtensionTabContent`, `ExtensionCardContent`)
- Wrap contributed components with CSS design tokens (`ContributionWrapper`)
- Mount experience tab bars and slot renderers (`ExperienceTabContent`, `ExperienceCardSlot`)
- Validate and activate manifests at startup (`DynamicExtensionDiscovery`)
- Display aggregated plugin health (`PortalHealthStatus`)
- Render RJSF settings forms with lifecycle callbacks (`SettingsShell`)

## Installation

```bash
yarn workspace my-host-page add @ansible/portal-extension-host
```

## Components

### `ContributionWrapper`

Wraps contributed components with 10 CSS custom properties derived from the active Backstage theme. Uses `display: contents` so it does not affect flex or grid layouts.

```tsx
import { ContributionWrapper } from '@ansible/portal-extension-host';

function MyHostLayout({ children }) {
  return <ContributionWrapper>{children}</ContributionWrapper>;
}
```

Plugin components access the tokens without importing MUI:

```tsx
// In a contributed plugin component:
<div style={{ color: 'var(--portal-color-primary)' }}>
  <span style={{ color: 'var(--portal-color-text-secondary)' }}>Metadata</span>
</div>
```

See `docs/next/portal-sdk-design-tokens.md` for the full token reference.

### `usePortalCssTokens`

Standalone hook version of `ContributionWrapper`. Returns the CSS token object for programmatic use:

```tsx
import { usePortalCssTokens } from '@ansible/portal-extension-host';

function MyComponent() {
  const tokens = usePortalCssTokens();
  return <canvas style={tokens} />;
}
```

### `ExtensionTabContent`

Renders a single `TabContribution` with error isolation. Wraps the component in an `ErrorBoundary` and `ContributionWrapper`:

```tsx
import { ExtensionTabContent } from '@ansible/portal-extension-host';
import { useExtensionTabs } from '@ansible/portal-extension-api';

function GitRepoDetailTabBar({ entity }) {
  const tabs = useExtensionTabs('git-repo-detail');
  return (
    <>
      {tabs.map(tab => (
        <ExtensionTabContent key={tab.id} contribution={tab} entity={entity} />
      ))}
    </>
  );
}
```

### `ExtensionCardContent`

Same as `ExtensionTabContent` for card contributions:

```tsx
import { ExtensionCardContent } from '@ansible/portal-extension-host';
import { useExtensionCards } from '@ansible/portal-extension-api';
```

### `ExtensionActionMenuItem`

Renders an `ActionContribution` as a menu item with click handling:

```tsx
import { ExtensionActionMenuItem } from '@ansible/portal-extension-host';
import { useExtensionActions } from '@ansible/portal-extension-api';

function ActionsMenu({ entity }) {
  const { isOpen, anchorEl, actions, handleClose } = useActionActivation(
    'git-repo-detail',
    entity,
  );
  return (
    <Menu open={isOpen} anchorEl={anchorEl}>
      {actions.map(action => (
        <ExtensionActionMenuItem
          key={action.id}
          contribution={action}
          entity={entity}
          onClose={handleClose}
        />
      ))}
    </Menu>
  );
}
```

### `ExperienceTabContent` / `ExperienceCardSlot`

High-level rendering for complete experience tab bars and card grids:

```tsx
import { ExperienceTabContent, ExperienceCardSlot } from '@ansible/portal-extension-host';

// Renders all registered tabs for an experience
<ExperienceTabContent experienceId="git-repo-detail" entity={entity} />

// Renders all registered cards for an experience
<ExperienceCardSlot experienceId="git-repo-detail" entity={entity} />
```

### `DynamicExtensionDiscovery`

Mount this component once in your app root (or in the host plugin's page component) to activate manifest validation and discovery logging:

```tsx
import { DynamicExtensionDiscovery } from '@ansible/portal-extension-host';

function App() {
  return (
    <>
      <DynamicExtensionDiscovery />
      {/* rest of app */}
    </>
  );
}
```

Hooks:

- `useIsDynamicEnvironment()` — returns `true` when running inside RHDH dynamic plugin mode
- `contributionRegistry` — re-exported registry singleton (for consistency, prefer importing from `portal-extension-api`)

### `PortalHealthStatus`

Fetches and displays aggregated plugin health from `GET /api/portal-health/status`. Polls every 30 seconds by default.

```tsx
import { PortalHealthStatus } from '@ansible/portal-extension-host';

// In any admin or diagnostics page:
<PortalHealthStatus />

// With a custom poll interval:
<PortalHealthStatus pollIntervalMs={60_000} />
```

Renders a sortable MUI table with coloured status chips:

| State         | Colour | Meaning                                       |
| ------------- | ------ | --------------------------------------------- |
| `READY`       | Green  | Plugin initialized and healthy                |
| `DEGRADED`    | Amber  | Plugin running but with reduced functionality |
| `UNAVAILABLE` | Red    | Plugin failed to initialize                   |
| `UNKNOWN`     | Grey   | Plugin has not reported yet                   |

To use `usePortalHealthStatus` in a custom component:

```tsx
import { usePortalHealthStatus } from '@ansible/portal-extension-host';

function MyHealthWidget() {
  const { snapshot, loading, error } = usePortalHealthStatus(15_000);
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>;
}
```

### `SettingsShell`

Generic RJSF v5 settings form shell with `onLoad`/`onSave` lifecycle, a reset button, and Backstage `alertApiRef` feedback.

```tsx
import { SettingsShell } from '@ansible/portal-extension-host';
import type { JSONSchema7 } from 'json-schema';

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    webhookUrl: { type: 'string', title: 'Webhook URL' },
    retryCount: { type: 'integer', title: 'Retry count', default: 3 },
  },
  required: ['webhookUrl'],
};

<SettingsShell
  schema={schema}
  onLoad={async () => {
    const res = await fetch('/api/my-plugin/settings');
    return res.json();
  }}
  onSave={async data => {
    await fetch('/api/my-plugin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }}
/>;
```

Optional props:

| Prop       | Type                      | Default | Description                            |
| ---------- | ------------------------- | ------- | -------------------------------------- |
| `uiSchema` | `Record<string, unknown>` | —       | RJSF uiSchema for widget customisation |
| `children` | `ReactNode`               | —       | Extra content rendered below the form  |

### `ErrorBoundary`

Catches rendering errors from a contribution and displays a fallback without crashing the host page:

```tsx
import { ErrorBoundary } from '@ansible/portal-extension-host';

<ErrorBoundary pluginId="my-plugin">
  <MyContributedComponent />
</ErrorBoundary>;
```

### `validateManifest`

Validates a `PluginManifest` object against the Portal schema. Returns `{ valid: boolean; errors: string[] }`:

```ts
import { validateManifest } from '@ansible/portal-extension-host';

const result = validateManifest(myManifest);
if (!result.valid) {
  throw new Error(`Invalid manifest: ${result.errors.join(', ')}`);
}
```

## Peer dependencies

- `react` ^18.3
- `@material-ui/core` ^4
- `@backstage/core-plugin-api`
- `@rjsf/core`, `@rjsf/utils`, `@rjsf/validator-ajv8` (for `SettingsShell`)
