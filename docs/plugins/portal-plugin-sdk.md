# @ansible/portal-plugin-sdk

Shared frontend web library for Portal contributors. Source:
`workspaces/portal-core/plugins/portal-plugin-sdk`.

## Reusable functionality

- Page headers, dialogs, empty states, links, and loading components.
- Notification stack and synchronization polling utilities.
- Pagination, cache, and subscription utilities.
- Context/authorization hooks, icons, styles, and theme utilities.

The SDK is not a host page plugin and does not register native contributions.
Use [portal-extension-api](portal-extension-api.md) for Blueprint declarations
and [portal-extension-host](portal-extension-host.md) for host rendering.

## Styling and ownership

`PageHeader` renders a title, optional description/help tooltip, and optional
consumer-supplied actions. It has no authentication or synchronization
requirements. The consumer owns UI permission checks and action handlers, while
backend authorization remains mandatory for protected operations.

Portal-scaffolder composes this layout through its local `CatalogSyncHeader` for
catalog synchronization. The SDK's sync-aware `PageHeaderSection` and its props
remain available as deprecated compatibility exports. Existing callers continue
to work. New consumers should use `PageHeader`, and legacy callers should migrate
before a separately coordinated removal. No removal version is scheduled.

Prefer shared components and theme-adaptive tokens over importing private RHDH
UI implementation details. Synchronization/cache integration uses injected
callbacks rather than direct imports of a content plugin.

## Authenticated context

`usePortalContext()` discovers `portal-operations` and reads its authenticated
`GET /context` endpoint. It returns `organizationIds`, an optional
`organizationId`, `userEntityRef`, `loading`, and `error`. A single unambiguous
membership supplies `organizationId`; multiple memberships do not select one.
Resolution failures leave an empty membership list, not a `default` fallback.

Use this context for display. Do not infer AAP membership from the user's catalog
namespace or use browser-supplied organization values as backend authority.
Registered operations receive only subject and input; the backend independently
resolves memberships, grants and permissions.

See [design tokens](../next/portal-sdk-design-tokens.md) and the
[implementation guide](../next/portal-plugin-factory-implementation-guide.md)
for the remaining content-client and picker boundary.
