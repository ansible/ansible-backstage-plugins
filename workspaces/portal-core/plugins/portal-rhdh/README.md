# @ansible/portal-rhdh

Optional native RHDH header integration for Automation Portal. This package
adapts Portal profile-menu declarations to
RHDH's public global-header Blueprints. It does not replace the platform header.

Generic SDK contracts and contributor plugins do not depend on the RHDH header.
Only this integration package imports
`@red-hat-developer-hub/backstage-plugin-global-header`. The source development
app renders its own header and does not need this package.

## Prerequisites

- An NFS RHDH app with the global-header frontend feature installed.
- The Portal contribution provider from `@ansible/portal-core` and compatible
  SDK/contributor artifacts built from the same checkout.
- This adapter's native `./alpha` feature installed through dynamic discovery.
- For AAP logout only: the `@ansible/aap-app-auth` native auth module, its
  backend provider, and frontend-visible AAP connection configuration.

The adapter builds against global-header `3.2.1` and frontend-plugin-api
`0.18.0`. The generic Portal Blueprint contracts use the same frontend API
baseline on Backstage `1.54.9`. Verification targets RHDH `next-2.1`; this is not
a supported cross-version compatibility matrix.

## Installing the adapter

From the repository root, export the plugin:

```bash
yarn workspace @ansible/portal-rhdh export-dynamic
```

Install the resulting `dist-dynamic` directory or packed dynamic artifact using
the deployment's normal dynamic plugin configuration. SDK workspace libraries
are consumed through their host/contributor artifacts, not installed as pages.
The automation-portal-local native development selections include this adapter.

Merge this entry into the deployment's existing `app.extensions` list to remove
RHDH's stock Create shortcut:

```yaml
app:
  extensions:
    - gh-component:global-header/self-service-button: false
```

This adapter does not install a replacement Create button. Portal does not expose
a global Create-contribution API. Plugins can keep actions in their own pages.

## Contributing profile items

The enabled `gh-menu-item:portal-rhdh/profile` attachment renders accepted
`AppProfileMenuItemBlueprint` declarations from any installed contributor. The
adapter has no AAP dependency or plugin-specific item list. Adding an item does
not require editing this package.

Declare either navigation to an installed, owned page or a lazy UI action. Each
item explicitly requires an authenticated session or a permission; permission
decisions must allow. Optional configuration gates, native extension enablement,
and ordering apply before action code loads. Ordering is within the Portal
profile block, not across unrelated platform menu contributions.

The host owns row presentation, closes the menu before an action opens another
UI surface, prevents repeated clicks while pending, and reports failures through
the standard error API. UI handlers receive the host API holder; they must use
registered operations for backend mutations. Header visibility is not backend
authorization. Missing providers or unavailable items render nothing.

## Opting in to AAP logout

AAP logout is disabled by default.
When AAP authentication is installed, merge both entries below into the same
`app.extensions` list:

```yaml
app:
  extensions:
    - gh-menu-item:global-header/logout: false
    - app-profile-menu-item:app/aap-logout: true
```

Keep the stock logout item when AAP logout is not enabled. Do not replace the
entire extensions list or remove other auth/navigation configuration.

The AAP auth module owns the disabled-by-default logout declaration. Its lazy
handler clears Portal auth, then sends the browser to AAP's OIDC `/o/logout/`
endpoint with `client_id` and `post_logout_redirect_uri`. AAP validates the
registered URI and presents its logout confirmation. Confirming ends the AAP
browser session and returns to Portal's sign-in screen. Cancelling does not
complete AAP browser-session logout; Portal authentication has already been cleared.
The adapter only renders the generic profile item and has no AAP dependency.

The source app explicitly installs
`createAapProfileModule({ logoutDisabled: false })` without replacing its sign-in
composition. Its native header consumes the same profile declarations.

### Configuring the logout return

Prerequisites: an AAP deployment advertising `/o/logout/` as its OIDC
`end_session_endpoint` and a registered Portal OAuth application. This flow is
not a fallback to the older gateway logout endpoint.

1. In the AAP OAuth application's **Post Logout Redirect URIs**, register the
   serialized Portal base URL (`new URL(appBaseUrl).href`). For example,
   `app.baseUrl: http://localhost:3000` serializes to `http://localhost:3000/`.
   The registered URI must match exactly, including the trailing slash.
   For local source and RHDH testing, use the
   space-separated values `http://localhost:3000/ http://localhost:7007/`.
   Production deployments register their actual HTTPS Portal URL instead.
2. Set `app.baseUrl` to the Portal URL, and configure `auth.environment` plus
   `auth.providers.rhaap.<environment>.host` and `.clientId` for the same OAuth
   application. The host is browser-facing; never use the private token host.
   The client ID and public host are frontend-visible; the client secret remains
   backend-only. `ansible.rhaap.baseUrl` is a host fallback, not an alternative
   source of the client ID.
3. Re-export the AAP auth artifact and restart RHDH. Restart the source dev
   server after schema/configuration changes.
4. Sign out, confirm AAP's logout screen, and verify Portal's sign-in screen.
   Revisit an AAP protected page to verify that fresh authentication is required.

Missing or unsafe logout configuration reports an error while still clearing
Portal auth; it does not claim AAP browser-session logout succeeded. No
gateway-wide logout allowlist change or confirmation bypass is performed.

Do not use legacy `mountPoints: global.header/profile` YAML for this native
adapter. The existing native AAP auth artifact does not expose that legacy
mount-point integration. This change does not add token-exchange retries or fix
intermittent AAP OAuth transport failures.

## Verification

```bash
yarn test --runInBand workspaces/portal-core/plugins/portal-rhdh
yarn workspace @ansible/portal-rhdh lint
yarn tsc
```

On the target RHDH deployment, verify there is no Create button and exactly one
Sign out item when AAP logout is enabled. Also verify profile navigation
to the installed contributor's effective page path, and omission of unavailable
destinations. With AAP logout explicitly enabled, check the profile menu and
confirm Sign out clears Portal authentication and redirects to AAP logout.
That last check ends the current browser's session; use a test session.

See the [profile authoring contract](../../../../docs/next/portal-sdk-plugin-author-guide.md#declaring-a-profile-menu-item)
and [NFS composition guide](../../../../docs/next/portal-sdk-nfs-composition.md)
for contributor declarations and host configuration.
