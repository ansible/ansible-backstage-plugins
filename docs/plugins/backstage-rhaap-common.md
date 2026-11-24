# @ansible/backstage-rhaap-common

Compatibility library for existing consumers and remaining shared Git utilities. Source:
`workspaces/aap/plugins/backstage-rhaap-common`.

## Responsibilities

AAP exports forward to their new owners. SCM utilities and other not-yet-moved
shared exports remain here temporarily.

Backend modules consume `ansibleServiceRef` to access the AAP service through
dependency injection. Frontend consumers use browser-safe exports and the
Portal/backend API seams rather than transporting AAP credentials directly.

## AAP service registration

`@ansible/aap-node` owns the reusable `AAPClient`, configuration/organization
helpers, service contracts and references. `@ansible/aap-backend` supplies
`ansibleServiceFactory` and its loadable default export. The service ID remains
`rhaap.client.service`, with plugin scope and no default factory.

### Breaking installation change

The catalog default and alpha loaders no longer register the AAP client factory.
Every installation using AAP modules must explicitly install `@ansible/aap-backend`
or supply its own implementation of `ansibleServiceRef`. Updating imports or
embedding the package in a dynamic artifact does not install the service.

This requirement applies to catalog, auth, scaffolder and JIT user provisioning,
including installations that enable only some of those modules.

### Native Backstage hosts

Add the backend feature once in the host:

```ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();
backend.add(import('@ansible/aap-backend'));
backend.add(import('@ansible/backstage-plugin-catalog-backend-module-rhaap'));
backend.add(
  import('@ansible/backstage-plugin-auth-backend-module-rhaap-provider'),
);
backend.add(import('@ansible/plugin-scaffolder-backend-module-aap'));
backend.add(
  import(
    '@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner'
  ),
);
// Also install the underlying catalog, auth and scaffolder backend plugins.
```

Named module registrations need the same explicit service owner. A host that
provides a custom factory for `ansibleServiceRef` should register that factory
instead of `@ansible/aap-backend`; do not register two explicit factories for the
same service. The contract and all existing service IDs/scopes remain unchanged.

### RHDH dynamic installations

1. Export the backend with
   `yarn workspace @ansible/aap-backend export-dynamic --clean`.
2. Rebuild or obtain the updated catalog artifact for the selected split AAP
   module or deprecated combined shim, keeping the required default/alpha entry.
3. In the same deployment configuration update, replace the previous catalog
   artifact with that updated artifact and enable the backend's `dist-dynamic`
   artifact. Do this before restarting or rolling out the deployment. The old
   catalog loader registers the client factory automatically, even when the host
   has no explicit factory registration, and must not remain loaded alongside
   the new backend.
4. Remove any explicit legacy client factory registration if the deployment has
   one. Keep exactly one AAP service owner and choose either the split catalog
   modules or the deprecated combined catalog shim, never both.
5. Apply the combined configuration and restart or roll out the deployment.

Both the split AAP catalog and deprecated shim loaders require this explicit
client service installation. Their default and alpha entries do not supply the
AAP client factory.

For dynamic JIT provisioning, the split AAP catalog alpha entry supplies the
shared root `userProvisionerRef` factory. The deprecated shim default/alpha also
retain the organization resolver and shared root provisioner. The split default
entry does not supply those JIT adapters; source hosts can register them explicitly.
The user-provisioner module must register its callback, and the catalog must
connect its provider before JIT requests can succeed. Registration order alone
does not establish readiness; module initialization does not wait for connection.

`backstage-rhaap-common` keeps compatibility exports for external consumers.
Its deprecated factory adapter uses `AAPClient` and `ansibleServiceRef` from
`@ansible/aap-node` directly, without a production dependency on the backend.
Catalog/helper artifacts therefore embed shared libraries without embedding
`@ansible/aap-backend`; the host installs the backend artifact separately.
New client/helper consumers import node directly. Existing callers can retain
the old factory import until the common-package cleanup, but must not register
it alongside the explicitly installed backend factory.

## AAP import migration

`@ansible/backstage-rhaap-common` is deprecated for AAP usage inside
`workspaces/aap`. Import AAP types, permissions, constants and naming helpers
from `@ansible/aap-common`; the reusable client, configuration/organization
helpers, service contracts, references, user provisioning and shared scaffolder
ownership guard from `@ansible/aap-node`; and the installation factory from
`@ansible/aap-backend`.

Auth, the AAP-only scaffolder and the JIT provisioner have no direct dependency
on the legacy package, including their tests, development harnesses and dynamic
build configuration. The retired combined scaffolder package is not restored.
The standalone AAP module keeps its current `aap-api` autocomplete registration.

### Temporary catalog compatibility imports

The catalog split merged under AAP-98845 places its shared implementation in
`@ansible/backstage-rhaap-common/catalog`. Preserve that upstream ownership in
this stack. The remaining direct imports inside `workspaces/aap` are limited to:

- `catalog-backend-module-aap/src/module.ts`: `createCatalogModule`.
- `catalog-backend-module-aap/src/index.test.ts`:
  `resetCatalogModuleSliceGuardForTests`.
- `catalog-backend-module-rhaap/src/index.ts` and `src/module.ts`:
  `createRouter`, `CatalogModuleSlice` and `createCatalogModule`.
- `catalog-backend-module-rhaap/src/index.test.ts`: the router and slice-guard
  test helper, plus the matching catalog-subpath mock.

Both catalog packages retain the dependency and dynamic embedding needed for
that temporary catalog implementation. AAP clients, contracts, service refs,
permissions and organization helpers use the new libraries. Catalog-specific
compatibility cleanup should be coordinated with AAP-98845; the shared catalog
implementation is not relocated again by this client/service refactor.

SCM provider implementation now belongs to content-management, with shared
catalog adapters retained in the legacy package. The deprecated factory adapter
has no production dependency on backend. Retire it with the remaining legacy
common-package exports during follow-on cleanup.

Unmigrated AAP and catalog compatibility exports remain available during the
transition. The Phase 4 APME migration below retires its old entry points rather
than introducing a legacy-common dependency on an APME implementation. Complete
the catalog and SCM follow-on cleanup before removing the legacy package.

The old guard `Symbol.for` key and client log name remain unchanged for
compatibility. The node import-boundary regression check permits only the
listed catalog exports and rejects legacy AAP client/contract imports and
node-to-backend coupling.

## Phase 4: APME import migration

APME no longer imports, depends on or embeds this package. Use these existing
owner/SDK packages instead:

- Repository identity: `@ansible/backstage-apme-common/catalogEntity` and
  `@ansible/backstage-apme-common/normalizeRepoUrl`.
- Dev Spaces URL helpers: `@ansible/backstage-apme-common/devSpaces`.
- Settings permissions: `@ansible/backstage-apme-common/permissions`; their
  backend resource rules now live in APME's catalog module.
- Git Repositories extension/cache APIs: the corresponding
  `@ansible/portal-extension-api` subpaths.
- Shared repository-view permission: `@ansible/portal-extension-common`.
- SCM clients and token resolution: `@ansible/portal-plugin-node`.

The old `catalogEntity`, `devSpaces` and `permissionRules` entry points and the
APME settings exports are removed in the same update as their repository
consumers. Update external imports of those paths before using this revision.
The unused legacy config-reading Dev Spaces helper is not moved; the content
scaffolder's separate helper remains unchanged. Permission IDs/resource types,
repository keys, API IDs and URL/token behavior are preserved.

## Related modules

- [AAP catalog module](catalog.md): scheduled catalog synchronization.
- [AAP authentication](auth.md): authentication provider.
- [User provisioning](catalog-user-provisioner.md): on-demand catalog users.
- [AAP scaffolder module](scaffolder.md): resource creation and job launch actions.

For provider-specific connection configuration, use the related module's guide.
