# AAP frontend authentication

This package provides `rhAapAuthApiRef` and optional native frontend modules for
AAP authentication. Contributor plugins import the API reference and call
`getAccessToken()` through the host's API registry. Host maintainers choose API
registration and UI integration separately.

## Host prerequisites

Configure the AAP backend auth provider
`@ansible/backstage-plugin-auth-backend-module-rhaap-provider` and
`auth.providers.rhaap`, including the appropriate AAP OAuth client and callback
URL. Preserve applicable catalog-user provisioning. Installing this frontend
package does not supply those backend components or configuration.

The frontend API must be registered once. AAP token acquisition still depends on
a valid AAP session and may require the user's normal OAuth sign-in or consent.
Preserving the host's sign-in page does not guarantee an existing AAP session.

## API-only native integration

Import the API module explicitly alongside the host's existing features:

```tsx
import { createAapAuthApiModule } from '@ansible/aap-app-auth/api-module';

const aapAuthApi = createAapAuthApiModule();
```

Add `aapAuthApi` to the host's native `features` list. This registers only
`api:app/rhaap-auth`. It does not declare a sign-in page or a profile-menu item.
Keep the standard RHDH/Backstage sign-in page and shell under host control.

An application that already registers the exported `AapAuthApi` factory must
retain that registration or use this module, not register both.

## Optional Portal UI

To use the AAP-only Portal sign-in page, explicitly add:

```tsx
import { createAapSignInModule } from '@ansible/aap-app-auth/sign-in';

const aapSignIn = createAapSignInModule();
```

This module registers `sign-in-page:app/rhaap` only. It requires separate AAP API
registration. Disable the host's existing sign-in extension when deliberately
selecting this page, so there is only one sign-in component:

```yaml
app:
  extensions:
    - sign-in-page:app: false
    - sign-in-page:app/rhaap: true
```

Use the actual ID of the host sign-in page if it differs from the built-in ID.

To contribute AAP Sign out explicitly:

```tsx
import { createAapProfileModule } from '@ansible/aap-app-auth/profile';

const aapProfile = createAapProfileModule({ logoutDisabled: false });
```

Add `aapProfile` to the host's features. It requires the configured AAP API,
Backstage identity/config/error APIs, and a compatible Portal profile contribution
consumer such as the Portal header integration. It does not install that
consumer or replace a standard RHDH logout control automatically. AAP logout
must be selected only when appropriate for the host's identity/session lifecycle.
The factory keeps the contribution disabled unless enabled explicitly.

## Authentication Providers settings

The Settings integration uses the host's native user-settings plugin and a
registered AAP auth API. `@backstage/plugin-user-settings` is an optional peer:
API-only consumers do not need to install it. Hosts using the Settings integration must
provide a compatible version.

For source-built native hosts, add the explicit factory result to `features`:

```tsx
import { createAapSettingsModule } from '@ansible/aap-app-auth/settings';

const aapSettings = createAapSettingsModule();
```

This keeps Backstage's configured standard provider rows, such as GitHub and
GitLab, and appends **Ansible Automation Platform**, including its account details
and connection controls. The source Portal app opts in explicitly.

Native dynamic hosts automatically receive the AAP row when this package and
the compatible native user-settings plugin are installed. No Settings enablement
flag or YAML block is required. The combined `/alpha` module supplies this
contribution. Configure its API/sign-in choices below as appropriate for the host.
Do not also register the explicit Settings factory when using the combined module.

A host without the user-settings plugin has no Settings page to extend; the
frontend framework ignores the unattached Settings extension in that case. API-only factory
imports remain independent of the Settings integration.

The native user-settings page has a singleton provider-list input. For explicitly
composed source hosts, pass existing custom rows to
`createAapSettingsModule({ providerSettings: existingRows })`. When the combined module is
automatically discovered and a host already owns a custom list, disable
`auth-provider-settings:app/rhaap` through normal extension configuration
and append the exported `AapProviderSettings` component to that existing list.
Do not register two competing list adapters. The module does not silently
overwrite another extension's customization.

Legacy source hosts can pass `<AapProviderSettingsList />` as the
`UserSettingsPage` component's `providerSettings` prop. The component also accepts
existing custom rows through its `providerSettings` prop.

Settings **Sign out** disconnects the AAP OAuth credential session only, following
Backstage's provider-settings behavior. It does not sign out a host identity
using GitHub/GitLab, and it does not end the AAP browser SSO session. Portal's
full Sign out integration remains responsible for host identity and OIDC browser
logout. A subsequent AAP connection may reuse the existing browser SSO session.

## Existing combined integration

`@ansible/aap-app-auth/alpha` retains its existing behavior: AAP API registration,
AAP-only sign-in page, and an AAP logout declaration disabled by default. It also
adds the AAP Settings row through the native user-settings public input. Existing
extension IDs and root exports are unchanged.

Choose the combined entry or the separate modules. Do not install both, because
they declare the same extensions. The combined `/alpha` entry remains automatically discovered. Settings is included in that same federated entry.
The individual API/sign-in/profile factories are not automatically discovered. The separate entries expose named
factories rather than default feature instances, so packaging does not add them
to automatic discovery.

For an existing RHDH dynamic-plugin installation that discovers `/alpha`, use
host extension configuration to retain the host's sign-in and logout UI:

```yaml
app:
  extensions:
    - sign-in-page:app/rhaap: false
    - app-profile-menu-item:app/aap-logout: false
```

Merge these entries with existing configuration and retain the host's original
sign-in and logout integration. The AAP Settings row remains available by default
when user-settings is installed. This configures the combined discovered module;
it does not change its default behavior for existing Portal consumers.

## Contributor usage

Contributor code continues to import `rhAapAuthApiRef` from
`@ansible/aap-app-auth` and obtain the registered API through `useApi` or a
supported API holder. The module split changes host composition, not the token
consumption contract. Treat tokens as credentials and never put them in URLs,
logs or catalog metadata.

## Validation

Run the package tests, repository TypeScript checks, package build and dynamic
export. Verify packed root, `/alpha`, `/api-module`, `/sign-in`, `/profile`, `/settings`
imports from a separate consumer project. Inspect the generated federation
manifest and verify that the discovered `/alpha` entry includes Settings. Before release, test actual standard
RHDH API-only composition and the full Portal login/logout flow with configured
AAP. Local module tests do not establish live RHDH/OAuth compatibility.
