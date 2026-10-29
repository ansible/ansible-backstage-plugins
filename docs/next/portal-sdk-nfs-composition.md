# Portal NFS composition

For package/runtime Mermaid diagrams, see
[SDK architecture](portal-sdk-architecture.md). For contributor repository
structure, APIs, examples and acceptance requirements, see the
[third-party plugin author guide](portal-sdk-plugin-author-guide.md).

## Composition model

The host owns the `entity.detail.tabs` interaction and placement. Contributors
declare static Blueprint extensions in their `./alpha` entry points.
NFS supplies typed entity, catalog, and scaffolder-field descriptors to `api:portal/contributions`,
an app-scoped API extension owned by the `portal` frontend plugin. Pages share
its validated snapshot through `portalContributionsApiRef`. There is no native global contribution registry,
module-load registration, or imperative module resolver in this path.

The adapters live in `@ansible/portal-extension-api/alpha` and
`@ansible/portal-extension-host/alpha`. Shared extension data references use
stable IDs rather than a shared mutable singleton. Installing a plugin loads
its declarations, but component loaders are deferred until filtering and
authorization complete. Only the selected eligible tab loads its component.

The provider uses `ApiBlueprint`, avoiding an app-root wrapper that the
installed Backstage API restricts to the app plugin. Scaffolder fields use the
shared provider rather than attaching directly to an optional templates page.
Operations remain separate from presentation and receive the current subject,
not contributor-supplied URLs.

## Integrating the host

### Prerequisites

- An NFS app with a host frontend plugin whose plugin ID is `portal`.
- `@backstage/frontend-plugin-api` 0.17.1 and compatible platform packages.
- A host page that resolves the current entity and canonical content type.
- A host entitlement resolver for declared entitlement requirements.

### Procedure

1. Install `createPortalContributionProvider()` from
   `@ansible/portal-extension-host/alpha` once in the `portal` frontend plugin.
   The provider's extension ID is `api:portal/contributions`.
2. Extend the existing host layout with `useNativeEntityPage` and
   `NativeEntityActionMenu`; use `NativeCatalogItemActions` inside an existing
   catalog row menu. `createPortalEntityPage` and `createPortalCatalogPage`
   remain reusable host factories, but installing Portal does not create a
   second catalog or entity UI.
3. Render `PortalEntityTabs` with the descriptors and an
   `EntityContributionContext`. The host supplies the entity, canonical content
   type, and optional source observations. Wrap legacy component trees with
   `compatWrapper`, as demonstrated in the composition tests.
4. Supply `availableExperiences` when an experience is disabled.
5. Supply `checkEntitlement` from host authorization. It receives the declared
   entitlement and subject; the host resolves trusted organization memberships.
   Missing resolvers, denied decisions, and failed checks suppress entitled tabs.
6. Install the contributor's NFS feature through app discovery or dynamic
   loading. Do not import its legacy `index.ts` for side effects.
7. Rebuild the host and contributors together. Earlier extension declarations
   attached to `page:portal/entity`; they must use the shared provider attachment.

### Verification

From the repository root, run:

```bash
yarn test --runInBand \
  workspaces/portal-core/plugins/portal-extension-host \
  workspaces/portal-scaffolder/plugins/portal-scaffolder/src/alpha.test.tsx \
  workspaces/portal-scaffolder/plugins/portal-scaffolder/src/alphaPermissions.test.tsx \
  workspaces/apme/plugins/backstage-apme/src/alpha.test.tsx
```

The host tests exercise real NFS discovery, filtering, selection, permission
denial, configuration and experience gates, entitlement fail-closed behavior,
manifest rejection, and failure isolation. The APME test uses its actual NFS
declaration and substitutes the Quality component to avoid a live backend.
Shared-provider tests also cover cross-page discovery, NFS-disabled extensions,
operation subjects, follow-on navigation, and refresh of already-selected results.
Field composition tests cover absent and alternative templates hosts,
first- and third-party fields, duplicate and malformed declarations, and
preservation of field schemas and asynchronous validation.
The separate scaffolder permission suite checks catalog-import denial without
reusing the route-parity suite's cached permission decisions.

## Optional templates hosts

Portal host services and AAP authentication do not require portal-scaffolder.
Application and deployment composition can omit that contributor. Install
independent native plugins through their declared frontend features and normal
RHDH dynamic plugin configuration; shared SDK libraries are not standalone
dynamic page plugins. Existing Collections, Execution Environments, and Git
repositories pages still belong to portal-scaffolder until content extraction.
APME's current repository UI therefore still needs that contributor.

`ScaffolderFieldBlueprint` attaches declarations to `api:portal/contributions`
through its `scaffolderFields` input. At app startup, the Portal provider checks
actual NFS ownership, manifest references, API compatibility, content scope,
field names, and duplicate names/entry-point IDs. It publishes accepted
declarations as the read-only `portalContributionsApiRef.scaffolderFields`
snapshot without invoking widget loaders.

`createPortalScaffolderPage` is an optional consumer adapter. When its route is
opened, it supplies the shared declarations to the templates implementation.
`NativeScaffolderFields` checks configuration, experience availability,
permissions, and reserved field names before loading widgets. The returned
field name must match the declaration; value/UI schemas and asynchronous
validators remain part of the existing field contract.

Without a templates adapter, declarations remain discoverable but unused. No
widget is loaded and no missing templates-page attachment is required. An
alternative templates plugin can use the same adapter without taking the
`portal-scaffolder` plugin ID. Field discovery does not make workflows runnable
without a templates host. Application/deployment selection is separate from
field discovery and does not itself extract the existing content pages.
Root routing is configured separately through the Portal host's landing
destination.

### Migrating field attachments

Prerequisites: install the shared Portal provider and build the host, templates
adapter, and native contributors from a coordinated SDK revision.

1. Keep existing `ScaffolderFieldBlueprint.make` descriptors, field names, manifest
   IDs, widget schemas, and validation functions. Rebuild the shared API and host
   packages, then rebuild/re-export the consuming native plugins together.
2. Remove explicit NFS attachment overrides targeting
   `page:portal-scaffolder/templates`. The Blueprint now defaults to
   `api:portal/contributions`, input `scaffolderFields`. Do not restore a second
   page collector or legacy registration side effects.
3. Keep `createPortalScaffolderPage` for the templates route. Custom composition
   tests must install `createPortalContributionProvider()` in the `portal` plugin,
   just as the real app does. The page helper retains its loader/route options;
   an explicit `hostApiVersion` adds an adapter-specific restriction to the
   provider's version validation.

Verify that a permitted field renders with the templates host installed and
that removing that host leaves the declaration inspectable without calling its
widget loader. The field tests in the repository verification command exercise
both cases. Coordinated rebuilds are required; this migration does not promise
mixed old/new dynamic artifact compatibility or require npm publication.

## Contribution contract

`EntityDetailTabBlueprint.make` accepts a name and a descriptor:

- `manifest`: plugin metadata and capability declarations.
- `capabilityId`, `entryPointId`: references to the capability and entity-tab
  entry point. Labels, order, content scope, and permission come from the entry.
- `attachment`: exactly `entity.detail.tabs` for this contract.
- `loader`: deferred component loader receiving the current subject.
- `appliesToSourceKinds`: optional source constraints.
- `enabledByConfig`: optional configuration key; explicit `true` is required.
- `requiredEntitlements`: optional IDs declared in the manifest.
- `isApplicable`: optional synchronous or asynchronous predicate. It narrows
  scope; it cannot broaden it. Exceptions suppress the tab.

The entry must have kind `entity-tab`, surface `entity-page`, and a slot launch
targeting `entity.detail.tabs`. Its content scope must be non-empty, known, and
within capability scope. Runtime predicates stay on the descriptor, not in
serializable capability metadata.

The host checks ownership against the actual NFS plugin, API compatibility,
references, region, content scope, and duplicate IDs. Invalid descriptors are
logged and omitted without removing the rest of the page. Filtering proceeds
through content/source scope, experience/configuration, permission, entitlement,
and predicate before component loading. Selected components are error-bounded.

### Supported native launches

The [internal developer-preview contract](portal-sdk-plugin-author-guide.md#internal-developer-preview-contract)
defines the author-facing boundary and proposed compatibility policy. Native
launch support is limited to the following combinations:

- Slots render through the matching declared Blueprint and its allowed host
  region. The host does not resolve arbitrary `moduleName` values.
- Entity and catalog item actions dispatch registered operations for the
  current subject.
- Entity operation actions may select an eligible detail tab after a successful
  response. The manifest follow-on must target `entity.detail.tabs`, and the
  descriptor must identify the matching tab with `followOnEntryPointId`. The
  destination must also pass eligibility checks. Selection does not wait for a
  background job to complete.
- Catalog-header workflow actions resolve owner-prefixed workflow IDs through
  `ScaffolderWorkflowBlueprint` to template entity references, not supplied URLs.

Catalog item action follow-ons, operation-to-workflow follow-ons, arbitrary
launch chains, and workflow launches on other action surfaces are unsupported.
The common `CapabilityLaunch` union is broader than the native renderer subset;
legacy launcher behavior is not the native contract.

## APME entry point

`@ansible/plugin-backstage-apme/alpha` default-exports an `apme` frontend plugin.
It declares the Quality tab, overview summary, scan action, catalog action,
and repository URL field, and registers the existing
API factory through `ApiBlueprint`. It does not import `plugin.ts` or register
legacy contributions.

The native declarations also cover repository Quality activity and Dependencies,
catalog Quality/settings/Violations tabs, table columns, the Add repository
workflow launcher, and deregistration. Scanning requires
`ansible.apme.enabled: true` and the host-resolved
`apme.scanning` entitlement. Configuration alone is not an entitlement decision.

The complete repository UI journey still uses portal-scaffolder's Git Repositories
list/detail pages and its Templates UI for Add repository. APME has no declared
package dependency on portal-scaffolder, but these presentation and navigation
paths still require their current host. Its Content Quality route redirects into
the repository catalog. Collecting fields independently does not extract those
pages or make that full UI journey available without them.

## Acceptance boundaries

- The profile-only native header adapter requires a fresh packed `next-2.1`
  acceptance run to verify that Create is absent and exactly one Sign out item
  completes the configured OIDC flow. Earlier header checks do not certify this
  revised composition. Intermittent OAuth/revocation transport errors remain
  separate from header wiring.
- Earlier packed `next-2.1` content checks used mock AAP authentication. The source NFS
  app was verified with real AAP login and two completed standalone checks on
  the existing `my-ns-my-col` test repository. Persisted scan count increased
  from two to four, with one finding. APME refreshes its summary while a
  background operation is active, then stops polling; the Portal host does not
  need scan-specific logic. No remediation, branch, or PR was applied.
- The named `test-amazon-aws` manual entry was re-registered through the native
  field/workflow and deregistered through its native entity action. Catalog
  count changed from 123 to 124 to 123; confirmed removal redirected without a
  manual page reload. The existing APME project ID and zero-scan history were
  unchanged. These counts are test evidence, not expected deployment defaults.
- The earlier AWS dependency-resolution failure is not evidence against native
  discovery, but scans of that larger repository still need their own successful
  assessment evidence. Do not weaken Galaxy server validation to make them pass.
- Complete content extraction, query/write contracts, and picker migration.
- Compatibility validation is intentionally limited to `next-2.1` for this slice.
  The AAP resolver validates caller memberships against configured organizations.
  REST operations, registration adapters, and APME interactive workflows use the
  same resolver, independently of identity namespace. Any granted membership
  enables a shared capability, subject to operation and repository RBAC. Multiple
  memberships do not select an active organization for organization-specific
  handlers. Git repositories need no AAP ownership annotation or namespace
  mapping; new manual entries stay in `default`. Remaining legacy mutations and
  automatic scan policy are not guarantees supplied by frontend gates. See the
  [operations backend policy](../plugins/portal-operations-backend.md).
- The native app does not import APME's legacy entry point for registration side
  effects. The explicitly selected legacy fallback still has its own registration.
  Do not install both registration paths in the same native app.

## Navigation and local app shell

### Loading AAP authentication in a dynamic host

The `@ansible/aap-app-auth` frontend module owns the AAP OAuth API and
sign-in page. A dependency in `portal-scaffolder/package.json` does not install
that module into an RHDH host. Each NFS deployment using AAP authentication
must explicitly load its exported dynamic artifact alongside the Portal plugins.

With the exported tarball available in the host's local plugin directory, add
this entry to the deployment's `dynamic-plugins.yaml` `plugins` list:

```yaml
plugins:
  - package: ./local-plugins/portal/ansible-aap-app-auth-dynamic-0.1.0.tgz
    disabled: false
```

For a workspace-mounted development export, use the directory instead:

```yaml
plugins:
  - package: ./local-plugins/portal-nfs/aap-app-auth
    disabled: false
```

These are alternative artifact paths, not two registrations. Adjust the path
to match the deployment's exported artifact. NFS discovers the module's
`./alpha` entry point from its package metadata; no Scalprum `signInPage` or
`apiFactories` configuration is required.

After exporting and restarting the host, verify that `api:app/rhaap-auth` and
`sign-in-page:app/rhaap` are discovered. An absent AAP sign-in page or an
unresolved `ansible.auth.rhaap` API is a reason to check the installed dynamic
plugin list, not to restore authentication exports in portal-scaffolder.

### Landing behavior

The Portal host owns `/`. With no `portal.landingPage` override, it opens
`/self-service` only if that NFS page is mounted. If no destination is available,
Portal displays a neutral welcome message inside the existing app shell instead
of redirecting to a missing page. This fallback is not a separate content catalog
or a new homepage design.

An explicit override must match an installed top-level NFS page's effective
path, including any NFS page-path configuration override. The host checks
mounted metadata without invoking page loaders. It rejects external URLs,
relative paths, `/`, dot segments, encoded paths, query strings, fragments,
trailing slashes, and arbitrary descendants of a registered page. A missing or
disabled destination also uses the fallback. An invalid explicit override does
not silently select Templates or the first sidebar item.

Landing selection is not authorization: navigation enters the page through its
normal NFS lifecycle, and the destination retains its permission checks. A
restricted destination may show its normal access-denied state. Sidebar
ordering and visibility do not grant access or change landing selection.

### Configuring the landing destination

Prerequisites: install the Portal native frontend host and the destination page
in the NFS app. No additional landing configuration is needed for the default
Templates behavior; omit `portal.landingPage` in the minimal configuration.

1. To override the default, set the exact installed page path in host config:

   ```yaml
   portal:
     landingPage: /self-service/collections
   ```

   This is the complete landing configuration; the field is optional. Paths
   are app-relative: if the app is hosted under a URL prefix, do not include
   that prefix or a host name in this value.

2. Restart the source app after changing configuration. For RHDH, export/install
   the updated Portal artifact and restart the host with the configuration.
3. Open the app root. Verify that it opens the selected page and that the page's
   normal permission checks still apply. With an unavailable destination, verify
   the neutral fallback rather than a missing-page redirect.

Migration: existing deployments with Templates at `/self-service` need no new
setting. If NFS configuration moves that page, set `portal.landingPage` to its
effective path. Deployments without portal-scaffolder may select another
installed page or leave the host fallback. This does not remove portal-scaffolder
from source-app or installer composition; deployment selection is separate.

Verify the routing behavior with:

```bash
yarn test --runInBand workspaces/portal-core/plugins/portal-core
```

The tests cover configured and default destinations, absent and disabled
contributors, page-path overrides, unsafe destinations, lazy-loader isolation,
and destination permission denial.

### Configuring navigation

Plugins own page routes and icon metadata. Portal navigation selects discovered
pages; it does not install plugins or grant permissions. The self-service native
pages provide the same Home, History, Build, Collections, and GitHub icons as
the legacy sidebar. RBAC and Settings retain their platform plugin icons.

Enable the Portal navigation adapter by disabling the stock singleton attachment:

```yaml
app:
  extensions:
    - nav-content:app/sidebar: false
    - nav-content:app/portal: true
portal:
  navigation:
    items:
      - id: templates
        path: /self-service
        title: Templates
```

An item selects exactly one `path` or NFS `page` extension ID. Optional `title`
overrides its label, and `placement: bottom` pins it below the primary items.
An expandable group instead declares a title and child links:

```yaml
portal:
  navigation:
    topOffset: 64
    items:
      - id: administration
        title: Administration
        placement: bottom
        children:
          - id: rbac
            page: page:rbac
            title: RBAC
      - id: settings
        page: page:user-settings
        title: Settings
        placement: bottom
```

To make Administration navigate directly to RBAC, replace `children` with
`page: page:rbac`. This works for any item, not only Administration. Missing
plugin pages and empty groups are omitted; IDs and route targets must be unique.
Group icons inherit the first available child icon; icon overrides are not a
navigation config field. The `paths`/`bottomPaths` configuration remains a
compatibility fallback only when `items` is absent. Nested item data is exposed
through the host's `@deepVisibility frontend` schema.

The source app registers native RBAC, user settings, and Search features. Its
global header reuses the existing AAP/identity logout behavior through an
app-owned root wrapper. The global header has no Create button or
Create-contribution API. Workflow entry points remain in the installed pages.
RHDH retains its own platform header instead of loading
the source app wrapper. Guest users can see navigation but remain subject to
page permissions; an RBAC 403 is not a missing route.

Restart the source dev server after changing configuration or schema visibility.
Re-export and restart RHDH after changing dynamic plugins. The local development
guide in automation-portal-local documents workspace/packed exports, the full
navigation example, cache validators, and non-destructive refresh steps.

## Profile menu contributions

RHDH deployments install the optional `@ansible/portal-rhdh` native feature
alongside the platform global-header feature. The adapter only renders profile
items. To remove the stock Create button and use AAP Sign out, merge these entries
into the existing `app.extensions` list:

```yaml
app:
  extensions:
    - gh-component:global-header/self-service-button: false
    - gh-menu-item:global-header/logout: false
    - app-profile-menu-item:app/aap-logout: true
```

The profile consumer `gh-menu-item:portal-rhdh/profile` is enabled by default.
Enable the AAP item only when its separate auth module and backend provider are
installed and configured. Otherwise keep stock logout. Preserve other auth and
navigation entries. No replacement Create button is installed.

`AppProfileMenuItemBlueprint` contributes navigation or lazy UI-action rows to
the shared provider. `useNativeAppProfileMenuItems()` checks user identity,
declared permissions, configuration, and owned page targets. The shared SDK
`ProfileMenuItems` renders accepted rows, closes the menu before opening a new
UI surface, prevents duplicate activation while pending, and contains failures.
No action implementation loads just to decide visibility. Source and RHDH
consumers use the same resolver; new plugin items require no adapter edits.

The AAP auth module owns its disabled-by-default logout declaration and shared
logout implementation. `portal-rhdh` has no AAP dependency or logout-specific
extension. Enable `app-profile-menu-item:app/aap-logout` and keep the generic
`gh-menu-item:portal-rhdh/profile` consumer enabled. Rebuild the provider, adapter,
and AAP auth artifact together. The source NFS app explicitly installs
`createAapProfileModule({ logoutDisabled: false })` from `aap-app-auth`, without
replacing its existing sign-in composition.

The AAP-owned handler clears Portal auth and redirects to AAP OIDC logout;
legacy `global.header/profile` mount-point YAML is not its registration mechanism.
This integration does not change OAuth token-exchange handling or resolve
intermittent transport failures during initial sign-in.

## AAP OIDC logout

The existing logout component waits for identity sign-out before navigating to the
AAP logout destination. This prevents the identity proxy's final redirect from
overwriting the OIDC redirect. Transport failure during AAP token revocation
is still reported by the auth backend; a visible logged-out browser does not
prove successful server-side token revocation.

The AAP deployment must advertise `/o/logout/` as its OIDC end-session endpoint.
Set `auth.providers.rhaap.<environment>.clientId` to the public OAuth client ID.
The selected environment comes from `auth.environment`, which defaults to
`development`. The browser-facing AAP host comes from
`auth.providers.rhaap.<environment>.host`, falling back to `ansible.rhaap.baseUrl`.
Both the client ID and `app.baseUrl` are required whenever an AAP host resolves.

Register the serialized value of `app.baseUrl` (`new URL(appBaseUrl).href`) in the
OAuth application's **Post Logout Redirect URIs**. For example, configuring
`http://localhost:3000` sends `http://localhost:3000/`, including the trailing
slash. The registered URI must match exactly. The handler sends this serialized
URL as `post_logout_redirect_uri`, together with
the configured environment's public OAuth client ID. AAP validates the URL,
presents its confirmation screen, and returns to Portal sign-in after confirmation.
Cancelling leaves AAP's browser session active even though Portal auth is cleared.
The public OAuth host/client ID are frontend-visible; client secrets remain
backend-only. This does not bypass AAP validation or change gateway-wide settings.
See [logout setup](../plugins/portal-rhdh.md) and the adapter README for the
configuration and verification procedure.

See the [profile authoring example](portal-sdk-plugin-author-guide.md#declaring-a-profile-menu-item)
and [RHDH adapter reference](../plugins/portal-rhdh.md). Re-export the affected host,
adapter, and contributors after shared header-contract changes. Header integration
is verified on the agreed `next-2.1` baseline, not every RHDH version.

Upgrade deployments that configure only `ansible.rhaap.baseUrl` by adding
`auth.providers.rhaap.<environment>.clientId` and ensuring `app.baseUrl` is set.
If a host resolves but the client ID or Portal URL is missing or invalid, logout
reports "AAP browser logout is unavailable: check the OAuth client and Portal
URLs" and still clears Portal auth. It does not redirect to AAP, so the AAP
browser session remains active.

## Task history and RBAC

The native frontend provides Task history at `/self-service/create/tasks`, with
task details below that path. It has a separate navigation entry alongside the
template wizard. The stock RBAC frontend is a platform plugin, not a Portal
contribution; permission configuration alone does not install its UI. Native
deployment must explicitly enable its package without broadening administrator
identities or permission grants.

## Troubleshooting

### Installed contributor has no tab

Check `api:portal/contributions`, installed NFS features, current content type, configuration, experience,
permission, and entitlement decisions. Inspect `[Portal NFS] Rejected entity tab`
and `[Portal NFS] Cannot activate` diagnostics. Unsupported content is omitted,
not shown as an error.

### Task history or RBAC is missing

Open `/self-service/create/tasks` directly to distinguish missing navigation
from a route or permission failure. Check `page:portal-scaffolder/history` and
the deployed bundle. For RBAC, inspect installed dynamic packages and the
existing administrator configuration; do not bypass restrictions with broader grants.

### Template field is declared but unavailable

Inspect the NFS extension tree for the field under `api:portal/contributions`,
input `scaffolderFields`, and inspect the contribution API's validated field
list in a host integration or test. A valid declaration with no templates
consumer is intentionally unused; no widget import is expected.

If the field is missing from the snapshot, check native discovery, ownership,
manifest/version compatibility, and duplicate IDs or field names. If it is
present but an installed templates adapter does not expose it, check the
configuration, experience, permission, and reserved-name gates. Loader or widget
failures use the existing template-field error states. There is no separate
field diagnostics page or automatic fallback registration.

### Component fails to load

The selected tab displays a contained failure while the host page remains
available. Check the contribution ID, failed chunk request, remote assets, and
compatible platform versions before changing the contribution contract.
