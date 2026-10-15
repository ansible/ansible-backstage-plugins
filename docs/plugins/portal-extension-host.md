# @ansible/portal-extension-host

Frontend web library that validates and renders Portal contributions. Source:
`workspaces/portal-core/plugins/portal-extension-host`.

## Native host adapters

The `./alpha` entry point provides the contribution provider, entity tabs/actions,
catalog adapters, and scaffolder-field host components. Pages consume the
provider's app-scoped snapshot; this library does not install duplicate pages.

The host checks contract ownership, versions, content/source scope, experiences,
configuration, permissions, entitlements, and narrowing predicates before loading
components. Contributions are isolated by host error boundaries.

## Shared rendering utilities

The root entry point exposes design-token wrappers, an RJSF settings shell,
and legacy registry renderers. A health display component is available, but
installing the library does not place it in the Portal UI.

See [NFS composition](../next/portal-sdk-nfs-composition.md) for native integration
and [design tokens](../next/portal-sdk-design-tokens.md) for styling.
