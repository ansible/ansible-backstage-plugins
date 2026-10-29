# @ansible/portal-rhdh

Optional native RHDH profile-menu adapter. Source:
`workspaces/portal-core/plugins/portal-rhdh`.

The adapter consumes generic Portal profile contributions using RHDH's public
`GlobalHeaderMenuItemBlueprint`. Only this package depends on the RHDH header.
It has no AAP dependency and does not add a Create button or Create-contribution API.

Install its exported native dynamic artifact alongside the Portal contribution
provider and RHDH global-header feature. To retain AAP Sign out while removing
the stock Create shortcut, merge these entries into the existing configuration:

```yaml
app:
  extensions:
    - gh-component:global-header/self-service-button: false
    - gh-menu-item:global-header/logout: false
    - app-profile-menu-item:app/aap-logout: true
```

The `gh-menu-item:portal-rhdh/profile` consumer is enabled by default. AAP Sign out
requires the separate `@ansible/aap-app-auth` native module, backend provider,
and public OAuth client/host configuration. Keep stock logout when the AAP
contribution is not enabled. Preserve all other auth and navigation configuration.

See [AAP logout configuration](../next/portal-sdk-nfs-composition.md#aap-oidc-logout)
and the package README for prerequisites, export and verification steps.
