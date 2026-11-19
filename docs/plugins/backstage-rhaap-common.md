# @ansible/backstage-rhaap-common

Shared AAP integration library. Source:
`workspaces/aap/plugins/backstage-rhaap-common`.

## Responsibilities

Provides the AAP client/service contracts, SCM utilities, resource types,
permissions, naming helpers, and user-provisioning service contracts.

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

## Related modules

- [AAP catalog module](catalog.md): scheduled catalog synchronization.
- [AAP authentication](auth.md): authentication provider.
- [User provisioning](catalog-user-provisioner.md): on-demand catalog users.
- [AAP scaffolder module](scaffolder.md): resource creation and job launch actions.

For provider-specific connection configuration, use the related module's guide.
