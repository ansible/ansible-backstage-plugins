# @ansible/portal-plugin-sdk

Frontend SDK for building Automation Portal plugins. Provides shared React components, hooks, and design utilities for any plugin that contributes capabilities into the Portal.

## When to use this package

- You are writing a **frontend plugin** and need shared UI components (page headers, empty states, loaders).
- You need `usePortalContext()` to display trusted organization memberships.
- You need `useIsSuperuser()` to gate UI features behind AAP superuser status.
- You need the `AppThemeFixer` or `RhaapThemeProvider` for MUI theme setup.

## Installation

```bash
yarn workspace my-plugin add @ansible/portal-plugin-sdk
```

## Components

### `PageHeader`

Shared page-heading layout with a title, optional description, optional help
tooltip, and optional actions. It does not resolve authentication, check
permissions, or render synchronization controls. Consumers own action visibility,
disabled states, and handlers. Backend operations must enforce authorization.

```tsx
import { PageHeader } from '@ansible/portal-plugin-sdk';

<PageHeader
  title="Conversions"
  description="Convert source content to Ansible."
  tooltip="About source conversion"
  actions={<Button onClick={startConversion}>Start conversion</Button>}
/>;
```

Only `title` is required. The description accepts React content, including links.
The help tooltip supports pointer hover and keyboard focus.

### `PageHeaderSection` (deprecated compatibility export)

The existing sync-aware header and `PageHeaderSectionProps` remain exported with
their existing props and behavior for preview compatibility. New plugins should
use `PageHeader` and supply their own actions. Existing synchronization consumers
can keep the legacy export until they migrate. No removal version is scheduled.

Portal-scaffolder uses its local `CatalogSyncHeader` wrapper for the Sync Now
button, superuser checks, progress, and last-sync timestamps. Other plugins must
not depend on portal-scaffolder to reuse the generic header.

### `EmptyStateView`

Shared empty-state presentation with a required title and optional description,
decorative icon, and actions. It does not fetch data, resolve permissions, read
configuration, or add sync controls. Consumers own messages, action eligibility,
and handlers. Backend operations still enforce their own authorization.

```tsx
import { EmptyStateView } from '@ansible/portal-plugin-sdk';

<EmptyStateView
  title="No conversions yet"
  description="Convert source content to Ansible."
  actions={<Button onClick={startConversion}>Start conversion</Button>}
/>;
```

The description and actions accept React content, including links, buttons, or
an actions menu. Icons are decorative and hidden from assistive technology, so
include essential information in the title or description. Only `title` is
required, and the heading renders at level two.

### `EmptyState` (deprecated compatibility export)

The SDK's existing collection-specific `EmptyState` and `EmptyStateProps` remain
available with their existing props, messages, permissions, and sync behavior.
The optional `configDocsUrl` override is retained. New plugins should use
`EmptyStateView` and compose their own behavior. No removal version is scheduled.

Portal-scaffolder uses its local `CollectionsEmptyState` for collection guidance,
configuration links, permission checks, and sync controls. Other plugins do not
need to depend on portal-scaffolder to reuse the generic presentation.

### `SkeletonLoader`

Loading placeholder that matches the Portal's card and list layouts:

```tsx
import { SkeletonLoader } from '@ansible/portal-plugin-sdk';

if (loading) return <SkeletonLoader count={4} />;
```

### `SyncDialog` / `SyncProgressPopover`

Dialog and popover for showing background sync progress. Used by pages that trigger long-running AAP sync operations:

```tsx
import { SyncDialog, SyncProgressPopover } from '@ansible/portal-plugin-sdk';
```

### `EntityLinkButton`

Renders a Backstage entity reference as a clickable link button:

```tsx
import { EntityLinkButton } from '@ansible/portal-plugin-sdk';

<EntityLinkButton entityRef="component:default/my-service" />;
```

### `ScmIntegrationAuthError`

Standard error state for SCM integration auth failures:

```tsx
import { ScmIntegrationAuthError } from '@ansible/portal-plugin-sdk';

if (error?.type === 'auth') return <ScmIntegrationAuthError />;
```

## Hooks

### `usePortalContext()`

Reads the current authenticated context from the discovered
`portal-operations` backend's `GET /context` endpoint.

```tsx
import { usePortalContext } from '@ansible/portal-plugin-sdk';

function MyPluginPage() {
  const { organizationIds, loading, error } = usePortalContext();
  if (loading) return <CircularProgress />;
  if (error) return <p>Organization context is unavailable.</p>;
  return <div>Organizations: {organizationIds.join(', ')}</div>;
}
```

**Returns:**

| Field             | Type                  | Description                                                       |
| ----------------- | --------------------- | ----------------------------------------------------------------- |
| `organizationId`  | `string \| undefined` | Present only when the host supplies one unambiguous organization. |
| `organizationIds` | `readonly string[]`   | Trusted memberships; empty until resolution succeeds.             |
| `userEntityRef`   | `string \| undefined` | Authenticated catalog user reference returned by the backend.     |
| `loading`         | `boolean`             | True while authenticated host context is being fetched.           |
| `error`           | `Error \| null`       | Set if the request or response validation fails.                  |

There is no namespace-derived or `default` organization fallback. Multiple
memberships do not select an active organization. Use this hook for display,
not as permission or backend authority. Registered operations send subject and
input; the backend independently resolves memberships, grants and resource
permissions. Shared repositories do not acquire AAP organization ownership.

### `useIsSuperuser()`

Checks whether the current user has the `aap.platform/is_superuser: "true"` annotation in the catalog. Results are cached for 5 minutes.

```tsx
import { useIsSuperuser } from '@ansible/portal-plugin-sdk';

function AdminOnlyButton() {
  const { isSuperuser, loading } = useIsSuperuser();
  if (loading || !isSuperuser) return null;
  return <Button>Admin action</Button>;
}
```

**Returns:**

| Field         | Type            | Description                                                    |
| ------------- | --------------- | -------------------------------------------------------------- |
| `isSuperuser` | `boolean`       | Whether the current user is an AAP superuser.                  |
| `loading`     | `boolean`       | True while catalog lookup is in-flight.                        |
| `error`       | `Error \| null` | Set if the catalog lookup fails. Defaults to `false` on error. |

The hook retries once after a 3-second delay before setting the error state. If the catalog entity is not yet synced, check `error` and inform the user rather than treating them as a non-superuser.

### `useSyncStatusPolling()`

Polls a sync status endpoint and returns the current sync state. Used internally by `SyncProgressPopover`.

## Theme utilities

### `AppThemeFixer`

Re-export of MUI `CssBaseline`. Add this once to your plugin root to apply consistent baseline styles:

```tsx
import { AppThemeFixer } from '@ansible/portal-plugin-sdk';

function MyPluginRoot() {
  return (
    <>
      <AppThemeFixer />
      <MyPluginContent />
    </>
  );
}
```

### `RhaapThemeProvider`

MUI theme provider configured with the RHAAP colour palette. Wraps the Backstage app in the correct MUI v4 theme:

```tsx
import { RhaapThemeProvider } from '@ansible/portal-plugin-sdk';
```

### CSS design tokens (static)

Static sizing constants exported from `tokens.ts`. Use these for fixed values that do not need theme adaptation:

```ts
import { PORTAL_TOKENS } from '@ansible/portal-plugin-sdk';

// Spacing multipliers (MUI 8px base)
PORTAL_TOKENS.spacing.page; // '24px' — page-level padding
PORTAL_TOKENS.spacing.section; // '16px' — between sections
PORTAL_TOKENS.spacing.card; // '12px' — card internal padding

// Border radii
PORTAL_TOKENS.borderRadius.card; // '4px'
```

For **colour and theme-adaptive values**, use CSS custom properties injected by `ContributionWrapper` (from `@ansible/portal-extension-host`). See `docs/next/portal-sdk-design-tokens.md` for the full reference.

## Notifications

```tsx
import {
  NotificationStack,
  NotificationContext,
  useNotifications,
} from '@ansible/portal-plugin-sdk';

// Wrap your plugin in the notification provider:
<NotificationContext>
  <MyPlugin />
</NotificationContext>;

// Push a notification from anywhere:
const { push } = useNotifications();
push({ severity: 'success', message: 'Job template launched.' });
```

## Styles

Shared `makeStyles` utilities for consistent page layout:

```tsx
import { usePageHeaderStyles } from '@ansible/portal-plugin-sdk';

function MyPage() {
  const classes = usePageHeaderStyles();
  return <div className={classes.pageHeader}>...</div>;
}
```

## Icons

Common icons re-exported to avoid per-plugin icon imports:

```tsx
import {
  AnsibleIcon,
  JobTemplateIcon,
  CollectionIcon,
} from '@ansible/portal-plugin-sdk';
```

## Utils

Shared utility functions:

```ts
import {
  formatDuration,
  truncateText,
  parseEntityRef,
} from '@ansible/portal-plugin-sdk';
```

## Peer dependencies

- `react` ^18.3
- `@material-ui/core` ^4
- `@backstage/core-plugin-api`
- `@backstage/plugin-catalog-react`
- `@backstage/catalog-model`
