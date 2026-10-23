# portal-rhdh

`@ansible/portal-rhdh` is the optional native RHDH global-header adapter. Generic
Portal contracts and contributor plugins remain independent of the header
package; the source development app does not need this adapter.

It renders validated Portal Create destinations through RHDH's public component
Blueprint and renders generic navigation/UI-action profile contributions through
the native profile-menu Blueprint. New contributors do not require adapter edits.
The AAP auth module owns its opt-in logout contribution; the adapter has no AAP
dependency. When enabled, AAP logout replaces the stock logout item and requires
the AAP auth frontend/backend integration.

The AAP-owned handler uses the OIDC `/o/logout/` endpoint with the configured
OAuth client ID and `app.baseUrl` as its return URI. Register that exact URL in
the OAuth application's **Post Logout Redirect URIs**. AAP presents a confirmation
screen before ending its browser session and returning to Portal sign-in. This
requires the advertised OIDC end-session endpoint; the adapter does not change
gateway-wide allowlists or expose the OAuth client secret.

See [header setup](../next/portal-sdk-nfs-composition.md#header-create-actions-and-optional-rhdh-integration)
and [Create authoring](../next/portal-sdk-plugin-author-guide.md#declaring-a-create-destination)
for configuration, permissions, and integration boundaries. The package README
contains export and verification commands.
