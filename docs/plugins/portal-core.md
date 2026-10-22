# @ansible/portal-core

Frontend host plugin for native Portal contributions. Source:
`workspaces/portal-core/plugins/portal-core`.

## Responsibilities

- Installs the `portal` plugin's contribution, operation, and entitlement APIs.
- Opens a configured installed page at `/`, or Templates when no override is
  configured and that page is installed. Otherwise, displays a neutral host
  fallback without creating duplicate catalog/entity pages.
- Provides configuration-driven navigation through the `./app-nav` module.

## Integration

Install `@ansible/portal-core/alpha` in an NFS app. Install the
`@ansible/portal-core/app-nav` module when using Portal navigation, disabling
the stock sidebar's singleton attachment. Contributors declare their own native
extensions; the host does not import them for registry side effects.

Navigation selects discovered page extensions using `portal.navigation.items`.
Items may be direct links or expandable groups; selection does not grant access.

## Landing destination

No landing configuration is required. By default, `/` opens `/self-service`
only when that page is mounted. Without it, Portal displays a welcome message
directing users to available sidebar destinations or their administrator.

To select another installed page, configure its exact path:

```yaml
portal:
  landingPage: /self-service/collections
```

The path is relative to the app base URL. Use an exact mounted NFS page path,
not an arbitrary nested route, external URL, query string, or fragment. Missing,
disabled, invalid, or self-referential destinations display the host fallback;
an invalid explicit override does not silently open Templates. Destination
permissions remain enforced by the destination page. Sidebar ordering does not
select the landing page.

For setup, migration, and verification, see
[configuring the landing destination](../next/portal-sdk-nfs-composition.md#configuring-the-landing-destination).

See [NFS composition](../next/portal-sdk-nfs-composition.md) for configuration
and the [implementation guide](../next/portal-plugin-factory-implementation-guide.md)
for the package boundary.
