# @ansible/portal-core

Frontend host plugin for native Portal contributions. Source:
`workspaces/portal-core/plugins/portal-core`.

## Responsibilities

- Installs the `portal` plugin's contribution, operation, and entitlement APIs.
- Redirects `/` to Templates without creating duplicate catalog/entity pages.
- Provides configuration-driven navigation through the `./app-nav` module.

## Integration

Install `@ansible/portal-core/alpha` in an NFS app. Install the
`@ansible/portal-core/app-nav` module when using Portal navigation, disabling
the stock sidebar's singleton attachment. Contributors declare their own native
extensions; the host does not import them for registry side effects.

Navigation selects discovered page extensions using `portal.navigation.items`.
Items may be direct links or expandable groups; selection does not grant access.

See [NFS composition](../next/portal-sdk-nfs-composition.md) for configuration
and the [implementation guide](../next/portal-plugin-factory-implementation-guide.md)
for the package boundary.
